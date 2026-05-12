/**
 * POST /api/report
 *
 * Report Worker proxy. Validates report access hash and forwards to the local
 * report-agent bridge through Cloudflare Tunnel.
 */

import {
  REPORT_JSON_BODY_MAX_BYTES,
  RATE_LIMIT_WINDOW_MS_1MIN
} from "./_constants.js";
import {
  checkRateLimit,
  constantTimeEquals,
  createJsonResponse,
  createMethodNotAllowedResponse,
  readJsonRequest
} from "./_edgeUtils.js";

const EMBEDDED_HASH_RE = /[a-f0-9]{64}/;
const HASH_64_RE = /^[a-f0-9]{64}$/;

const REQUEST_TIMEOUT_MS = 120000;
const REPORT_RATE_LIMIT_MAX_REQUESTS = 20;
const REPORT_RATE_LIMIT_WINDOW_MS = RATE_LIMIT_WINDOW_MS_1MIN;
const REPORT_AUTH_FAILURE_LIMIT_MAX_ATTEMPTS = 10;
const REPORT_AUTH_FAILURE_LIMIT_WINDOW_MS = 3 * RATE_LIMIT_WINDOW_MS_1MIN;
const REPORT_REQUEST_BODY_MAX_BYTES = REPORT_JSON_BODY_MAX_BYTES;
const REPORT_ALLOWED_ORIGINS = new Set([
  "https://hydroguide.no",
  "https://www.hydroguide.no",
  "http://127.0.0.1:5173",
  "http://localhost:5173",
  "http://127.0.0.1:4173",
  "http://localhost:4173"
]);

function normalizeExpectedHash(rawValue) {
  const normalized = String(rawValue ?? "")
    .trim()
    .toLowerCase();

  const embeddedHash = normalized.match(EMBEDDED_HASH_RE);
  return embeddedHash ? embeddedHash[0] : normalized;
}

function validateAiAccess(body, env) {
  const expectedHash = normalizeExpectedHash(env?.REPORT_ACCESS_CODE_HASH);

  if (!expectedHash) {
    return "__CONFIG_MISSING__";
  }

  const providedHash = String(body?.accessCodeHash ?? body?.tilgangskodeHash ?? "")
    .trim()
    .toLowerCase();

  if (!HASH_64_RE.test(providedHash)) {
    return "Mangler tilgangskode.";
  }

  if (!constantTimeEquals(providedHash, expectedHash)) {
    return "Ugyldig tilgangskode.";
  }

  return null;
}

function readReportCorsHeaders(request) {
  const origin = (request?.headers?.get("origin") ?? "").trim();
  const headers = {
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers": "Content-Type, Accept",
    "access-control-max-age": "86400",
    vary: "Origin"
  };

  if (REPORT_ALLOWED_ORIGINS.has(origin)) {
    headers["access-control-allow-origin"] = origin;
  }

  return headers;
}

function createReportResponse(context, payload, options = {}) {
  const { headers = {}, ...rest } = options;
  return createJsonResponse(payload, {
    ...rest,
    headers: {
      ...readReportCorsHeaders(context.request),
      ...headers
    }
  });
}

function readReportRequestError(error) {
  const message = error instanceof Error ? error.message : "";
  if (message.includes("application/json")) {
    return "Forespørselen må bruke application/json.";
  }
  if (message.includes("manglar JSON") || message.includes("empty")) {
    return "Forespørselen mangler JSON-innhold.";
  }
  if (message.includes("for stor") || message.includes("too large")) {
    return "Forespørselen er for stor.";
  }
  if (message.includes("JSON-objekt")) {
    return "Forespørselen må være et JSON-objekt.";
  }
  return "Ugyldig forespørsel.";
}

function buildBridgeReportUrl(rawUrl) {
  const url = new URL(String(rawUrl ?? "").trim());
  if (url.protocol !== "https:") {
    throw new Error("REPORT_BRIDGE_URL must use HTTPS.");
  }

  const pathname = url.pathname.replace(/\/+$/, "");
  url.pathname = pathname.endsWith("/report") ? pathname : `${pathname}/report`;
  return url.toString();
}

function readPayloadValue(body, primaryKey, legacyKey) {
  return body?.[primaryKey] ?? body?.[legacyKey];
}

export async function onRequestPost(context) {
  const rateLimit = await checkRateLimit({
    request: context.request,
    keyPrefix: "report",
    limit: REPORT_RATE_LIMIT_MAX_REQUESTS,
    windowMs: REPORT_RATE_LIMIT_WINDOW_MS
  });

  if (!rateLimit.allowed) {
    return createReportResponse(
      context,
      { error: "For mange rapportforespørsler akkurat nå. Prøv igjen om litt." },
      {
        status: 429,
        headers: {
          "retry-after": String(rateLimit.retryAfterSeconds)
        }
      }
    );
  }

  let rawBody;
  try {
    rawBody = await readJsonRequest(context.request, {
      maxBytes: REPORT_REQUEST_BODY_MAX_BYTES
    });
  } catch (error) {
    return createReportResponse(
      context,
      { error: readReportRequestError(error) },
      { status: 400 }
    );
  }

  const accessError = validateAiAccess(rawBody, context.env);
  if (accessError === "__CONFIG_MISSING__") {
    return createReportResponse(
      context,
      { error: "Rapportagenten er ikke konfigurert: mangler REPORT_ACCESS_CODE_HASH." },
      { status: 503 }
    );
  }

  if (accessError) {
    const authFailureLimit = await checkRateLimit({
      request: context.request,
      keyPrefix: "report-auth-fail",
      limit: REPORT_AUTH_FAILURE_LIMIT_MAX_ATTEMPTS,
      windowMs: REPORT_AUTH_FAILURE_LIMIT_WINDOW_MS
    });

    if (!authFailureLimit.allowed) {
      return createReportResponse(
        context,
        { error: "For mange mislykkede forsøk. Rapportagenten er midlertidig sperret for denne klienten." },
        {
          status: 429,
          headers: {
            "retry-after": String(authFailureLimit.retryAfterSeconds)
          }
        }
      );
    }

    return createReportResponse(context, { error: accessError }, { status: 403 });
  }

  const bridgeToken = String(context.env?.REPORT_BRIDGE_TOKEN ?? "").trim();
  const rawBridgeUrl = String(context.env?.REPORT_BRIDGE_URL ?? "").trim();
  if (!bridgeToken || !rawBridgeUrl) {
    return createReportResponse(context, { error: "Rapportagenten er ikke konfigurert." }, { status: 503 });
  }

  try {
    const bridgeUrl = buildBridgeReportUrl(rawBridgeUrl);
    const requestId = crypto.randomUUID();
    const sanitizedBody = {
      project: readPayloadValue(rawBody, "project", "prosjekt"),
      location: readPayloadValue(rawBody, "location", "lokasjon"),
      projectDescription: readPayloadValue(rawBody, "projectDescription", "prosjektbeskrivelse"),
      facilityType: readPayloadValue(rawBody, "facilityType", "anleggstype"),
      hydrology: rawBody.hydrology,
      mainSolution: readPayloadValue(rawBody, "mainSolution", "hovudloysing"),
      releaseMethod: readPayloadValue(rawBody, "releaseMethod", "slippmetode"),
      primaryMeasurement: readPayloadValue(rawBody, "primaryMeasurement", "primaermaaling"),
      controlMeasurement: readPayloadValue(rawBody, "controlMeasurement", "kontrollmaaling"),
      measurementPrinciple: readPayloadValue(rawBody, "measurementPrinciple", "maleprinsipp"),
      measurementEquipment: readPayloadValue(rawBody, "measurementEquipment", "maleutstyr"),
      loggerSetup: readPayloadValue(rawBody, "loggerSetup", "loggeroppsett"),
      backupLogger: rawBody.backupLogger ?? rawBody.reserveLogger,
      communication: readPayloadValue(rawBody, "communication", "kommunikasjon"),
      alarmNotification: readPayloadValue(rawBody, "alarmNotification", "alarmVarsling"),
      backupSource: readPayloadValue(rawBody, "backupSource", "reservekjelde"),
      backupEnergySource: readPayloadValue(rawBody, "backupEnergySource", "reserveEnergikjelde"),
      primaryEnergySource: readPayloadValue(rawBody, "primaryEnergySource", "primaerEnergikjelde"),
      backupPowerW: readPayloadValue(rawBody, "backupPowerW", "reserveeffektW"),
      batteryBankAh: rawBody.batteryBankAh ?? rawBody.batteribankAh,
      autonomyDays: readPayloadValue(rawBody, "autonomyDays", "autonomiDagar"),
      iceAdaptation: readPayloadValue(rawBody, "iceAdaptation", "istilpassing"),
      frostProtection: readPayloadValue(rawBody, "frostProtection", "frostsikring"),
      bypass: rawBody.bypass,
      annualSolarProductionKWh: readPayloadValue(rawBody, "annualSolarProductionKWh", "arsproduksjonSolKWh"),
      annualLoadDemandKWh: readPayloadValue(rawBody, "annualLoadDemandKWh", "arslastKWh"),
      annualEnergyBalanceKWh: readPayloadValue(rawBody, "annualEnergyBalanceKWh", "arsbalanseKWh"),
      justification: readPayloadValue(rawBody, "justification", "grunngiving"),
      additionalRequirements: readPayloadValue(rawBody, "additionalRequirements", "tilleggskrav"),
      operationalRequirements: readPayloadValue(rawBody, "operationalRequirements", "driftskrav"),
      methodCode: rawBody.methodCode,
      methodName: rawBody.methodName,
      releaseSolutionCode: rawBody.releaseSolutionCode,
      releaseSolutionName: rawBody.releaseSolutionName,
      measurementMethodCode: rawBody.measurementMethodCode,
      measurementMethodName: rawBody.measurementMethodName,
      solutionName: rawBody.solutionName,
      decisionStatus: rawBody.decisionStatus,
      nveAnchors: rawBody.nveAnchors,
      alternativeRecommendations: rawBody.alternativeRecommendations,
      discouragedMethods: rawBody.discouragedMethods,
      missingForFinalChoice: rawBody.missingForFinalChoice,
      documentationRequirements: rawBody.documentationRequirements,
      silentNveRequirements: rawBody.silentNveRequirements,
      releaseMethodLabel: rawBody.releaseMethodLabel,
      minFlowClass: rawBody.minFlowClass,
      fishMigration: rawBody.fishMigration,
      coandaExists: rawBody.coandaExists,
      siteChallenges: rawBody.siteChallenges,
      powerCommunication: rawBody.powerCommunication,
      publicDisplay: rawBody.publicDisplay,
      hourlyAutomaticLogging: rawBody.hourlyAutomaticLogging,
      secureDataStorageForNve: rawBody.secureDataStorageForNve,
      accuracyWithinFivePercent: rawBody.accuracyWithinFivePercent,
      completenessNinetySevenPercent: rawBody.completenessNinetySevenPercent,
      releaseMethodSelected: readPayloadValue(rawBody, "releaseMethodSelected", "slippmetodeVal"),
      releaseRequirementVariation: readPayloadValue(rawBody, "releaseRequirementVariation", "slippkravvariasjon"),
      isSedimentClogging: readPayloadValue(rawBody, "isSedimentClogging", "isSedimentTilstopping"),
      fishPassage: readPayloadValue(rawBody, "fishPassage", "fiskepassasje"),
      bypassOnOutage: readPayloadValue(rawBody, "bypassOnOutage", "bypassVedDriftsstans"),
      measurementProfile: readPayloadValue(rawBody, "measurementProfile", "maleprofil"),
      publicControl: readPayloadValue(rawBody, "publicControl", "allmentaKontroll"),
      include_recommendations: rawBody.include_recommendations, ai_on: rawBody.ai_on,
      reportExtract: readPayloadValue(rawBody, "reportExtract", "rapportutdrag")
    };

    const bridgeRequest = new Request(bridgeUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${bridgeToken}`,
        "x-hydroguide-request-id": requestId
      },
      body: JSON.stringify({ requestId, report: sanitizedBody }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    });

    const response = await fetch(bridgeRequest);

    const responseBody = await response.json().catch(() => null);

    if (!response.ok) {
      return createReportResponse(
        context,
        {
          error:
            typeof responseBody?.error === "string"
              ? responseBody.error
              : `Rapportagenten svarte med feil (${response.status}).`
        },
        { status: response.status }
      );
    }

    const hasText = typeof responseBody?.text === "string" && responseBody.text.trim();
    const hasFields =
      responseBody?.fields &&
      typeof responseBody.fields === "object" &&
      !Array.isArray(responseBody.fields) &&
      Object.values(responseBody.fields).some((value) => typeof value === "string" && value.trim());

    if (!responseBody || typeof responseBody !== "object" || (!hasText && !hasFields)) {
      return createReportResponse(
        context,
        { error: "Rapportagenten svarte uten gyldig rapportinnhold." },
        { status: 502 }
      );
    }

    return createReportResponse(context, { requestId, ...responseBody }, { status: 200 });
  } catch (error) {
    const message =
      error instanceof Error && error.name === "TimeoutError"
        ? "Rapportagenten brukte for lang tid."
        : "Klarte ikke kontakte rapportagenten.";

    return createReportResponse(context, { error: message }, { status: 502 });
  }
}

export async function onRequestOptions(context) {
  return new Response(null, { status: 204, headers: readReportCorsHeaders(context.request) });
}

export async function onRequestMethodNotAllowed(context) {
  return createReportResponse(context, { error: "Metoden er ikke tillatt." }, {
    status: 405,
    headers: { allow: "POST, OPTIONS" }
  });
}

export async function onRequestGet(context) {
  return onRequestMethodNotAllowed(context);
}
