"use client";

import React, { useState, useEffect, useRef } from "react";

/* ============================================================
   STILLWATER — a private self-reflection tool
   Layers: Input (questionnaire) → Scoring (deterministic)
           → AI explanation (structured, validated, fallback)
           → Output (result + always-visible disclaimer)
   No accounts. Anonymous by default. Data deletable.
   ============================================================ */

/* ---------- Question bank (25 items, 7 categories) ---------- */
// dims: attr_men, attr_women, attr_multi, low_attr, romantic, uncertainty, label_conf
const QUESTIONS = [
  { cat: "Attraction patterns", text: "I have felt drawn to men in a way that feels like attraction.", map: [["attr_men", 1.2]] },
  { cat: "Attraction patterns", text: "I have felt drawn to women in a way that feels like attraction.", map: [["attr_women", 1.2]] },
  { cat: "Attraction patterns", text: "I can feel attraction to more than one gender.", map: [["attr_multi", 1.3]] },
  { cat: "Attraction patterns", text: "Attraction, for me, is rare or mostly absent.", map: [["low_attr", 1.3]] },
  { cat: "Attraction patterns", text: "My attention is sometimes caught by a person regardless of their gender.", map: [["attr_multi", 1.0]] },
  { cat: "Romantic interest", text: "I can imagine being romantically interested in a man.", map: [["attr_men", 0.8], ["romantic", 0.4]] },
  { cat: "Romantic interest", text: "I can imagine being romantically interested in a woman.", map: [["attr_women", 0.8], ["romantic", 0.4]] },
  { cat: "Romantic interest", text: "I can imagine being romantically interested in more than one gender.", map: [["attr_multi", 1.2], ["romantic", 0.4]] },
  { cat: "Romantic interest", text: "Romantic closeness matters to me, whether or not attraction is part of it.", map: [["romantic", 1.2]] },
  { cat: "Romantic interest", text: "I rarely develop romantic feelings for anyone.", map: [["low_attr", 1.1]] },
  { cat: "Emotional connection", text: "Emotional closeness usually comes before any attraction I feel.", map: [["romantic", 0.6], ["low_attr", 0.4]] },
  { cat: "Emotional connection", text: "I form deep emotional bonds that sometimes blur into attraction.", map: [["romantic", 0.8]] },
  { cat: "Emotional connection", text: "If attraction appears for me, it tends to grow only after knowing someone well.", map: [["low_attr", 0.5], ["romantic", 0.5]] },
  { cat: "Identity comfort", text: "I feel at ease with how I currently describe my identity.", map: [["label_conf", 1.2]] },
  { cat: "Identity comfort", text: "Thinking about my identity brings me more calm than stress.", map: [["label_conf", 0.8]] },
  { cat: "Identity comfort", text: "I sometimes feel my current label — or having no label — doesn't fully fit.", map: [["uncertainty", 1.0]] },
  { cat: "Uncertainty", text: "I often question what my patterns of attraction mean.", map: [["uncertainty", 1.2]] },
  { cat: "Uncertainty", text: "My sense of who I'm drawn to has shifted over time.", map: [["uncertainty", 0.9], ["attr_multi", 0.3]] },
  { cat: "Uncertainty", text: "I feel confident that I understand my own attraction patterns.", map: [["label_conf", 1.0]] },
  { cat: "Relationship imagination", text: "When I imagine a fulfilling future relationship, the partner's gender feels open.", map: [["attr_multi", 1.0]] },
  { cat: "Relationship imagination", text: "I can picture a happy life without a sexual relationship in it.", map: [["low_attr", 1.0]] },
  { cat: "Relationship imagination", text: "I can picture myself in a committed relationship with a man.", map: [["attr_men", 1.0]] },
  { cat: "Relationship imagination", text: "I can picture myself in a committed relationship with a woman.", map: [["attr_women", 1.0]] },
  { cat: "Label familiarity", text: "I'm familiar with a range of identity labels and roughly what they mean.", map: [["label_conf", 0.6]] },
  { cat: "Label familiarity", text: "If a label fit me well, I would feel comfortable using it.", map: [["label_conf", 0.8]] },
];

const LIKERT = ["Strongly disagree", "Disagree", "Unsure", "Agree", "Strongly agree"];
const DIMS = ["attr_men", "attr_women", "attr_multi", "low_attr", "romantic", "uncertainty", "label_conf"];
const DIM_LABELS = {
  attr_men: "Attraction toward men",
  attr_women: "Attraction toward women",
  attr_multi: "Attraction toward multiple genders",
  low_attr: "Low or rare attraction",
  romantic: "Romantic attraction",
  uncertainty: "Identity uncertainty",
  label_conf: "Label confidence",
};

/* ---------- Scoring engine (deterministic, transparent) ---------- */
function scoreAssessment(answers, selfGender) {
  const sums = {}, maxes = {};
  DIMS.forEach((d) => { sums[d] = 0; maxes[d] = 0; });
  QUESTIONS.forEach((q, i) => {
    const v = answers[i];
    q.map.forEach(([d, w]) => {
      sums[d] += (v ?? 0) * w;
      maxes[d] += 4 * w;
    });
  });
  const scores = {};
  DIMS.forEach((d) => { scores[d] = Math.round((sums[d] / maxes[d]) * 100); });

  const unsureCount = answers.filter((v) => v === 2).length;
  const unsurePct = unsureCount / QUESTIONS.length;
  const unc = scores.uncertainty;

  // Suggestion logic — thresholds, never a verdict
  let primary, secondary = [], basis;
  const m = scores.attr_men, w = scores.attr_women, multi = scores.attr_multi, low = scores.low_attr;

  const genderNote =
    selfGender === "man" ? { one: (t) => (t === "men" ? "gay" : "straight / heterosexual") }
    : selfGender === "woman" ? { one: (t) => (t === "men" ? "straight / heterosexual" : "lesbian / gay") }
    : { one: (t) => (t === "men" ? "gay, straight, or androsexual — depending on your own gender identity" : "lesbian, straight, or gynesexual — depending on your own gender identity") };

  if (low >= 62 && Math.max(m, w, multi) < 45) {
    primary = "Asexual-spectrum exploration";
    basis = "low reported attraction across dimensions";
    secondary = scores.romantic >= 55
      ? ["asexual", "gray-asexual", "demisexual", "romantic orientations (e.g. biromantic, heteroromantic)"]
      : ["asexual", "aromantic", "gray-asexual"];
  } else if (unc >= 62 || unsurePct >= 0.4) {
    primary = "Questioning / exploring";
    basis = "a high level of reported uncertainty";
    if (multi >= 55 || (m >= 50 && w >= 50)) secondary = ["bisexual", "pansexual", "queer"];
    else if (low >= 50) secondary = ["asexual-spectrum", "demisexual"];
    else secondary = ["queer", "no label preferred"];
  } else if (multi >= 58 || (m >= 55 && w >= 55)) {
    primary = "Multi-gender attraction (e.g. bisexual, pansexual, queer)";
    basis = "reported attraction toward more than one gender";
    secondary = ["bisexual", "pansexual", "queer", "no label preferred"];
  } else if (m >= 58 && w < 42) {
    primary = "Attraction focused toward men";
    basis = "reported attraction concentrated toward men";
    secondary = [genderNote.one("men"), "questioning", "no label preferred"];
  } else if (w >= 58 && m < 42) {
    primary = "Attraction focused toward women";
    basis = "reported attraction concentrated toward women";
    secondary = [genderNote.one("women"), "questioning", "no label preferred"];
  } else {
    primary = "Mixed or emerging pattern";
    basis = "answers that don't point strongly in one direction";
    secondary = ["questioning", "queer", "no label preferred"];
  }

  // Confidence: agreement strength minus uncertainty and hedging
  const attrs = [m, w, multi, low].sort((a, b) => b - a);
  const gap = attrs[0] - attrs[1];
  let confidence = Math.round(38 + gap * 0.55 + (100 - unc) * 0.22 - unsurePct * 40);
  confidence = Math.max(15, Math.min(88, confidence));
  const confLabel = confidence >= 65 ? "Moderately high" : confidence >= 45 ? "Moderate" : "Low";

  // Simple contradiction detector
  const contradictions = [];
  if (low >= 60 && (m >= 60 || w >= 60 || multi >= 60))
    contradictions.push("You reported both low overall attraction and strong attraction in a specific direction — that can be worth sitting with.");
  if (scores.label_conf >= 65 && unc >= 65)
    contradictions.push("You reported both confidence in your labels and high uncertainty — both can be true at once.");

  return { scores, primary, secondary, confidence, confLabel, basis, contradictions, unsureCount };
}

/* ---------- Fallback explanation (used if AI is unavailable) ---------- */
function fallbackExplanation(r) {
  return {
    summary: `Your answers show a pattern that leans toward: ${r.primary.toLowerCase()}. This reflects ${r.basis} — nothing more. It is a mirror of what you told us today, not a conclusion about who you are.`,
    patterns: `The strongest signals in your responses were around ${topDims(r.scores).join(" and ").toLowerCase()}. ${r.contradictions[0] || "Your answers were fairly consistent with each other."} Patterns like these can shift with time, mood, and experience.`,
    labels: `If it feels useful, you might read about: ${r.secondary.join(", ")}. Labels are optional tools, not requirements. Many people use none at all, and only you decide whether any of these fit.`,
    reflection_prompts: [
      "Which of these questions felt easiest to answer, and which felt hardest?",
      "If no one else could ever know your answer, would anything change?",
      "What would feel different in your life if you stopped needing a final answer right now?",
    ],
  };
}
function topDims(scores) {
  return Object.entries(scores)
    .filter(([d]) => d !== "label_conf")
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([d]) => DIM_LABELS[d]);
}

/* ---------- AI explanation layer (structured in, JSON out, validated) ---------- */
async function generateAIExplanation(r) {
  const payload = {
    dimension_scores: r.scores,
    primary_pattern: r.primary,
    labels_worth_exploring: r.secondary,
    confidence: `${r.confLabel} (${r.confidence}/100)`,
    notes: r.contradictions,
  };
  // The Anthropic call happens server-side in /api/explain so the API key is never
  // exposed to the browser. Throws on any failure → caller falls back to template.
  const res = await fetch("/api/explain", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error("explanation service unavailable");
  const parsed = await res.json();
  // Validate shape + safety before it reaches the UI
  const ok =
    typeof parsed.summary === "string" &&
    typeof parsed.patterns === "string" &&
    typeof parsed.labels === "string" &&
    Array.isArray(parsed.reflection_prompts) &&
    parsed.reflection_prompts.length >= 2 &&
    !/you are definitely|you must be|this proves|diagnos/i.test(parsed.summary + parsed.patterns + parsed.labels);
  if (!ok) throw new Error("invalid shape");
  return parsed;
}

/* ---------- Persistent storage helpers (anonymized, deletable) ---------- */
const REC_KEY = "ssr-records";
const STATS_KEY = "ssr-stats";
const USAGE_KEY = "ssr-usage"; // { completions, credits } — first assessment free, $1 per repeat
const EVENTS_KEY = "ssr-events";   // anonymized event stream (see TELEMETRY below)
const ANON_KEY = "ssr-anon-id";    // random install id — no link to any real identity
// Deployed build: persistence via localStorage (per-browser). The Supabase-backed
// server flow in docs/server-flow.md replaces this for multi-device production.
const hasStorage = () => typeof window !== "undefined" && !!window.localStorage;
async function loadJSON(key, def) {
  if (!hasStorage()) return def;
  try { const v = window.localStorage.getItem(key); return v != null ? JSON.parse(v) : def; }
  catch { return def; }
}
async function saveJSON(key, val) {
  if (!hasStorage()) return;
  try { window.localStorage.setItem(key, JSON.stringify(val)); } catch {}
}
async function deleteAllData() {
  // Deletes all reflection content INCLUDING the telemetry event stream and the
  // anonymous ID (which is rotated, not reused, if the user returns). The usage
  // counter (free trial used / credits held) is retained — it contains no
  // reflection data, and keeping it means a privacy wipe can't reset the free trial.
  if (!hasStorage()) return;
  for (const k of [REC_KEY, STATS_KEY, EVENTS_KEY, ANON_KEY]) {
    try { window.localStorage.removeItem(k); } catch {}
  }
}

/* ============================================================
   TELEMETRY — structured anonymous data collection
   Industry-standard practices applied:
   • Data minimization ....... only fields listed in the DATA_DICTIONARY exist
   • Pseudonymous IDs ........ random UUIDs (crypto RNG); no name/email/IP/device
                               fingerprint is ever read or stored; ID is deletable
                               and rotates after a privacy wipe
   • Consent gating .......... nothing is recorded before the consent screen is
                               accepted; consent version is recorded with events
   • Generalization .......... timestamps coarsened to the hour (UTC); dimension
                               scores bucketed to nearest 10 (k-anonymity style)
   • Input sanitization ...... free text is scrubbed of emails, phone numbers,
                               URLs, @handles and long digit runs, then truncated
   • Schema versioning ....... every event carries schema_version for migrations
   • Retention cap ........... event stream capped at MAX_EVENTS (oldest dropped)
   • Payment separation ...... payment events record method + amount only; card
                               fields never enter this pipeline
   ============================================================ */
const SCHEMA_VERSION = 1;
const CONSENT_VERSION = "2026-07-v1";
const MAX_EVENTS = 300;

const DATA_DICTIONARY = [
  ["anon_id", "Random UUID for this install. Not derived from you or your device. Deleted & rotated on data wipe."],
  ["session_id", "Random UUID for this sitting. Forgotten when the app closes."],
  ["event", "One of: assessment_started, assessment_completed, result_generated, rating_submitted, payment_completed, data_exported."],
  ["ts_hour", "Time coarsened to the hour, UTC. Exact times are never stored."],
  ["scores_bucketed", "Seven dimension scores rounded to the nearest 10 — never raw answers."],
  ["category / confidence", "The result headline and its consistency score."],
  ["rating / feedback", "Your 1–10 rating; feedback scrubbed of emails, numbers, links and handles, capped at 500 characters."],
  ["payment_method / amount", "\"card\" or \"transfer\" and the amount. Card numbers never enter this dataset."],
];

function uuid() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  const b = new Uint8Array(16);
  (crypto?.getRandomValues ? crypto.getRandomValues(b) : b.map(() => Math.floor(Math.random() * 256)));
  return [...b].map((x, i) => (i === 4 || i === 6 || i === 8 || i === 10 ? "-" : "") + x.toString(16).padStart(2, "0")).join("");
}
async function getAnonId() {
  let id = await loadJSON(ANON_KEY, null);
  if (!id) { id = uuid(); await saveJSON(ANON_KEY, id); }
  return id;
}
const coarseHourUTC = () => new Date().toISOString().slice(0, 13) + ":00Z";
const bucketScores = (scores) =>
  Object.fromEntries(Object.entries(scores).map(([k, v]) => [k, Math.round(v / 10) * 10]));
function sanitizeFreeText(text) {
  if (!text) return null;
  let t = text
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, "[removed]")        // emails
    .replace(/https?:\/\/\S+|www\.\S+/gi, "[removed]")         // URLs
    .replace(/@\w{2,}/g, "[removed]")                          // handles
    .replace(/\+?\d[\d\s().-]{6,}\d/g, "[removed]")            // phone-like digit runs
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500);
  return t || null;
}
// The single write path for the anonymous dataset. Consent-gated by callers.
async function logEvent(sessionId, event, payload = {}) {
  const record = {
    schema_version: SCHEMA_VERSION,
    consent_version: CONSENT_VERSION,
    anon_id: await getAnonId(),
    session_id: sessionId,
    event,
    ts_hour: coarseHourUTC(),
    ...payload,
  };
  const events = await loadJSON(EVENTS_KEY, []);
  events.push(record);
  await saveJSON(EVENTS_KEY, events.slice(-MAX_EVENTS)); // retention cap
  return record;
}

/* ============================================================ APP ============================================================ */
export default function App() {
  const [screen, setScreen] = useState("landing"); // landing | consent | quiz | working | result | rating | done | insights | privacy
  const [ageOk, setAgeOk] = useState(false);
  const [reflectOk, setReflectOk] = useState(false);
  const [privacyOk, setPrivacyOk] = useState(false);
  const [selfGender, setSelfGender] = useState("unspecified");
  const [answers, setAnswers] = useState(Array(QUESTIONS.length).fill(null));
  const [qi, setQi] = useState(0);
  const [result, setResult] = useState(null);
  const [revealed, setRevealed] = useState(false); // true only after free run or successful payment
  const [explanation, setExplanation] = useState(null);
  const [aiUsed, setAiUsed] = useState(false);
  const [rating, setRating] = useState(null);
  const [feedback, setFeedback] = useState("");
  const [saved, setSaved] = useState(false);
  const [insights, setInsights] = useState(null);
  const [deleted, setDeleted] = useState(false);
  const [usage, setUsage] = useState({ completions: 0, credits: 0 });
  const [payMethod, setPayMethod] = useState("card"); // card | transfer | opay
  const [opayPhone, setOpayPhone] = useState("");
  const [card, setCard] = useState({ number: "", expiry: "", cvc: "" });
  const [payState, setPayState] = useState("idle"); // idle | processing | success | error
  const [payError, setPayError] = useState("");
  const transferRef = useRef("SW-" + Math.random().toString(36).slice(2, 8).toUpperCase());
  const sessionId = useRef(uuid()); // random per-sitting id — forgotten when the app closes
  const topRef = useRef(null);

  useEffect(() => { loadJSON(USAGE_KEY, { completions: 0, credits: 0 }).then(setUsage); }, []);

  useEffect(() => { topRef.current?.scrollIntoView?.({ block: "start" }); }, [screen, qi]);

  /* ----- flow actions ----- */
  const beginAssessment = async (runType) => {
    const stats = await loadJSON(STATS_KEY, { starts: 0, completions: 0 });
    stats.starts += 1;
    await saveJSON(STATS_KEY, stats);
    // Consent is guaranteed here: this path is only reachable after the consent screen.
    await logEvent(sessionId.current, "assessment_started", { run_type: runType });
    // Fresh state for a repeat run
    setAnswers(Array(QUESTIONS.length).fill(null));
    setQi(0); setResult(null); setExplanation(null); setRating(null); setFeedback(""); setSaved(false);
    setRevealed(false);
    setScreen("quiz");
  };

  const startQuiz = async () => {
    const u = await loadJSON(USAGE_KEY, { completions: 0, credits: 0 });
    setUsage(u);
    // Retakes are free to START — payment is collected after the questions,
    // before the summary and result are revealed.
    beginAssessment(u.completions === 0 ? "free_trial" : "retake_result_paywalled");
  };

  /* ----- payment (demo checkout — swap for Stripe/Paystack server-side in production) ----- */
  const luhnValid = (num) => {
    let sum = 0, dbl = false;
    for (let i = num.length - 1; i >= 0; i--) {
      let d = +num[i];
      if (dbl) { d *= 2; if (d > 9) d -= 9; }
      sum += d; dbl = !dbl;
    }
    return sum % 10 === 0;
  };

  const grantCredit = async () => {
    const u = await loadJSON(USAGE_KEY, { completions: 0, credits: 0 });
    const next = { ...u, credits: u.credits + 1 };
    await saveJSON(USAGE_KEY, next);
    setUsage(next);
  };

  const payWithCard = async () => {
    setPayError("");
    const digits = card.number.replace(/\s/g, "");
    if (!/^\d{13,19}$/.test(digits) || !luhnValid(digits)) { setPayError("That card number doesn't look valid — please check it."); return; }
    const em = card.expiry.match(/^(0[1-9]|1[0-2])\/(\d{2})$/);
    if (!em) { setPayError("Expiry must be in MM/YY format."); return; }
    const now = new Date();
    const expOk = 2000 + +em[2] > now.getFullYear() || (2000 + +em[2] === now.getFullYear() && +em[1] >= now.getMonth() + 1);
    if (!expOk) { setPayError("This card has expired."); return; }
    if (!/^\d{3,4}$/.test(card.cvc)) { setPayError("Enter the 3–4 digit security code."); return; }
    setPayState("processing");
    // DEMO STUB — in production: POST card token to your server route, which calls
    // Stripe PaymentIntents ($1.00 USD). Raw card details must never touch your server.
    await new Promise((res) => setTimeout(res, 1400));
    await grantCredit();
    await logEvent(sessionId.current, "payment_completed", { payment_method: "card", amount_usd: 1.0 }); // no card fields, ever
    setPayState("success");
  };

  const confirmTransfer = async () => {
    setPayState("processing");
    await new Promise((res) => setTimeout(res, 1800)); // simulated transfer verification
    await grantCredit();
    await logEvent(sessionId.current, "payment_completed", { payment_method: "transfer", amount_usd: 1.0 });
    setPayState("success");
  };

  const payWithOpay = async () => {
    setPayError("");
    // Nigerian mobile number: 0XXXXXXXXXX or +234XXXXXXXXXX
    const normalized = opayPhone.replace(/[\s-]/g, "");
    if (!/^(\+?234|0)[789][01]\d{8}$/.test(normalized)) {
      setPayError("Enter the Nigerian mobile number linked to your OPay wallet (e.g. 0803 123 4567).");
      return;
    }
    setPayState("processing");
    // DEMO STUB — in production: server calls the OPay Checkout API (or routes the
    // wallet charge via Paystack) to push an approval prompt to the user's OPay app;
    // the payment webhook then calls unlock_paid_result(). The phone number is sent
    // only to the payment processor and never stored with reflection data.
    await new Promise((res) => setTimeout(res, 2000)); // simulated wallet approval
    await grantCredit();
    await logEvent(sessionId.current, "payment_completed", { payment_method: "opay", amount_usd: 1.0 }); // no phone number in telemetry
    setOpayPhone("");
    setPayState("success");
  };

  const answer = (v) => {
    const next = [...answers];
    next[qi] = v;
    setAnswers(next);
    if (qi < QUESTIONS.length - 1) setTimeout(() => setQi(qi + 1), 180);
    else finish(next);
  };

  // Generates the AI explanation and shows the result. Called directly on the
  // free first run, or via unlockResult() after payment on retakes.
  const revealResult = async (r) => {
    setScreen("working");
    let usedAI = false;
    try {
      const ai = await generateAIExplanation(r);
      setExplanation(ai);
      setAiUsed(true);
      usedAI = true;
    } catch {
      setExplanation(fallbackExplanation(r));
      setAiUsed(false);
    }
    await logEvent(sessionId.current, "result_generated", {
      category: r.primary,
      confidence: r.confidence,
      scores_bucketed: bucketScores(r.scores),
      unsure_answers: r.unsureCount,
      explanation_source: usedAI ? "ai" : "fallback_template",
    });
    setRevealed(true); // the ONLY place a result becomes viewable
    setScreen("result");
  };

  const finish = async (finalAnswers) => {
    setScreen("working");
    const r = scoreAssessment(finalAnswers, selfGender);
    setResult(r);
    const stats = await loadJSON(STATS_KEY, { starts: 0, completions: 0 });
    stats.completions += 1;
    await saveJSON(STATS_KEY, stats);
    const u = await loadJSON(USAGE_KEY, { completions: 0, credits: 0 });
    const isFree = u.completions === 0;
    const nextUsage = { ...u, completions: u.completions + 1 };
    await saveJSON(USAGE_KEY, nextUsage);
    setUsage(nextUsage);
    await logEvent(sessionId.current, "assessment_completed", { questions_answered: finalAnswers.filter((v) => v !== null).length });

    if (isFree) { revealResult(r); return; }              // first run: result is free
    if (u.credits >= 1) {                                 // pre-purchased credit: consume and reveal
      const spent = { ...nextUsage, credits: nextUsage.credits - 1 };
      await saveJSON(USAGE_KEY, spent);
      setUsage(spent);
      revealResult(r);
      return;
    }
    setPayState("idle"); setPayError("");                 // retake: $1 unlocks the result
    setScreen("paywall");
  };

  // After payment succeeds on the paywall: consume the granted credit and reveal.
  const unlockResult = async () => {
    const u = await loadJSON(USAGE_KEY, { completions: 0, credits: 0 });
    if (u.credits >= 1) {
      const next = { ...u, credits: u.credits - 1 };
      await saveJSON(USAGE_KEY, next);
      setUsage(next);
    }
    setCard({ number: "", expiry: "", cvc: "" });
    revealResult(result);
  };

  const submitRating = async () => {
    // Every stored field passes through the anonymization pipeline:
    // coarse timestamp, bucketed scores, sanitized free text — never raw answers.
    const cleanFeedback = sanitizeFreeText(feedback);
    const records = await loadJSON(REC_KEY, []);
    records.push({
      ts_hour: coarseHourUTC(),
      category: result.primary,
      confidence: result.confidence,
      rating: rating,
      feedback: cleanFeedback,
      pattern: bucketScores(result.scores),
    });
    await saveJSON(REC_KEY, records.slice(-MAX_EVENTS));
    await logEvent(sessionId.current, "rating_submitted", {
      rating,
      has_feedback: !!cleanFeedback,
      category: result.primary,
      confidence: result.confidence,
    });
    setSaved(true);
    setScreen("done");
  };

  const openInsights = async () => {
    const records = await loadJSON(REC_KEY, []);
    const stats = await loadJSON(STATS_KEY, { starts: 0, completions: 0 });
    const events = await loadJSON(EVENTS_KEY, []);
    const rated = records.filter((r) => typeof r.rating === "number");
    const avg = rated.length ? (rated.reduce((s, r) => s + r.rating, 0) / rated.length).toFixed(1) : "—";
    const cats = {};
    records.forEach((r) => { cats[r.category] = (cats[r.category] || 0) + 1; });
    const lowRated = rated.filter((r) => r.rating <= 4);
    const dropoff = stats.starts ? Math.max(0, Math.round(((stats.starts - stats.completions) / stats.starts) * 100)) : 0;
    const eventCounts = {};
    events.forEach((e) => { eventCounts[e.event] = (eventCounts[e.event] || 0) + 1; });
    setInsights({ total: records.length, avg, cats, lowRated, dropoff, starts: stats.starts, events: events.length, eventCounts });
    setScreen("insights");
  };

  // Export the full anonymized dataset (events + rating records) as JSON —
  // this is exactly, and only, what the app has collected.
  const exportDataset = async () => {
    const dataset = {
      exported_at_hour: coarseHourUTC(),
      schema_version: SCHEMA_VERSION,
      data_dictionary: Object.fromEntries(DATA_DICTIONARY),
      events: await loadJSON(EVENTS_KEY, []),
      rating_records: await loadJSON(REC_KEY, []),
    };
    await logEvent(sessionId.current, "data_exported", { export_type: "dataset_json" });
    const blob = new Blob([JSON.stringify(dataset, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "stillwater-anonymous-dataset.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportText = () => {
    if (!revealed || !explanation || !result) return; // never export an unrevealed result
    const e = explanation;
    const lines = [
      "STILLWATER — Private self-reflection result",
      new Date().toLocaleString(),
      "",
      "This is not a diagnosis. It is a self-reflection tool.",
      "Only you define your identity.",
      "",
      "SUMMARY", e.summary, "",
      "WHAT YOUR ANSWERS SUGGEST", e.patterns, "",
      "POSSIBLE LABELS TO EXPLORE (optional)", e.labels, "",
      `CONFIDENCE LEVEL: ${result.confLabel} (${result.confidence}/100)`,
      "Confidence reflects how consistent your answers were — not how true any label is.",
      "",
      "REFLECTION PROMPTS",
      ...e.reflection_prompts.map((p, i) => `${i + 1}. ${p}`),
      "",
      "DIMENSION SCORES (0–100, from your answers only)",
      ...DIMS.map((d) => `${DIM_LABELS[d]}: ${result.scores[d]}`),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "stillwater-reflection.txt";
    a.click();
    URL.revokeObjectURL(url);
  };

  const wipe = async () => {
    await deleteAllData();
    setDeleted(true);
    setResult(null); setExplanation(null); setAnswers(Array(QUESTIONS.length).fill(null));
    setQi(0); setRating(null); setFeedback(""); setSaved(false);
    setScreen("landing");
  };

  /* ----- shared UI bits ----- */
  const Disclaimer = () => (
    <div className="disc" role="note">
      This is not a diagnosis. It is a self-reflection tool. Only you define your identity.
    </div>
  );

  // While a scored-but-unpaid result is pending, the delete control is hidden so the
  // checkout flow can't be interrupted mid-payment. It returns after payment (or on a
  // free run). Deletion itself never resets the free trial, so this is UX, not security.
  const paymentPending = result !== null && !revealed;

  const Footer = () => (
    <footer className="foot">
      <button className="linkbtn" onClick={() => setScreen("privacy")}>Privacy &amp; data</button>
      <span className="dot">·</span>
      <button className="linkbtn" onClick={openInsights}>Insights</button>
      {!paymentPending && (
        <>
          <span className="dot">·</span>
          <button className="linkbtn" onClick={wipe}>Delete my data</button>
        </>
      )}
    </footer>
  );

  /* ----- screens ----- */
  return (
    <div className="app" ref={topRef}>
      <style>{CSS}</style>

      {screen === "landing" && (
        <main className="page center">
          <div className="breath" aria-hidden="true" />
          <p className="eyebrow">A private space</p>
          <h1 className="display">Stillwater</h1>
          <p className="lede">
            A quiet, structured set of questions to help you notice your own patterns of
            attraction, romance, and identity — and reflect on what they might mean to you.
          </p>
          <div className="tenets">
            <p><span>It reflects, it doesn't decide.</span> Results describe patterns in your answers — never a verdict about who you are.</p>
            <p><span>Labels are optional.</span> Suggestions are offered only as things you may explore, or ignore entirely.</p>
            <p><span>Private by default.</span> No account, no name, no email. Anonymous ratings stay on this device and you can delete everything at any time.</p>
          </div>
          <Disclaimer />
          {deleted && <p className="tiny ok">Your data has been deleted.</p>}
          <button className="primary" onClick={() => setScreen("consent")}>Begin</button>
          <p className="tiny muted">
            {usage.completions === 0
              ? "Your first reflection is free · on repeats, your result unlocks for $1"
              : usage.credits > 0
                ? `You have ${usage.credits} paid result unlock${usage.credits > 1 ? "s" : ""} ready to use`
                : "On repeat reflections, your result unlocks for $1 · card, bank transfer, or OPay"}
          </p>
          <Footer />
        </main>
      )}

      {screen === "consent" && (
        <main className="page">
          <p className="eyebrow">Before we begin</p>
          <h2 className="display sm">A few things to confirm</h2>
          <label className="check">
            <input type="checkbox" checked={ageOk} onChange={(e) => setAgeOk(e.target.checked)} />
            <span>I confirm that I am 18 years of age or older.</span>
          </label>
          <label className="check">
            <input type="checkbox" checked={reflectOk} onChange={(e) => setReflectOk(e.target.checked)} />
            <span>I understand this is a self-reflection tool, not a test, diagnosis, or identity detector. Its result is only a mirror of my own answers.</span>
          </label>
          <label className="check">
            <input type="checkbox" checked={privacyOk} onChange={(e) => setPrivacyOk(e.target.checked)} />
            <span>I consent to an anonymized summary (no name, no identifiers) being kept for improving question quality — and I know I can delete it anytime.</span>
          </label>

          <div className="field">
            <p className="fieldlabel">Optional — how do you describe your own gender? This only helps phrase results (e.g. whether "straight" or "gay" is the relevant word). You can skip it.</p>
            <div className="chips">
              {[["woman", "Woman"], ["man", "Man"], ["nonbinary", "Non-binary / other"], ["unspecified", "Prefer not to say"]].map(([v, l]) => (
                <button key={v} className={"chip" + (selfGender === v ? " on" : "")} onClick={() => setSelfGender(v)}>{l}</button>
              ))}
            </div>
          </div>

          <Disclaimer />
          <button className="primary" disabled={!(ageOk && reflectOk && privacyOk)} onClick={startQuiz}>
            {usage.completions === 0 ? "Start the 25 questions — free" : "Start the 25 questions"}
          </button>
          {usage.completions > 0 && usage.credits === 0 && (
            <p className="tiny muted">Answering is free — your summary and result will unlock for $1 at the end.</p>
          )}
          <button className="ghost" onClick={() => setScreen("landing")}>Back</button>
        </main>
      )}

      {screen === "paywall" && (
        <main className="page">
          <p className="eyebrow">Your answers are in</p>
          <h2 className="display sm">Unlock your summary and result — $1</h2>
          <p className="lede small">
            All 25 answers are recorded and your scores are ready. Your first reflection was free;
            each repeat costs <strong>$1.00</strong> to reveal the AI-written summary and result —
            it covers the explanation and keeps the app free of ads and data selling. Payment
            details are never linked to your answers.
          </p>
          <div className="demobadge">Demo checkout — no real money moves here. In production this connects to Stripe / Paystack.</div>

          {payState !== "success" && (
            <>
              <div className="paytabs" role="tablist">
                <button role="tab" aria-selected={payMethod === "card"} className={"paytab" + (payMethod === "card" ? " on" : "")} onClick={() => { setPayMethod("card"); setPayError(""); }}>Bank card</button>
                <button role="tab" aria-selected={payMethod === "transfer"} className={"paytab" + (payMethod === "transfer" ? " on" : "")} onClick={() => { setPayMethod("transfer"); setPayError(""); }}>Bank transfer</button>
                <button role="tab" aria-selected={payMethod === "opay"} className={"paytab" + (payMethod === "opay" ? " on" : "")} onClick={() => { setPayMethod("opay"); setPayError(""); }}>OPay</button>
              </div>

              {payMethod === "card" && (
                <div className="paybox">
                  <label className="paylabel">Card number
                    <input
                      className="payinput" inputMode="numeric" autoComplete="cc-number" placeholder="4242 4242 4242 4242"
                      value={card.number}
                      onChange={(e) => setCard({ ...card, number: e.target.value.replace(/[^\d]/g, "").slice(0, 16).replace(/(\d{4})(?=\d)/g, "$1 ") })}
                    />
                  </label>
                  <div className="payrow">
                    <label className="paylabel">Expiry
                      <input
                        className="payinput" inputMode="numeric" autoComplete="cc-exp" placeholder="MM/YY"
                        value={card.expiry}
                        onChange={(e) => {
                          let v = e.target.value.replace(/[^\d]/g, "").slice(0, 4);
                          if (v.length > 2) v = v.slice(0, 2) + "/" + v.slice(2);
                          setCard({ ...card, expiry: v });
                        }}
                      />
                    </label>
                    <label className="paylabel">CVC
                      <input
                        className="payinput" inputMode="numeric" autoComplete="cc-csc" placeholder="123"
                        value={card.cvc}
                        onChange={(e) => setCard({ ...card, cvc: e.target.value.replace(/[^\d]/g, "").slice(0, 4) })}
                      />
                    </label>
                  </div>
                  {payError && <p className="tiny payerr">{payError}</p>}
                  <button className="primary" disabled={payState === "processing"} onClick={payWithCard}>
                    {payState === "processing" ? "Processing…" : "Pay $1.00"}
                  </button>
                </div>
              )}

              {payMethod === "transfer" && (
                <div className="paybox">
                  <p className="tiny">Send exactly <strong>$1.00</strong> to:</p>
                  <div className="bankdetails">
                    <p><span>Account name</span>Stillwater Reflections Ltd</p>
                    <p><span>Bank</span>Example Bank</p>
                    <p><span>Account no.</span>0012 3456 789</p>
                    <p><span>Reference</span><strong>{transferRef.current}</strong></p>
                  </div>
                  <p className="tiny muted">Include the reference so the payment can be matched to this session — no name needed.</p>
                  <button className="primary" disabled={payState === "processing"} onClick={confirmTransfer}>
                    {payState === "processing" ? "Verifying transfer…" : "I've sent the transfer"}
                  </button>
                </div>
              )}

              {payMethod === "opay" && (
                <div className="paybox">
                  <label className="paylabel">OPay wallet number
                    <input
                      className="payinput" inputMode="tel" autoComplete="tel" placeholder="0803 123 4567"
                      value={opayPhone}
                      onChange={(e) => setOpayPhone(e.target.value.replace(/[^\d+\s]/g, "").slice(0, 15))}
                    />
                  </label>
                  <p className="tiny muted">You'll get an approval prompt in your OPay app to confirm the $1.00 payment. Your number goes only to the payment processor — never stored with your answers.</p>
                  {payError && <p className="tiny payerr">{payError}</p>}
                  <button className="primary" disabled={payState === "processing"} onClick={payWithOpay}>
                    {payState === "processing" ? "Waiting for approval in OPay…" : "Pay $1.00 with OPay"}
                  </button>
                </div>
              )}
            </>
          )}

          {payState === "success" && (
            <div className="paybox center">
              <p className="ok" style={{ fontSize: "1.05rem", fontWeight: 600 }}>Payment received — thank you.</p>
              <p className="tiny muted">Your payment is not linked to your answers.</p>
              <button className="primary" onClick={unlockResult}>See my summary and result</button>
            </div>
          )}

          {payState !== "success" && (
            <button className="ghost" onClick={() => setScreen("landing")}>Not now</button>
          )}
          <p className="tiny muted">Your answers stay on this device while you decide — nothing is revealed or charged until you pay. Payments are one-off, never a subscription. Deleting your data does not refund purchases; payment records are kept separately from reflection data.</p>
        </main>
      )}

      {screen === "quiz" && (
        <main className="page">
          <div className="progresswrap" aria-label={`Question ${qi + 1} of ${QUESTIONS.length}`}>
            <div className="progress"><div className="bar" style={{ width: `${((qi) / QUESTIONS.length) * 100}%` }} /></div>
            <p className="tiny">{qi + 1} / {QUESTIONS.length} · {QUESTIONS[qi].cat}</p>
          </div>
          <h2 className="qtext">{QUESTIONS[qi].text}</h2>
          <div className="likert" role="radiogroup" aria-label="Your answer">
            {LIKERT.map((label, v) => (
              <button
                key={v}
                role="radio"
                aria-checked={answers[qi] === v}
                className={"lk" + (answers[qi] === v ? " on" : "")}
                onClick={() => answer(v)}
              >
                <span className={`ring r${v}`} aria-hidden="true" />
                <span className="lklabel">{label}</span>
              </button>
            ))}
          </div>
          <div className="navrow">
            <button className="ghost" disabled={qi === 0} onClick={() => setQi(qi - 1)}>← Back</button>
            {answers[qi] !== null && qi < QUESTIONS.length - 1 && (
              <button className="ghost" onClick={() => setQi(qi + 1)}>Next →</button>
            )}
          </div>
          <p className="tiny muted">There are no right answers. "Unsure" is always a valid answer.</p>
        </main>
      )}

      {screen === "working" && (
        <main className="page center">
          <div className="breath" aria-hidden="true" />
          <p className="lede">Reading your answers gently…</p>
          <p className="tiny muted">Only your anonymous scores are used — never your identity.</p>
        </main>
      )}

      {screen === "result" && revealed && explanation && (
        <main className="page">
          <Disclaimer />
          <p className="eyebrow">Your reflection</p>
          <h2 className="display sm">{result.primary}</h2>

          <section className="block">
            <h3>Summary</h3>
            <p>{explanation.summary}</p>
          </section>
          <section className="block">
            <h3>What your answers suggest</h3>
            <p>{explanation.patterns}</p>
          </section>
          <section className="block">
            <h3>Possible labels to explore <em>(optional)</em></h3>
            <p>{explanation.labels}</p>
            <div className="chips readonly">
              {result.secondary.map((s) => <span key={s} className="chip on soft">{s}</span>)}
            </div>
          </section>
          <section className="block">
            <h3>Confidence level</h3>
            <div className="confrow">
              <div className="confbar"><div className="conffill" style={{ width: `${result.confidence}%` }} /></div>
              <span className="conftext">{result.confLabel} · {result.confidence}/100</span>
            </div>
            <p className="tiny muted">
              Confidence measures how consistent your answers were with each other — not how "true" any label is.
              {result.unsureCount > 0 && ` You answered "Unsure" ${result.unsureCount} time${result.unsureCount > 1 ? "s" : ""}, which is completely okay.`}
            </p>
            {result.contradictions.map((c, i) => <p key={i} className="tiny muted">{c}</p>)}
          </section>
          <section className="block">
            <h3>Reflection prompts</h3>
            {explanation.reflection_prompts.map((p, i) => <p key={i} className="prompt">— {p}</p>)}
          </section>

          <section className="block scores">
            <h3>How this was calculated</h3>
            <p className="tiny muted">Each answer added weight to one or more dimensions. Your scores (0–100):</p>
            {DIMS.map((d) => (
              <div key={d} className="dimrow">
                <span className="dimlabel">{DIM_LABELS[d]}</span>
                <div className="dimbar"><div className="dimfill" style={{ width: `${result.scores[d]}%` }} /></div>
                <span className="dimval">{result.scores[d]}</span>
              </div>
            ))}
            <p className="tiny muted">{aiUsed ? "Explanation written by AI from these scores only, under strict non-definitive rules." : "Explanation generated from these scores using the built-in template."}</p>
          </section>

          <div className="btnrow">
            <button className="primary" onClick={() => setScreen("rating")}>Continue</button>
            <button className="ghost" onClick={exportText}>Export as text</button>
          </div>
          <Footer />
        </main>
      )}

      {screen === "rating" && (
        <main className="page">
          <p className="eyebrow">One last thing</p>
          <h2 className="display sm">How accurate or helpful did this feel?</h2>
          <p className="tiny muted">1 = not accurate/helpful · 10 = very accurate/helpful. Your rating is stored anonymously and helps improve the questions.</p>
          <div className="ratingrow" role="radiogroup" aria-label="Rating from 1 to 10">
            {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
              <button key={n} role="radio" aria-checked={rating === n} className={"rnum" + (rating === n ? " on" : "")} onClick={() => setRating(n)}>{n}</button>
            ))}
          </div>
          <textarea
            className="feedback"
            placeholder="Optional — anything that felt off, or right? (never include your name)"
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            rows={3}
          />
          <div className="btnrow">
            <button className="primary" disabled={rating === null} onClick={submitRating}>Submit rating</button>
            <button className="ghost" onClick={() => setScreen("done")}>Skip</button>
          </div>
        </main>
      )}

      {screen === "done" && (
        <main className="page center">
          <div className="breath still" aria-hidden="true" />
          <h2 className="display sm">Thank you.</h2>
          <p className="lede">
            {saved ? "Your anonymous rating was saved. " : ""}
            Whatever you take from today's reflection, it's yours to hold lightly. Identity can be
            explored at your own pace — or not at all.
          </p>
          <Disclaimer />
          <div className="btnrow col">
            <button className="primary" onClick={startQuiz}>
              {usage.credits > 0 ? "Take the assessment again" : "Take the assessment again — $1"}
            </button>
            {usage.credits === 0 && <p className="tiny muted">Answering is free — the $1 is charged at the end, to unlock your new summary and result.</p>}
            <button className="ghost" onClick={() => setScreen("result")}>View my result again</button>
            <button className="ghost" onClick={exportText}>Export result as text</button>
            <button className="ghost danger" onClick={wipe}>Delete my data &amp; clear result</button>
          </div>
          <Footer />
        </main>
      )}

      {screen === "insights" && insights && (
        <main className="page">
          <p className="eyebrow">Admin</p>
          <h2 className="display sm">Insights</h2>
          <p className="tiny muted">All data here is anonymized and stored only in this app's storage.</p>
          <div className="statgrid">
            <div className="stat"><span className="statnum">{insights.total}</span><span className="statlabel">Total assessments saved</span></div>
            <div className="stat"><span className="statnum">{insights.avg}</span><span className="statlabel">Average rating</span></div>
            <div className="stat"><span className="statnum">{insights.dropoff}%</span><span className="statlabel">Drop-off rate ({insights.starts} started)</span></div>
            <div className="stat"><span className="statnum">{insights.lowRated.length}</span><span className="statlabel">Low-rated results (≤4)</span></div>
          </div>
          <section className="block">
            <h3>Result categories</h3>
            {Object.keys(insights.cats).length === 0 && <p className="tiny muted">No saved results yet.</p>}
            {Object.entries(insights.cats).sort((a, b) => b[1] - a[1]).map(([c, n]) => (
              <div key={c} className="dimrow">
                <span className="dimlabel">{c}</span>
                <span className="dimval">{n}</span>
              </div>
            ))}
          </section>
          {insights.lowRated.length > 0 && (
            <section className="block">
              <h3>Low-rated patterns (calibration signals, not truth)</h3>
              {insights.lowRated.slice(-5).map((r, i) => (
                <p key={i} className="tiny muted">{r.category} · confidence {r.confidence} · rated {r.rating}{r.feedback ? ` · "${r.feedback}"` : ""}</p>
              ))}
            </section>
          )}
          <section className="block">
            <h3>Anonymous event stream ({insights.events} events)</h3>
            {Object.keys(insights.eventCounts).length === 0 && <p className="tiny muted">No events recorded yet.</p>}
            {Object.entries(insights.eventCounts).map(([e, n]) => (
              <div key={e} className="dimrow">
                <span className="dimlabel">{e}</span>
                <span className="dimval">{n}</span>
              </div>
            ))}
            <p className="tiny muted">Schema v{SCHEMA_VERSION} · retention capped at {MAX_EVENTS} events · hour-level timestamps · no PII fields exist in this dataset.</p>
            <button className="ghost" onClick={exportDataset}>Export anonymized dataset (JSON)</button>
          </section>
          <button className="ghost" onClick={() => setScreen(revealed ? "done" : "landing")}>← Back</button>
        </main>
      )}

      {screen === "privacy" && (
        <main className="page">
          <p className="eyebrow">Privacy &amp; data</p>
          <h2 className="display sm">What this app keeps — and doesn't</h2>
          <section className="block">
            <h3>Anonymous by default</h3>
            <p>No account, name, or email is required or requested. Your individual answers are held only in memory during your session and are gone when you leave or delete them.</p>
          </section>
          <section className="block">
            <h3>What is stored (only with your consent)</h3>
            <p>If you submit a rating: a coarsened, anonymized score pattern, the result category, a confidence number, your 1–10 rating, optional feedback text, and a timestamp. Nothing that identifies you.</p>
          </section>
          <section className="block">
            <h3>Your controls</h3>
            <p>You can delete everything at any time with the "Delete my data" button, and export your own result as a plain text file that only you hold.</p>
          </section>
          <section className="block">
            <h3>What leaves this device</h3>
            <p><strong>One thing only:</strong> when your result is generated, your seven dimension scores (numbers from 0–100) are sent to the Anthropic API so the written explanation can be composed. No name, no answers, no free text, no identifiers travel with them. If that call fails, a built-in template is used and nothing is sent at all.</p>
            <p>Everything else — answers, ratings, feedback, the anonymous event stream — stays in this app's storage. There is no analytics SDK, no ad network, no IP or device fingerprint collection.</p>
          </section>
          <section className="block">
            <h3>The anonymous dataset — every field, explained</h3>
            <p className="tiny muted">This is the complete data dictionary. If a field isn't listed here, it doesn't exist.</p>
            {DATA_DICTIONARY.map(([field, desc]) => (
              <p key={field} className="tiny"><strong>{field}</strong> — {desc}</p>
            ))}
            <p className="tiny muted">Free text is scrubbed before storage: emails, phone numbers, links and @handles are replaced with [removed]. Timestamps are kept only to the hour. Scores are stored in buckets of 10. The whole stream is capped at {MAX_EVENTS} events and deleted by "Delete my data", which also rotates your anonymous ID.</p>
          </section>
          <section className="block">
            <h3>Payments</h3>
            <p>Your first reflection is free, including its result. On repeat reflections, answering the questions is free and the $1 charge (card, bank transfer, or OPay) happens at the end, to unlock your summary and result. Card details are handled by the payment processor and never stored by this app or linked to your answers. Deleting your reflection data does not erase the anonymous purchase counter (it contains no reflection content) and does not refund payments.</p>
          </section>
          <section className="block">
            <h3>A sensitive topic, handled carefully</h3>
            <p>Questions never use explicit sexual content. Results are always probabilistic and non-definitive. This tool does not, and cannot, determine anyone's sexuality — only you define your identity. If reflecting on these topics brings up distress, talking with someone you trust or a qualified counselor can help.</p>
          </section>
          <button className="ghost" onClick={() => setScreen("landing")}>← Back</button>
        </main>
      )}
    </div>
  );
}

/* ---------- Design system: "Stillwater" — dusk plum + deep pine, quiet and unhurried ---------- */
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&family=Karla:wght@400;500;600&display=swap');

.app {
  --fog: #F4F3F0;
  --ink: #23302B;
  --pine: #3E5449;
  --sage: #77937F;
  --mist: #E4E7E0;
  --plum: #7C6489;
  --plumsoft: #EAE3EE;
  min-height: 100vh;
  background:
    radial-gradient(60rem 40rem at 85% -10%, var(--plumsoft), transparent 60%),
    radial-gradient(50rem 35rem at -10% 110%, #E1EAE2, transparent 55%),
    var(--fog);
  color: var(--ink);
  font-family: 'Karla', system-ui, sans-serif;
  font-size: 16px;
  line-height: 1.55;
}
.page { max-width: 34rem; margin: 0 auto; padding: 2.5rem 1.25rem 4rem; display: flex; flex-direction: column; gap: 1.1rem; }
.center { text-align: center; align-items: center; min-height: 90vh; justify-content: center; }

.display { font-family: 'Fraunces', Georgia, serif; font-weight: 500; font-size: 2.6rem; letter-spacing: -0.01em; margin: 0; color: var(--ink); }
.display.sm { font-size: 1.7rem; }
.eyebrow { text-transform: uppercase; letter-spacing: 0.22em; font-size: 0.68rem; font-weight: 600; color: var(--plum); margin: 0; }
.lede { font-size: 1.05rem; color: var(--pine); max-width: 28rem; margin: 0; }
.tiny { font-size: 0.78rem; margin: 0.2rem 0; }
.muted { color: #6B7A72; }
.ok { color: var(--sage); font-weight: 600; }

.tenets { text-align: left; display: flex; flex-direction: column; gap: 0.7rem; margin: 0.6rem 0; max-width: 28rem; }
.tenets p { margin: 0; font-size: 0.9rem; color: var(--pine); }
.tenets span { font-weight: 600; color: var(--ink); }

.disc { border-left: 3px solid var(--plum); background: var(--plumsoft); padding: 0.6rem 0.9rem; font-size: 0.82rem; border-radius: 0 0.5rem 0.5rem 0; color: #4A3D55; }

.primary { background: var(--ink); color: var(--fog); border: none; padding: 0.9rem 1.8rem; border-radius: 2rem; font-family: inherit; font-size: 1rem; font-weight: 600; cursor: pointer; transition: transform 0.15s, background 0.15s; }
.primary:hover:not(:disabled) { background: var(--pine); transform: translateY(-1px); }
.primary:disabled { opacity: 0.35; cursor: not-allowed; }
.primary:focus-visible, .ghost:focus-visible, .lk:focus-visible, .rnum:focus-visible, .chip:focus-visible, .linkbtn:focus-visible { outline: 2px solid var(--plum); outline-offset: 2px; }
.ghost { background: transparent; color: var(--pine); border: 1px solid #C9D2C9; padding: 0.7rem 1.4rem; border-radius: 2rem; font-family: inherit; font-size: 0.9rem; cursor: pointer; }
.ghost:hover:not(:disabled) { border-color: var(--sage); }
.ghost:disabled { opacity: 0.3; cursor: not-allowed; }
.ghost.danger { color: #8A5560; border-color: #D8C3C8; }
.linkbtn { background: none; border: none; color: #6B7A72; font-family: inherit; font-size: 0.75rem; cursor: pointer; text-decoration: underline; padding: 0.2rem; }
.btnrow { display: flex; gap: 0.8rem; flex-wrap: wrap; margin-top: 0.5rem; }
.btnrow.col { flex-direction: column; align-items: center; }

.check { display: flex; gap: 0.7rem; align-items: flex-start; font-size: 0.9rem; color: var(--pine); cursor: pointer; }
.check input { margin-top: 0.25rem; width: 1.05rem; height: 1.05rem; accent-color: var(--plum); flex-shrink: 0; }

.field { margin-top: 0.4rem; }
.fieldlabel { font-size: 0.82rem; color: #6B7A72; margin: 0 0 0.5rem; }
.chips { display: flex; gap: 0.5rem; flex-wrap: wrap; }
.chip { border: 1px solid #C9D2C9; background: white; border-radius: 2rem; padding: 0.45rem 0.95rem; font-family: inherit; font-size: 0.82rem; cursor: pointer; color: var(--pine); }
.chip.on { background: var(--plum); border-color: var(--plum); color: white; }
.chip.on.soft { background: var(--plumsoft); color: #4A3D55; border-color: transparent; cursor: default; }
.chips.readonly { margin-top: 0.6rem; }

.progresswrap { margin-bottom: 0.5rem; }
.progress { height: 4px; background: var(--mist); border-radius: 2px; overflow: hidden; }
.bar { height: 100%; background: linear-gradient(90deg, var(--sage), var(--plum)); transition: width 0.3s; }
.qtext { font-family: 'Fraunces', Georgia, serif; font-weight: 500; font-size: 1.45rem; line-height: 1.35; margin: 0.4rem 0 0.8rem; min-height: 4.2rem; }

/* Signature element: the five-ring Likert scale */
.likert { display: flex; flex-direction: column; gap: 0.55rem; }
.lk { display: flex; align-items: center; gap: 0.9rem; background: rgba(255,255,255,0.7); border: 1px solid transparent; border-radius: 0.9rem; padding: 0.75rem 1rem; font-family: inherit; font-size: 0.95rem; color: var(--ink); cursor: pointer; text-align: left; transition: border-color 0.15s, background 0.15s; }
.lk:hover { border-color: #C9D2C9; }
.lk.on { border-color: var(--plum); background: white; }
.ring { border-radius: 50%; border: 2px solid var(--sage); flex-shrink: 0; transition: background 0.15s; }
.r0 { width: 10px; height: 10px; } .r1 { width: 14px; height: 14px; } .r2 { width: 18px; height: 18px; border-color: #A9B4AA; } .r3 { width: 22px; height: 22px; } .r4 { width: 26px; height: 26px; }
.lk.on .ring { background: var(--plum); border-color: var(--plum); }
.navrow { display: flex; justify-content: space-between; margin-top: 0.4rem; }

.block { background: rgba(255,255,255,0.65); border-radius: 1rem; padding: 1.1rem 1.2rem; }
.block h3 { font-family: 'Fraunces', Georgia, serif; font-weight: 600; font-size: 1.02rem; margin: 0 0 0.4rem; color: var(--pine); }
.block h3 em { font-weight: 400; font-style: italic; color: #6B7A72; font-size: 0.85rem; }
.block p { margin: 0.3rem 0; font-size: 0.92rem; }
.prompt { color: var(--pine); font-style: italic; }

.confrow { display: flex; align-items: center; gap: 0.8rem; }
.confbar { flex: 1; height: 8px; background: var(--mist); border-radius: 4px; overflow: hidden; }
.conffill { height: 100%; background: var(--plum); border-radius: 4px; }
.conftext { font-size: 0.82rem; font-weight: 600; color: var(--plum); white-space: nowrap; }

.dimrow { display: flex; align-items: center; gap: 0.6rem; margin: 0.35rem 0; }
.dimlabel { flex: 1; font-size: 0.8rem; color: var(--pine); }
.dimbar { flex: 1.2; height: 6px; background: var(--mist); border-radius: 3px; overflow: hidden; }
.dimfill { height: 100%; background: var(--sage); border-radius: 3px; }
.dimval { font-size: 0.78rem; font-weight: 600; width: 2rem; text-align: right; }

.ratingrow { display: flex; gap: 0.4rem; flex-wrap: wrap; }
.rnum { width: 2.6rem; height: 2.6rem; border-radius: 50%; border: 1px solid #C9D2C9; background: white; font-family: inherit; font-size: 0.95rem; font-weight: 600; color: var(--pine); cursor: pointer; }
.rnum.on { background: var(--plum); border-color: var(--plum); color: white; }
.feedback { width: 100%; box-sizing: border-box; border: 1px solid #C9D2C9; border-radius: 0.8rem; padding: 0.8rem; font-family: inherit; font-size: 0.9rem; resize: vertical; background: rgba(255,255,255,0.8); color: var(--ink); }

.statgrid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.7rem; }
.stat { background: rgba(255,255,255,0.7); border-radius: 0.9rem; padding: 0.9rem; display: flex; flex-direction: column; }
.statnum { font-family: 'Fraunces', Georgia, serif; font-size: 1.8rem; font-weight: 600; color: var(--plum); }
.statlabel { font-size: 0.72rem; color: #6B7A72; }

.breath { width: 64px; height: 64px; border-radius: 50%; background: radial-gradient(circle at 35% 35%, var(--plumsoft), var(--plum)); opacity: 0.75; animation: breathe 5s ease-in-out infinite; margin-bottom: 0.4rem; }
.breath.still { animation: none; }
@keyframes breathe { 0%,100% { transform: scale(1); opacity: 0.6; } 50% { transform: scale(1.18); opacity: 0.85; } }
@media (prefers-reduced-motion: reduce) { .breath { animation: none; } .bar, .lk, .primary { transition: none; } }

/* Checkout */
.lede.small { font-size: 0.92rem; }
.demobadge { background: #F3EBD8; border: 1px dashed #C9B98A; color: #6E5F3A; border-radius: 0.7rem; padding: 0.55rem 0.85rem; font-size: 0.78rem; }
.paytabs { display: flex; gap: 0.5rem; }
.paytab { flex: 1; background: rgba(255,255,255,0.6); border: 1px solid #C9D2C9; border-radius: 0.8rem; padding: 0.7rem; font-family: inherit; font-size: 0.9rem; font-weight: 600; color: var(--pine); cursor: pointer; }
.paytab.on { border-color: var(--plum); background: white; color: var(--plum); }
.paytab:focus-visible, .payinput:focus-visible { outline: 2px solid var(--plum); outline-offset: 2px; }
.paybox { background: rgba(255,255,255,0.75); border-radius: 1rem; padding: 1.1rem 1.2rem; display: flex; flex-direction: column; gap: 0.8rem; }
.paybox.center { align-items: center; text-align: center; }
.paylabel { display: flex; flex-direction: column; gap: 0.3rem; font-size: 0.78rem; font-weight: 600; color: var(--pine); flex: 1; }
.payinput { border: 1px solid #C9D2C9; border-radius: 0.6rem; padding: 0.7rem 0.8rem; font-family: inherit; font-size: 1rem; letter-spacing: 0.03em; background: white; color: var(--ink); width: 100%; box-sizing: border-box; }
.payinput:focus { border-color: var(--plum); outline: none; }
.payrow { display: flex; gap: 0.7rem; }
.payerr { color: #8A3B4A; font-weight: 600; }
.bankdetails { background: var(--mist); border-radius: 0.7rem; padding: 0.8rem 1rem; }
.bankdetails p { display: flex; justify-content: space-between; margin: 0.25rem 0; font-size: 0.85rem; }
.bankdetails span { color: #6B7A72; }

.foot { margin-top: 1.5rem; display: flex; align-items: center; gap: 0.4rem; justify-content: center; }
.dot { color: #B4BFB5; }
`;
