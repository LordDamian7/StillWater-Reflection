// POST /api/explain — generates the gentle AI explanation from anonymous scores.
// The Anthropic API key lives ONLY here (server-side). The client sends dimension
// scores and suggestion metadata — never names, answers, or identifiers.

export async function POST(req) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    // No key configured → client falls back to its built-in template.
    return Response.json({ error: "explanation_service_not_configured" }, { status: 503 });
  }

  let payload;
  try {
    payload = await req.json();
  } catch {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }

  // Strict allow-list: only the anonymous fields we expect are forwarded.
  const safeInput = {
    dimension_scores: payload?.dimension_scores ?? {},
    primary_pattern: String(payload?.primary_pattern ?? "").slice(0, 120),
    labels_worth_exploring: Array.isArray(payload?.labels_worth_exploring)
      ? payload.labels_worth_exploring.slice(0, 8).map((s) => String(s).slice(0, 80))
      : [],
    confidence: String(payload?.confidence ?? "").slice(0, 60),
    notes: Array.isArray(payload?.notes) ? payload.notes.slice(0, 4).map((s) => String(s).slice(0, 200)) : [],
  };

  const prompt = `You write gentle, non-clinical reflections for a private self-reflection tool about attraction and identity. You receive only anonymous dimension scores — no personal identifiers.

STRICT RULES:
- Never say "you are" or "you are definitely" any identity. Use "your answers suggest", "may be worth exploring", "could reflect".
- Never pressure toward any label. Always state that identity is self-defined and labels are optional.
- No medical, clinical, or diagnostic claims. No explicit sexual language.
- Warm, calm, respectful tone. No judgment.

Input data:
${JSON.stringify(safeInput, null, 2)}

Respond with ONLY a valid JSON object — no markdown, no backticks, no preamble — with exactly these keys:
{
  "summary": "2-3 sentences summarizing what the answers suggest, gently",
  "patterns": "2-3 sentences about the notable patterns and any tensions in the answers",
  "labels": "2-3 sentences naming the labels worth exploring, framed as optional",
  "reflection_prompts": ["prompt 1", "prompt 2", "prompt 3"]
}`;

  try {
    const upstream = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1000,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!upstream.ok) return Response.json({ error: "upstream_error" }, { status: 502 });

    const data = await upstream.json();
    const text = (data.content || [])
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("\n");
    const parsed = JSON.parse(text.replace(/```json|```/g, "").trim());

    // Server-side shape + safety validation, mirroring the client's checks.
    const ok =
      typeof parsed.summary === "string" &&
      typeof parsed.patterns === "string" &&
      typeof parsed.labels === "string" &&
      Array.isArray(parsed.reflection_prompts) &&
      parsed.reflection_prompts.length >= 2 &&
      !/you are definitely|you must be|this proves|diagnos/i.test(
        parsed.summary + parsed.patterns + parsed.labels
      );
    if (!ok) return Response.json({ error: "invalid_output" }, { status: 502 });

    return Response.json({
      summary: parsed.summary,
      patterns: parsed.patterns,
      labels: parsed.labels,
      reflection_prompts: parsed.reflection_prompts.slice(0, 3),
    });
  } catch {
    return Response.json({ error: "generation_failed" }, { status: 502 });
  }
}
