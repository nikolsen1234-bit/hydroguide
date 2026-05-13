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

const WHITESPACE_RE = /\s+/g;
const CR_RE = /\r/g;
const AI_PREFIX_RE = /^\s*(ki-vurdering|ai-begrunnelse|ai-underbygging)\s*:\s*/i;
const SENTENCE_SPLIT_RE = /(?<=[.!?])\s+/;

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
    project: toCleanText(body.project, 120),
    projectDescription: toCleanText(body.projectDescription, 1200),
    reportExtract: toCleanText(body.reportExtract, 9000),
    location: toCleanText(body.location, 120),
    facilityType: toCleanText(body.facilityType, 120),
    hydrology: toCleanText(body.hydrology, 200),
    mainSolution: toCleanText(body.mainSolution, DEFAULT_FIELD_MAX_LENGTH),
    releaseMethod: toCleanText(body.releaseMethod, DEFAULT_FIELD_MAX_LENGTH),
    primaryMeasurement: toCleanText(body.primaryMeasurement, DEFAULT_FIELD_MAX_LENGTH),
    controlMeasurement: toCleanText(body.controlMeasurement, DEFAULT_FIELD_MAX_LENGTH),
    measurementPrinciple: toCleanText(body.measurementPrinciple, DEFAULT_FIELD_MAX_LENGTH),
    measurementEquipment: toCleanText(body.measurementEquipment, DEFAULT_FIELD_MAX_LENGTH),
    loggerSetup: toCleanText(body.loggerSetup, DEFAULT_FIELD_MAX_LENGTH),
    backupLogger: toCleanText(body.backupLogger, 80),
    communication: toCleanText(body.communication, 150),
    alarmNotification: toCleanText(body.alarmNotification, 120),
    backupSource: toCleanText(body.backupSource, 120),
    backupEnergySource: toCleanText(body.backupEnergySource, 120),
    primaryEnergySource: toCleanText(body.primaryEnergySource, 120),
    backupPowerW: toFiniteNumber(body.backupPowerW),
    batteryBankAh: toFiniteNumber(body.batteryBankAh),
    autonomyDays: toFiniteNumber(body.autonomyDays),
    iceAdaptation: toCleanText(body.iceAdaptation, DEFAULT_FIELD_MAX_LENGTH),
    frostProtection: toCleanText(body.frostProtection, DEFAULT_FIELD_MAX_LENGTH),
    bypass: toCleanText(body.bypass, 150),
    annualSolarProductionKWh: toFiniteNumber(body.annualSolarProductionKWh),
    annualLoadDemandKWh: toFiniteNumber(body.annualLoadDemandKWh),
    annualEnergyBalanceKWh: toFiniteNumber(body.annualEnergyBalanceKWh),
    justification: toStringArray(body.justification),
    additionalRequirements: toStringArray(body.additionalRequirements),
    operationalRequirements: toStringArray(body.operationalRequirements),
    methodCode: toCleanText(body.methodCode, 40),
    methodName: toCleanText(body.methodName, DEFAULT_FIELD_MAX_LENGTH),
    releaseSolutionCode: toCleanText(body.releaseSolutionCode, 20),
    releaseSolutionName: toCleanText(body.releaseSolutionName, DEFAULT_FIELD_MAX_LENGTH),
    measurementMethodCode: toCleanText(body.measurementMethodCode, 20),
    measurementMethodName: toCleanText(body.measurementMethodName, DEFAULT_FIELD_MAX_LENGTH),
    solutionName: toCleanText(body.solutionName, DEFAULT_FIELD_MAX_LENGTH),
    decisionStatus: toCleanText(body.decisionStatus, 40),
    nveAnchors: toStringArray(body.nveAnchors),
    alternativeRecommendations: toStringArray(body.alternativeRecommendations),
    discouragedMethods: toStringArray(body.discouragedMethods),
    missingForFinalChoice: toStringArray(body.missingForFinalChoice),
    documentationRequirements: toStringArray(body.documentationRequirements),
    silentNveRequirements: toStringArray(body.silentNveRequirements),
    releaseRequirementVariation: toCleanText(body.releaseRequirementVariation, 50),
    releaseMethodSelected: toCleanText(body.releaseMethodSelected ?? body.releaseMethod, 80),
    releaseMethodLabel: toCleanText(body.releaseMethodLabel, 120),
    minFlowClass: toCleanText(body.minFlowClass, 40),
    fishMigration: toCleanText(body.fishMigration, 40),
    coandaExists: toCleanText(body.coandaExists, 40),
    siteChallenges: toStringArray(body.siteChallenges),
    powerCommunication: toStringArray(body.powerCommunication),
    publicDisplay: toStringArray(body.publicDisplay),
    hourlyAutomaticLogging: toCleanText(body.hourlyAutomaticLogging, 20),
    secureDataStorageForNve: toCleanText(body.secureDataStorageForNve, 20),
    accuracyWithinFivePercent: toCleanText(body.accuracyWithinFivePercent, 20),
    completenessNinetySevenPercent: toCleanText(body.completenessNinetySevenPercent, 20),
    isSedimentClogging: toCleanText(body.isSedimentClogging, 10),
    fishPassage: toCleanText(body.fishPassage, 10),
    bypassOnOutage: toCleanText(body.bypassOnOutage, 10),
    measurementProfile: toCleanText(body.measurementProfile, 50),
    publicControl: toCleanText(body.publicControl, 10),
    action: toCleanText(body.action, 20) || undefined,
  };
}

// ─── Project data text builders ───

export function buildDocumentedProjectDataText(body: NormalizedBody): string {
  const lines = [
    body.location ? `- Lokasjon: ${body.location}` : "",
    body.facilityType ? `- Type anlegg: ${body.facilityType}` : "",
    body.hydrology ? `- Minstevannføring / variasjon: ${body.hydrology}` : "",
    body.mainSolution ? `- Hovedløsning: ${body.mainSolution}` : "",
    body.releaseMethod ? `- Slippmetode: ${body.releaseMethod}` : "",
    body.primaryMeasurement ? `- Måling i ordinær drift: ${body.primaryMeasurement}` : "",
    body.controlMeasurement ? `- Måleprinsipp: ${body.controlMeasurement}` : "",
    body.measurementPrinciple ? `- Måleprinsipp: ${body.measurementPrinciple}` : "",
    body.measurementEquipment ? `- Måleutstyr: ${body.measurementEquipment}` : "",
    body.loggerSetup ? `- Loggeroppsett: ${body.loggerSetup}` : "",
    body.backupLogger ? `- Reserve-/backup-logger: ${body.backupLogger}` : "",
    body.communication ? `- Kommunikasjon: ${body.communication}` : "",
    body.alarmNotification ? `- Alarm / varsling: ${body.alarmNotification}` : "",
    body.primaryEnergySource ? `- Primær energikilde: ${body.primaryEnergySource}` : "",
    body.backupSource ? `- Reservekilde: ${body.backupSource}` : "",
    body.backupEnergySource ? `- Reserveenergikilde: ${body.backupEnergySource}` : "",
    body.backupPowerW !== null ? `- Reserveeffekt: ${formatNumber(body.backupPowerW, "W")}` : "",
    body.batteryBankAh !== null ? `- Batteribank: ${formatNumber(body.batteryBankAh, "Ah")}` : "",
    body.autonomyDays !== null ? `- Autonomi: ${formatNumber(body.autonomyDays, "dagar")}` : "",
    body.frostProtection ? `- Frostsikring: ${body.frostProtection}` : "",
    body.iceAdaptation ? `- Istilpassing: ${body.iceAdaptation}` : "",
    body.bypass ? `- Bypass / reserveslipp: ${body.bypass}` : "",
    body.annualSolarProductionKWh !== null
      ? `- Solproduksjon per ar: ${formatNumber(body.annualSolarProductionKWh, "kWh")}`
      : "",
    body.annualLoadDemandKWh !== null
      ? `- Last per ar: ${formatNumber(body.annualLoadDemandKWh, "kWh")}`
      : "",
    body.annualEnergyBalanceKWh !== null
      ? `- Energibalanse per ar: ${formatNumber(body.annualEnergyBalanceKWh, "kWh")}`
      : "",
  ].filter(Boolean);

  return lines.length > 0 ? lines.join("\n") : "- Ingen dokumenterte prosjektdata oppgitt.";
}

export function buildSupplementaryProjectDataText(body: NormalizedBody): string {
  const lines = [
    body.justification.length > 0 ? `- Grunngiving: ${body.justification.join("; ")}` : "",
    body.additionalRequirements.length > 0 ? `- Tilleggskrav: ${body.additionalRequirements.join("; ")}` : "",
    body.operationalRequirements.length > 0 ? `- Drift og tilpassing: ${body.operationalRequirements.join("; ")}` : "",
    body.methodCode ? `- Vald metodekode: ${body.methodCode}` : "",
    body.releaseSolutionCode ? `- Slippløysing: ${body.releaseSolutionCode} ${body.releaseSolutionName}` : "",
    body.measurementMethodCode ? `- Målemetode: ${body.measurementMethodCode} ${body.measurementMethodName}` : "",
    body.decisionStatus ? `- Beslutningsstatus: ${body.decisionStatus}` : "",
    body.nveAnchors.length > 0 ? `- Regelanker: ${body.nveAnchors.join(", ")}` : "",
    body.missingForFinalChoice.length > 0 ? `- Manglar for endeleg val: ${body.missingForFinalChoice.join("; ")}` : "",
    body.discouragedMethods.length > 0 ? `- Frårådde løysingar: ${body.discouragedMethods.join("; ")}` : "",
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
  projectDescription: string;
  reportExtract: string;
  documented_project_data: string;
  supplementary_project_data: string;
  nve_snippets: string;
} {
  const hardChars = (rules.max_input_tokens_hard ?? DEFAULT_INPUT_TOKEN_HARD) * APPROX_CHARS_PER_TOKEN;

  let projectDescription = body.projectDescription || "Ingen eiga prosjektbeskriving oppgitt.";
  let reportExtract = body.reportExtract || "Ingen rapportutdrag oppgitt.";
  let documented_project_data = documentedProjectDataText;
  let supplementary_project_data = supplementaryProjectDataText;
  let nve_snippets = nveSnippetsText;

  const currentLength = () =>
    fillTemplate(userTemplate, {
      project: body.project || "Uoppgitt",
      projectDescription,
      documented_project_data,
      supplementary_project_data,
      reportExtract,
      nve_snippets,
    }).length;

  if (currentLength() <= hardChars) {
    return {
      projectDescription,
      reportExtract,
      documented_project_data,
      supplementary_project_data,
      nve_snippets,
    };
  }

  supplementary_project_data = "- Supplerande opplysningar kutta av omsyn til inputstorleik.";
  if (currentLength() <= hardChars) {
    return {
      projectDescription,
      reportExtract,
      documented_project_data,
      supplementary_project_data,
      nve_snippets,
    };
  }

  nve_snippets = nve_snippets.slice(0, Math.max(700, Math.floor(hardChars * 0.3))).trim();
  if (currentLength() <= hardChars) {
    return {
      projectDescription,
      reportExtract,
      documented_project_data,
      supplementary_project_data,
      nve_snippets,
    };
  }

  projectDescription = projectDescription.slice(0, Math.max(500, Math.floor(hardChars * 0.12))).trim();
  if (currentLength() <= hardChars) {
    return {
      projectDescription,
      reportExtract,
      documented_project_data,
      supplementary_project_data,
      nve_snippets,
    };
  }

  const remainingForReport = Math.max(1200, hardChars - currentLength() + reportExtract.length - 300);
  reportExtract = reportExtract.slice(0, remainingForReport).trim();

  return {
    projectDescription,
    reportExtract,
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
    .replace(WHITESPACE_RE, " ")
    .trim();
}

export function finalizeAiText(text: string, rules: Rules): string {
  const maxWords = rules.max_words ?? DEFAULT_MAX_WORDS;
  const maxSentences = rules.max_sentences ?? DEFAULT_MAX_SENTENCES;

  const normalized = String(text ?? "")
    .replace(CR_RE, "")
    .replace(AI_PREFIX_RE, "")
    .replace(WHITESPACE_RE, " ")
    .trim();

  if (!normalized) {
    return "";
  }

  const sentences = normalized
    .split(SENTENCE_SPLIT_RE)
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
    throw new Error("AI Gateway er ikke konfigurert.");
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
  const feedbackModel = env.SELF_FEEDBACK_MODEL ?? "gpt-5.4";
  const maxOutputTokens = 200;

  // Load feedback prompt from KV
  let feedbackPrompt = await env.REPORT_RULES?.get("prompt:self_feedback:v1");
  if (!feedbackPrompt) {
    feedbackPrompt = `Vurder denne teksten på en skala fra 1-5. Returner JSON: {"score": N, "flags": ["..."]}
Krav: Teksten skal være på bokmål, 120-250 ord, underbygge løsningen med NVE-kilder, skille tydelig mellom slippløsning og målemetode, og være selvstendig lesbar uten resten av rapporten.`;
  }

  const userMsg = `TEKST:\n${generatedText}\n\nEVIDENS:\n${evidenceText}\n\nLØSNING: ${body.mainSolution ?? ""}\nPRIMÆRMÅLING: ${body.primaryMeasurement ?? ""}\nMÅLEPRINSIPP: ${body.controlMeasurement ?? ""}`;

  try {
    const result = await callViaGateway(env, feedbackPrompt, userMsg, feedbackModel, maxOutputTokens);
    const raw = extractOpenAiText(result.raw);
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
  await env.REPORT_RULES?.put(feedbackKey, feedbackData, { expirationTtl: 90 * 86400 });

  // Append to monthly log
  const monthKey = `feedback:log:${new Date().toISOString().slice(0, 7)}`;
  const existing = (await env.REPORT_RULES?.get(monthKey)) ?? "[]";
  try {
    const log = JSON.parse(existing);
    log.push({ token, rating, comment, timestamp: new Date().toISOString() });
    await env.REPORT_RULES?.put(monthKey, JSON.stringify(log));
  } catch {
    // If log is corrupt, start fresh
    await env.REPORT_RULES?.put(monthKey, JSON.stringify([{ token, rating, comment, timestamp: new Date().toISOString() }]));
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
    const text = finalizeAiText(extractOpenAiText(result.raw), rules);
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
    const text = finalizeAiText(extractOpenAiText(result.raw), rules);
    if (text) {
      return { text, model: result.model, source: "openai-gateway-fallback", gatewayUsed: true, fallbackStep: 2 };
    }
    errors.push("Steg 2 (gateway fallback): tom tekst");
  } catch (error) {
    errors.push(`Steg 2 (gateway fallback): ${error instanceof Error ? error.message : "ukjend feil"}`);
  }

  // All steps failed
  throw new Error(`Alle genereringssteg feilet:\n${errors.join("\n")}`);
}
