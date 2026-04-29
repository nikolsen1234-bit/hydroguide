import type {
  Env,
  Rules,
  NormalizedBody,
  OpenAIResponsePayload,
  GenerationResult,
} from "./types.js";
import {
  DEFAULT_MODEL_PRIMARY,
  DEFAULT_MODEL_FALLBACK,
  DEFAULT_MAX_OUTPUT_TOKENS,
  DEFAULT_MAX_WORDS,
  DEFAULT_MAX_SENTENCES,
  DEFAULT_INPUT_TOKEN_HARD,
  DEFAULT_FIELD_MAX_LENGTH,
  DEFAULT_AI_GATEWAY_CACHE_TTL,
  DEFAULT_AI_GATEWAY_REQUEST_TIMEOUT_MS,
  DEFAULT_AI_GATEWAY_MAX_ATTEMPTS,
  DEFAULT_AI_GATEWAY_RETRY_DELAY_MS,
  APPROX_CHARS_PER_TOKEN,
} from "./types.js";
import {
  toCleanText,
  toFiniteNumber,
  toStringArray,
  formatNumber,
  countWords,
  truncateToWordLimit,
  fillTemplate,
  parsePositiveInteger,
  parseBooleanFlag,
  parseRetryBackoff,
} from "./utils.js";
import { resolveSecret, jsonResponse } from "./auth.js";

// ─── Gateway helpers ───

function isGatewayEnabled(env: Env): boolean {
  return (
    parseBooleanFlag(env.AI_GATEWAY_ENABLED, true) &&
    Boolean(env.AI_GATEWAY_AUTH_TOKEN) &&
    Boolean(env.AI_GATEWAY_ACCOUNT_ID) &&
    Boolean(env.AI_GATEWAY_ID)
  );
}

function buildGatewayResponsesUrl(env: Env): string {
  return `https://gateway.ai.cloudflare.com/v1/${env.AI_GATEWAY_ACCOUNT_ID}/${env.AI_GATEWAY_ID}/openai/responses`;
}

// ─── Body normalization ───

export function normalizeBody(raw: unknown): NormalizedBody | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }

  const body = raw as Record<string, unknown>;

  return {
    prosjekt: toCleanText(body.prosjekt, 120),
    prosjektbeskrivelse: toCleanText(body.prosjektbeskrivelse, 1200),
    rapportutdrag: toCleanText(body.rapportutdrag, 9000),
    lokasjon: toCleanText(body.lokasjon, 120),
    anleggstype: toCleanText(body.anleggstype, 120),
    hydrologi: toCleanText(body.hydrologi, 200),
    hovudloysing: toCleanText(body.hovudloysing, DEFAULT_FIELD_MAX_LENGTH),
    slippmetode: toCleanText(body.slippmetode, DEFAULT_FIELD_MAX_LENGTH),
    primaermaaling: toCleanText(body.primaermaaling, DEFAULT_FIELD_MAX_LENGTH),
    kontrollmaaling: toCleanText(body.kontrollmaaling, DEFAULT_FIELD_MAX_LENGTH),
    maleprinsipp: toCleanText(body.maleprinsipp, DEFAULT_FIELD_MAX_LENGTH),
    maleutstyr: toCleanText(body.maleutstyr, DEFAULT_FIELD_MAX_LENGTH),
    loggeroppsett: toCleanText(body.loggeroppsett, DEFAULT_FIELD_MAX_LENGTH),
    reserveLogger: toCleanText(body.reserveLogger, 80),
    kommunikasjon: toCleanText(body.kommunikasjon, 150),
    alarmVarsling: toCleanText(body.alarmVarsling, 120),
    reservekjelde: toCleanText(body.reservekjelde, 120),
    reserveEnergikjelde: toCleanText(body.reserveEnergikjelde, 120),
    primaerEnergikjelde: toCleanText(body.primaerEnergikjelde, 120),
    reserveeffektW: toFiniteNumber(body.reserveeffektW),
    batteribankAh: toFiniteNumber(body.batteribankAh),
    autonomiDagar: toFiniteNumber(body.autonomiDagar),
    istilpassing: toCleanText(body.istilpassing, DEFAULT_FIELD_MAX_LENGTH),
    frostsikring: toCleanText(body.frostsikring, DEFAULT_FIELD_MAX_LENGTH),
    bypass: toCleanText(body.bypass, 150),
    arsproduksjonSolKWh: toFiniteNumber(body.arsproduksjonSolKWh),
    arslastKWh: toFiniteNumber(body.arslastKWh),
    arsbalanseKWh: toFiniteNumber(body.arsbalanseKWh),
    solproduksjonPerArKWh: toFiniteNumber(body.solproduksjonPerArKWh),
    lastPerArKWh: toFiniteNumber(body.lastPerArKWh),
    energibalansePerArKWh: toFiniteNumber(body.energibalansePerArKWh),
    grunngiving: toStringArray(body.grunngiving),
    tilleggskrav: toStringArray(body.tilleggskrav),
    driftskrav: toStringArray(body.driftskrav),
    // v2 structured answer fields
    slippkravvariasjon: toCleanText(body.slippkravvariasjon, 50),
    slippmetodeVal: toCleanText(body.slippmetodeVal ?? body.slippmetode, 80),
    isSedimentTilstopping: toCleanText(body.isSedimentTilstopping, 10),
    fiskepassasje: toCleanText(body.fiskepassasje, 10),
    bypassVedDriftsstans: toCleanText(body.bypassVedDriftsstans, 10),
    maleprofil: toCleanText(body.maleprofil, 50),
    allmentaKontroll: toCleanText(body.allmentaKontroll, 10),
    action: toCleanText(body.action, 20) || undefined,
  };
}

// ─── Project data text builders ───

export function buildDocumentedProjectDataText(body: NormalizedBody): string {
  const lines = [
    body.lokasjon ? `- Lokasjon: ${body.lokasjon}` : "",
    body.anleggstype ? `- Type anlegg: ${body.anleggstype}` : "",
    body.hydrologi ? `- Minstevassforing / variasjon: ${body.hydrologi}` : "",
    body.hovudloysing ? `- Hovudloysing: ${body.hovudloysing}` : "",
    body.slippmetode ? `- Slippmetode: ${body.slippmetode}` : "",
    body.primaermaaling ? `- Maling i ordinaer drift: ${body.primaermaaling}` : "",
    body.kontrollmaaling ? `- Kontrollmaling for verifikasjon: ${body.kontrollmaaling}` : "",
    body.maleprinsipp ? `- Maleprinsipp: ${body.maleprinsipp}` : "",
    body.maleutstyr ? `- Maleutstyr: ${body.maleutstyr}` : "",
    body.loggeroppsett ? `- Loggeroppsett: ${body.loggeroppsett}` : "",
    body.reserveLogger ? `- Reserve-/backup-logger: ${body.reserveLogger}` : "",
    body.kommunikasjon ? `- Kommunikasjon: ${body.kommunikasjon}` : "",
    body.alarmVarsling ? `- Alarm / varsling: ${body.alarmVarsling}` : "",
    body.primaerEnergikjelde ? `- Primaer energikjelde: ${body.primaerEnergikjelde}` : "",
    body.reservekjelde ? `- Reservekjelde: ${body.reservekjelde}` : "",
    body.reserveEnergikjelde ? `- Reserve energikjelde: ${body.reserveEnergikjelde}` : "",
    body.reserveeffektW !== null ? `- Reserveeffekt: ${formatNumber(body.reserveeffektW, "W")}` : "",
    body.batteribankAh !== null ? `- Batteribank: ${formatNumber(body.batteribankAh, "Ah")}` : "",
    body.autonomiDagar !== null ? `- Autonomi: ${formatNumber(body.autonomiDagar, "dagar")}` : "",
    body.frostsikring ? `- Frostsikring: ${body.frostsikring}` : "",
    body.istilpassing ? `- Istilpassing: ${body.istilpassing}` : "",
    body.bypass ? `- Bypass / reserveslipp: ${body.bypass}` : "",
    (body.solproduksjonPerArKWh ?? body.arsproduksjonSolKWh) !== null
      ? `- Solproduksjon per ar: ${formatNumber(body.solproduksjonPerArKWh ?? body.arsproduksjonSolKWh, "kWh")}`
      : "",
    (body.lastPerArKWh ?? body.arslastKWh) !== null
      ? `- Last per ar: ${formatNumber(body.lastPerArKWh ?? body.arslastKWh, "kWh")}`
      : "",
    (body.energibalansePerArKWh ?? body.arsbalanseKWh) !== null
      ? `- Energibalanse per ar: ${formatNumber(body.energibalansePerArKWh ?? body.arsbalanseKWh, "kWh")}`
      : "",
  ].filter(Boolean);

  return lines.length > 0 ? lines.join("\n") : "- Ingen dokumenterte prosjektdata oppgitt.";
}

export function buildSupplementaryProjectDataText(body: NormalizedBody): string {
  const lines = [
    body.grunngiving.length > 0 ? `- Grunngiving: ${body.grunngiving.join("; ")}` : "",
    body.tilleggskrav.length > 0 ? `- Tilleggskrav: ${body.tilleggskrav.join("; ")}` : "",
    body.driftskrav.length > 0 ? `- Drift og tilpassing: ${body.driftskrav.join("; ")}` : "",
  ].filter(Boolean);

  return lines.length > 0 ? lines.join("\n") : "- Ingen supplerande opplysningar oppgitt.";
}

// ─── Prompt size clamping ───

export function clampPromptSize(
  body: NormalizedBody,
  userTemplate: string,
  documentedProjectDataText: string,
  supplementaryProjectDataText: string,
  nveSnippetsText: string,
  rules: Rules
): {
  prosjektbeskrivelse: string;
  rapportutdrag: string;
  documented_project_data: string;
  supplementary_project_data: string;
  nve_snippets: string;
} {
  const hardChars = (rules.max_input_tokens_hard ?? DEFAULT_INPUT_TOKEN_HARD) * APPROX_CHARS_PER_TOKEN;

  let prosjektbeskrivelse = body.prosjektbeskrivelse || "Ingen eiga prosjektbeskriving oppgitt.";
  let rapportutdrag = body.rapportutdrag || "Ingen rapportutdrag oppgitt.";
  let documented_project_data = documentedProjectDataText;
  let supplementary_project_data = supplementaryProjectDataText;
  let nve_snippets = nveSnippetsText;

  const currentLength = () =>
    fillTemplate(userTemplate, {
      prosjekt: body.prosjekt || "Uoppgitt",
      prosjektbeskrivelse,
      documented_project_data,
      supplementary_project_data,
      rapportutdrag,
      nve_snippets,
    }).length;

  if (currentLength() <= hardChars) {
    return {
      prosjektbeskrivelse,
      rapportutdrag,
      documented_project_data,
      supplementary_project_data,
      nve_snippets,
    };
  }

  supplementary_project_data = "- Supplerande opplysningar kutta av omsyn til inputstorleik.";
  if (currentLength() <= hardChars) {
    return {
      prosjektbeskrivelse,
      rapportutdrag,
      documented_project_data,
      supplementary_project_data,
      nve_snippets,
    };
  }

  nve_snippets = nve_snippets.slice(0, Math.max(700, Math.floor(hardChars * 0.3))).trim();
  if (currentLength() <= hardChars) {
    return {
      prosjektbeskrivelse,
      rapportutdrag,
      documented_project_data,
      supplementary_project_data,
      nve_snippets,
    };
  }

  prosjektbeskrivelse = prosjektbeskrivelse.slice(0, Math.max(500, Math.floor(hardChars * 0.12))).trim();
  if (currentLength() <= hardChars) {
    return {
      prosjektbeskrivelse,
      rapportutdrag,
      documented_project_data,
      supplementary_project_data,
      nve_snippets,
    };
  }

  const remainingForReport = Math.max(1200, hardChars - currentLength() + rapportutdrag.length - 300);
  rapportutdrag = rapportutdrag.slice(0, remainingForReport).trim();

  return {
    prosjektbeskrivelse,
    rapportutdrag,
    documented_project_data,
    supplementary_project_data,
    nve_snippets,
  };
}

// ─── LLM generation — OpenAI only, no Workers AI ───

export function resolvePrimaryModel(env: Env): string {
  return env.OPENAI_MODEL_PRIMARY || env.OPENAI_MODEL || DEFAULT_MODEL_PRIMARY;
}

export function resolveFallbackModel(env: Env): string {
  return env.OPENAI_MODEL_FALLBACK || DEFAULT_MODEL_FALLBACK;
}

export function buildResponsesBody(
  systemPrompt: string,
  userPrompt: string,
  model: string,
  maxOutputTokens: number
): Record<string, unknown> {
  return {
    model,
    instructions: systemPrompt,
    input: userPrompt,
    max_output_tokens: maxOutputTokens,
  };
}

export function collectOpenAiText(value: unknown, bucket: string[] = []): string[] {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed) {
      bucket.push(trimmed);
    }

    return bucket;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectOpenAiText(item, bucket);
    }

    return bucket;
  }

  if (!value || typeof value !== "object") {
    return bucket;
  }

  const obj = value as Record<string, unknown>;

  for (const key of ["response", "text", "output_text", "content", "value", "message", "choices", "output", "items"]) {
    if (key in obj) {
      collectOpenAiText(obj[key], bucket);
    }
  }

  return bucket;
}

export function extractOpenAiText(payload: OpenAIResponsePayload): string {
  return collectOpenAiText([
    payload?.choices?.[0]?.message?.content,
    payload?.output_text,
    payload?.output,
  ])
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

export function extractResponseText(payload: OpenAIResponsePayload): string {
  return extractOpenAiText(payload);
}

export function finalizeAiText(text: string, rules: Rules): string {
  const maxWords = rules.max_words ?? DEFAULT_MAX_WORDS;
  const maxSentences = rules.max_sentences ?? DEFAULT_MAX_SENTENCES;

  const normalized = String(text ?? "")
    .replace(/\r/g, "")
    .replace(/^\s*(ki-vurdering|ai-begrunnelse|ai-underbygging)\s*:\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!normalized) {
    return "";
  }

  const sentences = normalized
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);

  const selected: string[] = [];
  let wordCount = 0;

  for (const sentence of sentences) {
    const sentenceWordCount = countWords(sentence);
    if (selected.length >= maxSentences) {
      break;
    }

    if (sentenceWordCount === 0) {
      continue;
    }

    if (wordCount + sentenceWordCount > maxWords) {
      break;
    }

    selected.push(sentence);
    wordCount += sentenceWordCount;
  }

  if (selected.length > 0) {
    return selected.join(" ").trim();
  }

  return truncateToWordLimit(normalized, maxWords);
}

export async function callViaGateway(
  env: Env,
  systemPrompt: string,
  userPrompt: string,
  model: string,
  maxOutputTokens: number
): Promise<{ raw: OpenAIResponsePayload; model: string }> {
  if (!isGatewayEnabled(env)) {
    throw new Error("AI Gateway er ikkje konfigurert.");
  }

  const requestTimeoutMs = parsePositiveInteger(
    env.AI_GATEWAY_REQUEST_TIMEOUT_MS,
    DEFAULT_AI_GATEWAY_REQUEST_TIMEOUT_MS
  );
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), requestTimeoutMs + 2000);

  try {
    const gatewayAuthToken = await resolveSecret(env.AI_GATEWAY_AUTH_TOKEN);
    const response = await fetch(buildGatewayResponsesUrl(env), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "cf-aig-authorization": `Bearer ${gatewayAuthToken}`,
        "cf-aig-request-timeout": String(requestTimeoutMs),
        "cf-aig-cache-ttl": String(parsePositiveInteger(env.AI_GATEWAY_CACHE_TTL, DEFAULT_AI_GATEWAY_CACHE_TTL)),
        "cf-aig-max-attempts": String(parsePositiveInteger(env.AI_GATEWAY_MAX_ATTEMPTS, DEFAULT_AI_GATEWAY_MAX_ATTEMPTS)),
        "cf-aig-retry-delay": String(parsePositiveInteger(env.AI_GATEWAY_RETRY_DELAY_MS, DEFAULT_AI_GATEWAY_RETRY_DELAY_MS)),
        "cf-aig-backoff": parseRetryBackoff(env.AI_GATEWAY_RETRY_BACKOFF),
      },
      body: JSON.stringify(buildResponsesBody(systemPrompt, userPrompt, model, maxOutputTokens)),
      signal: controller.signal,
    });

    const payload = (await response.json().catch(() => ({}))) as OpenAIResponsePayload & {
      error?: { message?: string };
    };

    if (!response.ok) {
      throw new Error(payload?.error?.message || `AI Gateway feil (${response.status})`);
    }

    return { raw: payload, model };
  } finally {
    clearTimeout(timeout);
  }
}

// ─── Self-feedback: LLM evaluates its own generated text ───

export interface SelfFeedbackResult {
  score: number;        // 1-5
  flags: string[];      // weak points identified
  regenerated: boolean; // was text regenerated?
  model: string;        // model used for feedback
}

export async function runSelfFeedback(
  env: Env,
  generatedText: string,
  evidenceText: string,
  body: NormalizedBody,
  rules: Rules
): Promise<SelfFeedbackResult> {
  const feedbackModel = env.SELF_FEEDBACK_MODEL ?? "gpt-5.4-mini";
  const maxOutputTokens = 200;

  // Load feedback prompt from KV
  let feedbackPrompt = await env.PROMPT_KV?.get("prompt:self_feedback:v1");
  if (!feedbackPrompt) {
    feedbackPrompt = `Vurder denne teksten på ein skala frå 1-5. Returner JSON: {"score": N, "flags": ["..."]}
Krav: Teksten skal vere på nynorsk, 120-250 ord, underbygge løysinga med NVE-kjelder, ikkje blande kontrollmåling med primærmåling, og vere sjølvberande (lesbar utan resten av rapporten).`;
  }

  const userMsg = `TEKST:\n${generatedText}\n\nEVIDENS:\n${evidenceText}\n\nLØYSING: ${body.hovudloysing ?? ""}\nPRIMÆRMÅLING: ${body.primaermaaling ?? ""}\nKONTROLLMÅLING: ${body.kontrollmaaling ?? ""}`;

  try {
    const result = await callViaGateway(env, feedbackPrompt, userMsg, feedbackModel, maxOutputTokens);
    const raw = extractResponseText(result.raw);
    const parsed = JSON.parse(raw);
    return {
      score: typeof parsed.score === "number" ? parsed.score : 3,
      flags: Array.isArray(parsed.flags) ? parsed.flags : [],
      regenerated: false,
      model: feedbackModel,
    };
  } catch {
    return { score: 3, flags: ["feedback-feil"], regenerated: false, model: feedbackModel };
  }
}

// ─── User feedback: store in KV ───

export async function handleUserFeedback(
  env: Env,
  body: Record<string, unknown>,
  corsHeaders: Record<string, string>
): Promise<Response> {
  if (!parseBooleanFlag(env.USER_FEEDBACK_ENABLED, false)) {
    return jsonResponse({ error: "Feedback er deaktivert." }, 403, corsHeaders);
  }

  const token = String(body.feedbackToken ?? "").trim();
  const rating = body.rating; // "up" | "down"
  const comment = String(body.comment ?? "").trim().slice(0, 500);

  if (!token || !["up", "down"].includes(String(rating))) {
    return jsonResponse({ error: "Manglar feedbackToken og/eller rating (up/down)." }, 400, corsHeaders);
  }

  const feedbackKey = `feedback:${token}`;
  const feedbackData = JSON.stringify({
    rating,
    comment,
    timestamp: new Date().toISOString(),
  });

  // Store individual feedback (90 day TTL)
  await env.PROMPT_KV?.put(feedbackKey, feedbackData, { expirationTtl: 90 * 86400 });

  // Append to monthly log
  const monthKey = `feedback:log:${new Date().toISOString().slice(0, 7)}`;
  const existing = (await env.PROMPT_KV?.get(monthKey)) ?? "[]";
  try {
    const log = JSON.parse(existing);
    log.push({ token, rating, comment, timestamp: new Date().toISOString() });
    await env.PROMPT_KV?.put(monthKey, JSON.stringify(log));
  } catch {
    // If log is corrupt, start fresh
    await env.PROMPT_KV?.put(monthKey, JSON.stringify([{ token, rating, comment, timestamp: new Date().toISOString() }]));
  }

  return jsonResponse({ ok: true }, 200, corsHeaders);
}

// ─── Generation with fallback chain ───

export async function generateWithFallback(
  env: Env,
  systemPrompt: string,
  userPrompt: string,
  rules: Rules
): Promise<GenerationResult> {
  const primaryModel = resolvePrimaryModel(env);
  const fallbackModel = resolveFallbackModel(env);
  const maxOutputTokens = rules.max_output_tokens ?? DEFAULT_MAX_OUTPUT_TOKENS;
  const errors: string[] = [];

  // Step 1: Gateway → primary model (cached + retried)
  try {
    const result = await callViaGateway(env, systemPrompt, userPrompt, primaryModel, maxOutputTokens);
    const text = finalizeAiText(extractResponseText(result.raw), rules);
    if (text) {
      return { text, model: result.model, source: "openai-gateway", gatewayUsed: true, fallbackStep: 1 };
    }
    errors.push("Steg 1 (gateway primary): tom tekst");
  } catch (error) {
    errors.push(`Steg 1 (gateway primary): ${error instanceof Error ? error.message : "ukjend feil"}`);
  }

  // Step 2: Gateway → fallback model (lighter, more likely to succeed)
  try {
    const result = await callViaGateway(env, systemPrompt, userPrompt, fallbackModel, maxOutputTokens);
    const text = finalizeAiText(extractResponseText(result.raw), rules);
    if (text) {
      return { text, model: result.model, source: "openai-gateway-fallback", gatewayUsed: true, fallbackStep: 2 };
    }
    errors.push("Steg 2 (gateway fallback): tom tekst");
  } catch (error) {
    errors.push(`Steg 2 (gateway fallback): ${error instanceof Error ? error.message : "ukjend feil"}`);
  }

  // All steps failed
  throw new Error(`Alle genereringssteg feila:\n${errors.join("\n")}`);
}
