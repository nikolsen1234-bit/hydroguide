/**
 * POST /api/report
 *
 * Report Worker proxy. Validates report access hash and forwards to the internal AI Worker.
 */

import { CORS_OPTIONS_HEADERS } from "./_constants.js";
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
const REPORT_RATE_LIMIT_WINDOW_MS = 60 * 1000;
const REPORT_AUTH_FAILURE_LIMIT_MAX_ATTEMPTS = 10;
const REPORT_AUTH_FAILURE_LIMIT_WINDOW_MS = 3 * 60 * 1000;
const REPORT_REQUEST_BODY_MAX_BYTES = 32768;

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

  const providedHash = String(body?.tilgangskodeHash ?? "")
    .trim()
    .toLowerCase();

  if (!HASH_64_RE.test(providedHash)) {
    return "Manglar tilgangskode.";
  }

  if (!constantTimeEquals(providedHash, expectedHash)) {
    return "Ugyldig tilgangskode.";
  }

  return null;
}

export async function onRequestPost(context) {
  const rateLimit = await checkRateLimit({
    request: context.request,
    keyPrefix: "report",
    limit: REPORT_RATE_LIMIT_MAX_REQUESTS,
    windowMs: REPORT_RATE_LIMIT_WINDOW_MS
  });

  if (!rateLimit.allowed) {
    return createJsonResponse(
      { error: "For mange AI-forespurnader akkurat no. Prov igjen om litt." },
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
    return createJsonResponse(
      { error: error instanceof Error ? error.message : "Ugyldig forespurnad." },
      { status: 400 }
    );
  }

  const accessError = validateAiAccess(rawBody, context.env);
  if (accessError === "__CONFIG_MISSING__") {
    return createJsonResponse(
      { error: "AI-tenesta er ikkje konfigurert for offentleg publisering: manglar REPORT_ACCESS_CODE_HASH." },
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
      return createJsonResponse(
        { error: "For mange mislykka forsok. Rapport-AI er mellombels sperra for denne klienten." },
        {
          status: 429,
          headers: {
            "retry-after": String(authFailureLimit.retryAfterSeconds)
          }
        }
      );
    }

    return createJsonResponse({ error: accessError }, { status: 403 });
  }

  const workerApiKey = String(context.env?.REPORT_WORKER_TOKEN ?? "").trim();
  if (!workerApiKey) {
    return createJsonResponse(
      { error: "AI-tenesta er ikkje konfigurert." },
      { status: 503 }
    );
  }

  try {
    const sanitizedBody = {
      tilgangskodeHash: rawBody.tilgangskodeHash,
      prosjekt: rawBody.prosjekt, lokasjon: rawBody.lokasjon, prosjektbeskrivelse: rawBody.prosjektbeskrivelse,
      anleggstype: rawBody.anleggstype, hydrologi: rawBody.hydrologi,
      hovudloysing: rawBody.hovudloysing, slippmetode: rawBody.slippmetode,
      primaermaaling: rawBody.primaermaaling, kontrollmaaling: rawBody.kontrollmaaling,
      maleprinsipp: rawBody.maleprinsipp, maleutstyr: rawBody.maleutstyr,
      loggeroppsett: rawBody.loggeroppsett, reserveLogger: rawBody.reserveLogger,
      kommunikasjon: rawBody.kommunikasjon, alarmVarsling: rawBody.alarmVarsling,
      reservekjelde: rawBody.reservekjelde, reserveEnergikjelde: rawBody.reserveEnergikjelde,
      primaerEnergikjelde: rawBody.primaerEnergikjelde,
      reserveeffektW: rawBody.reserveeffektW, batteribankAh: rawBody.batteribankAh, autonomiDagar: rawBody.autonomiDagar,
      istilpassing: rawBody.istilpassing, frostsikring: rawBody.frostsikring, bypass: rawBody.bypass,
      arsproduksjonSolKWh: rawBody.arsproduksjonSolKWh, arslastKWh: rawBody.arslastKWh, arsbalanseKWh: rawBody.arsbalanseKWh,
      grunngiving: rawBody.grunngiving, tilleggskrav: rawBody.tilleggskrav, driftskrav: rawBody.driftskrav,
      slippmetodeVal: rawBody.slippmetodeVal, slippkravvariasjon: rawBody.slippkravvariasjon,
      isSedimentTilstopping: rawBody.isSedimentTilstopping, fiskepassasje: rawBody.fiskepassasje,
      bypassVedDriftsstans: rawBody.bypassVedDriftsstans, maleprofil: rawBody.maleprofil, allmentaKontroll: rawBody.allmentaKontroll,
      include_recommendations: rawBody.include_recommendations, ai_on: rawBody.ai_on, rapportutdrag: rawBody.rapportutdrag
    };

    const workerRequest = new Request("https://worker.internal/", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${workerApiKey}`
      },
      body: JSON.stringify(sanitizedBody),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    });

    const response = await context.env.REPORT_AI_WORKER.fetch(workerRequest);

    const responseBody = await response.json().catch(() => null);

    if (!response.ok) {
      return createJsonResponse(
        {
          error:
            typeof responseBody?.error === "string"
              ? responseBody.error
              : `AI-Worker svarte med feil (${response.status}).`
        },
        { status: response.status }
      );
    }

    if (!responseBody || typeof responseBody !== "object" || typeof responseBody.text !== "string") {
      return createJsonResponse(
        { error: "AI-Worker svarte utan gyldig tekst." },
        { status: 502 }
      );
    }

    return createJsonResponse(responseBody, { status: 200 });
  } catch (error) {
    const message =
      error instanceof Error && error.name === "TimeoutError"
        ? "AI-Worker brukte for lang tid."
        : "Klarte ikkje kontakte AI-Worker.";

    return createJsonResponse({ error: message }, { status: 502 });
  }
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS_OPTIONS_HEADERS });
}

export async function onRequestGet() {
  return createMethodNotAllowedResponse(["POST"]);
}
