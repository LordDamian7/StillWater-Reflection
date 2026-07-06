# Stillwater

A private, anonymous self-reflection web app for exploring patterns of attraction and identity through 25 structured questions. **Not a diagnosis — it only mirrors your own answers, and only you define your identity.**

## Features
- 25-question Likert assessment across 7 dimensions, weighted scoring, confidence + contradiction detection
- AI-written gentle explanation (server-side Anthropic call) with a safe built-in fallback template
- First reflection free; retakes unlock the result for $1 (card / bank transfer / OPay — **demo checkout**, see below)
- Anonymous, consent-gated telemetry: pseudonymous UUIDs, hour-coarsened timestamps, bucketed scores, sanitized free text, schema-versioned, retention-capped
- Data controls: export result as text, export the full anonymized dataset, delete everything
- Insights dashboard: completions, average rating, drop-off, category distribution, event stream

## Run locally
```bash
npm install
cp .env.example .env.local   # add ANTHROPIC_API_KEY (optional)
npm run dev
```
Without `ANTHROPIC_API_KEY`, the app still works fully — explanations use the built-in template.

## Deploy (Vercel)
Set the environment variable in Vercel → Project → Settings → Environment Variables:
- `ANTHROPIC_API_KEY` (server-side only, used by `app/api/explain`)

## Honest scope notes
- **Payments are a demo.** No real money moves. Production integration (recommended: Paystack as primary for Nigeria, with the OPay tab routed through it) is designed in `docs/server-flow.md`, and the Supabase schema + RLS paywall + `unlock_paid_result()` function are already deployed to the companion Supabase project.
- **Persistence is per-browser** (localStorage). The multi-device, server-enforced version (Supabase anonymous auth + RLS) is specified in `docs/server-flow.md`.
- This app is for adults (18+ gate) and collects no PII by design.
