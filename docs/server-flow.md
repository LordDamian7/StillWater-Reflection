# Stillwater — Production Server Flow
Next.js (API routes) · Supabase (Postgres + anonymous auth + RLS) · Stripe (PaymentIntents) · Anthropic API (server-side)

The core security principle: **the lock lives on the server.** Scoring, the free-trial check, the result lock, and the AI explanation all happen server-side, so no client refresh, storage wipe, or devtools trick can reveal an unpaid result or reset the free trial.

---

## 1. The flow, end to end

```
CLIENT                          SERVER (Next.js API)                 SUPABASE / STRIPE
──────                          ────────────────────                 ─────────────────
signInAnonymously() ──────────────────────────────────────────────▶  anon user (auth.uid = anon_id)

POST /api/assessments ────────▶ create assessment                ──▶ assessments (in_progress)
                                server counts prior completions:
                                run_type = free | paid

POST /api/assessments/:id/     autosave answers (batched)        ──▶ responses
     responses  (repeat)

POST /api/assessments/:id/    ▶ SCORE SERVER-SIDE
     complete                   write result:
                                  free  → status 'unlocked'      ──▶ results
                                  paid  → status 'locked'
                                return { locked: true|false }

── locked path ──────────────────────────────────────────────────────────────────────
POST /api/payments/intent ────▶ create Stripe PaymentIntent      ──▶ stripe: $1.00,
                                (idempotency key = assessment_id)    metadata.assessment_id
                                return client_secret

[Stripe.js Elements confirms card — raw card never touches our server]

stripe ──▶ POST /api/webhooks/stripe
                                verify signature
                                payment_intent.succeeded:
                                  payments.status = 'paid'       ──▶ payments
                                  results.status  = 'unlocked'   ──▶ results (service role)

GET /api/results/:id ─────────▶ RLS returns row only if unlocked
                                first read: call Anthropic API
                                (server key), cache explanation  ──▶ results.ai_explanation
                                return summary + result
```

**Bank transfer branch:** `POST /api/payments/transfer` writes a `payments` row with
`status='pending_transfer'` and a unique `transfer_reference` (shown to the user).
A reconciliation worker (webhook from a banking provider such as Wise/Increase, or a
cron job reading bank statements, or a manual admin action) matches incoming credits
by reference → marks paid → unlocks the result. The client polls `GET /api/results/:id`
and reveals when the lock lifts.

---

## 2. Schema (Supabase migration)

```sql
-- Anonymous users come from Supabase anonymous auth; auth.uid() IS the anon id.
-- No PII columns exist anywhere in this schema.

create table assessments (
  id           uuid primary key default gen_random_uuid(),
  anon_id      uuid not null references auth.users(id) on delete cascade,
  session_id   uuid not null,
  run_type     text not null check (run_type in ('free','paid')),
  status       text not null default 'in_progress'
               check (status in ('in_progress','completed')),
  created_at   timestamptz not null default date_trunc('hour', now()),
  completed_at timestamptz
);

create table responses (
  id            bigint generated always as identity primary key,
  assessment_id uuid not null references assessments(id) on delete cascade,
  question_id   smallint not null check (question_id between 0 and 24),
  answer_value  smallint not null check (answer_value between 0 and 4),
  unique (assessment_id, question_id)
);

create table results (
  id                    uuid primary key default gen_random_uuid(),
  assessment_id         uuid not null unique references assessments(id) on delete cascade,
  scores_json           jsonb not null,
  primary_suggestion    text not null,
  secondary_suggestions jsonb not null,
  confidence            smallint not null,
  ai_explanation        jsonb,                -- cached after first unlocked read
  status                text not null default 'locked'
                        check (status in ('locked','unlocked')),
  unlocked_at           timestamptz
);

create table payments (
  id                 uuid primary key default gen_random_uuid(),
  assessment_id      uuid not null references assessments(id),
  provider           text not null check (provider in ('stripe','transfer')),
  provider_ref       text,                   -- PaymentIntent id / bank txn id
  transfer_reference text unique,            -- e.g. SW-9X2K4A, transfer branch only
  amount_cents       integer not null default 100,
  currency           text not null default 'usd',
  status             text not null default 'pending'
                     check (status in ('pending','pending_transfer','paid','failed')),
  created_at         timestamptz not null default now()
);
-- Note: payments are financial records — retained on user data deletion,
-- but they reference only assessment ids, never reflection content.

create table ratings (
  id         bigint generated always as identity primary key,
  result_id  uuid not null references results(id) on delete cascade,
  rating     smallint not null check (rating between 1 and 10),
  feedback   text check (char_length(feedback) <= 500),  -- sanitized server-side too
  created_at timestamptz not null default date_trunc('hour', now())
);

create table events (                          -- anonymous telemetry stream
  id             bigint generated always as identity primary key,
  anon_id        uuid not null,
  session_id     uuid not null,
  event          text not null,
  ts_hour        timestamptz not null default date_trunc('hour', now()),
  payload        jsonb not null default '{}',
  schema_version smallint not null default 1,
  consent_version text not null
);
```

## 3. Row Level Security — the lock is a database policy

```sql
alter table assessments enable row level security;
alter table responses   enable row level security;
alter table results     enable row level security;
alter table payments    enable row level security;
alter table ratings     enable row level security;
alter table events      enable row level security;

-- Users see only their own rows
create policy own_assessments on assessments
  for all using (anon_id = auth.uid());

create policy own_responses on responses
  for all using (exists (select 1 from assessments a
                         where a.id = assessment_id and a.anon_id = auth.uid()));

-- THE PAYWALL, enforced by Postgres itself:
-- a locked result is invisible to its own user until the webhook unlocks it.
create policy read_unlocked_results on results
  for select using (
    status = 'unlocked'
    and exists (select 1 from assessments a
                where a.id = assessment_id and a.anon_id = auth.uid())
  );
-- No insert/update policies for users: results are written and unlocked
-- exclusively by the service-role key (server only). Same for payments.status.

create policy own_events_insert on events
  for insert with check (anon_id = auth.uid());
```

## 4. API routes (essentials)

```ts
// POST /api/assessments — start; server decides free vs paid
const { count } = await admin.from('assessments')
  .select('*', { count: 'exact', head: true })
  .eq('anon_id', user.id).eq('status', 'completed');
const run_type = count === 0 ? 'free' : 'paid';   // free trial lives HERE, not client
```

```ts
// POST /api/assessments/[id]/complete — score server-side, lock if paid
const responses = await admin.from('responses').select().eq('assessment_id', id);
if (responses.data.length < 25) return res.status(400).json({ error: 'incomplete' });
const r = scoreAssessment(responses.data);         // same engine, now server-side
await admin.from('results').insert({
  assessment_id: id, scores_json: r.scores,
  primary_suggestion: r.primary, secondary_suggestions: r.secondary,
  confidence: r.confidence,
  status: assessment.run_type === 'free' ? 'unlocked' : 'locked',
});
return res.json({ locked: assessment.run_type !== 'free' });
```

```ts
// POST /api/payments/intent
const intent = await stripe.paymentIntents.create(
  { amount: 100, currency: 'usd', metadata: { assessment_id } },
  { idempotencyKey: `assess-${assessment_id}` }    // retry-safe, no double charge
);
```

```ts
// POST /api/webhooks/stripe — the ONLY place a result gets unlocked (card path)
const event = stripe.webhooks.constructEvent(rawBody, sig, WEBHOOK_SECRET); // verify!
if (event.type === 'payment_intent.succeeded') {
  const { assessment_id } = event.data.object.metadata;
  await admin.from('payments').update({ status: 'paid', provider_ref: event.data.object.id })
    .eq('assessment_id', assessment_id);
  await admin.from('results')
    .update({ status: 'unlocked', unlocked_at: new Date().toISOString() })
    .eq('assessment_id', assessment_id);
}
```

```ts
// GET /api/results/[assessmentId] — reveal; generate AI explanation on first read
const result = await userClient.from('results').select()...;   // RLS hides locked rows
if (!result.data) return res.status(402).json({ locked: true });
if (!result.data.ai_explanation) {
  const explanation = await callAnthropic(result.data);        // server-side key,
  // validated shape + safety scan, falls back to template     // scores only
  await admin.from('results').update({ ai_explanation: explanation }).eq('id', result.data.id);
}
```

```ts
// DELETE /api/me — user data deletion
// Deletes assessments (cascades to responses/results/ratings) + events,
// then deletes the anonymous auth user so the anon_id itself is gone.
// Payments are retained as financial records; usage counting survives because
// it can be derived from payments + a completions counter kept per hashed id.
```

## 5. Environment variables

```
SUPABASE_URL / SUPABASE_ANON_KEY          → client
SUPABASE_SERVICE_ROLE_KEY                 → server only (unlocks results)
STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET → server only
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY        → client (Elements)
ANTHROPIC_API_KEY                         → server only
```

## 6. What this buys over the prototype

| Prototype weakness | Server fix |
|---|---|
| Refresh at paywall loses answers | Answers persisted; result waits locked in DB |
| Client could re-derive scores pre-payment | Scoring server-side; locked rows invisible via RLS |
| Free trial counter lives client-side | Counted from completed assessments per anon_id |
| Demo charge stub | Real PaymentIntent + signature-verified webhook, idempotent |
| AI key would be exposed | Key server-side; explanation cached per result |
