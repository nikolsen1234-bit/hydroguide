/**
 * GET /api/nveid
 * GET /api/nveid/:nveID
 * GET /api/nveid/:nveID/minimum-flow
 * GET /api/nveid/:nveID/concession
 *
 * Serves endpoint indexes and scoped public data keyed by NVEID.
 * Trailing slashes are accepted but the response always uses non-trailing paths.
 * No authentication required - public reference data.
 */

import { createApiResponse } from "./_apiUtils.js";

const DEFAULT_OBJECT_KEY = "api/minimumflow.json";
const NVE_ARCGIS_QUERY =
  "https://gis3.nve.no/map/rest/services/Mapservices/VassdragsreguleringVannkraft/MapServer/1/query";
const NVE_CONCESSION_URL = "https://www.nve.no/konsesjon/konsesjonssaker/konsesjonssak";

function parseNveID(value) {
  if (!value) return null;
  const nveID = Number.parseInt(value, 10);
  return Number.isFinite(nveID) && nveID > 0 && String(nveID) === String(value) ? nveID : NaN;
}

function routeRequest(request) {
  const url = new URL(request.url);
  const prefix = "/api/nveid";
  const suffix = url.pathname.startsWith(prefix) ? url.pathname.slice(prefix.length) : "";
  const segments = suffix.split("/").filter(Boolean);

  if (segments.length === 0) {
    return { type: "index" };
  }

  const nveID = parseNveID(segments[0]);
  if (Number.isNaN(nveID)) {
    return { type: "invalid-id" };
  }

  if (segments.length === 1) {
    return { type: "id-index", nveID };
  }

  if (segments.length === 2) {
    if (segments[1] === "minimum-flow") return { type: "minimum-flow", nveID };
    if (segments[1] === "concession") return { type: "concession", nveID };
  }

  return { type: "not-found", nveID };
}

export async function onRequestGet(context) {
  const route = routeRequest(context.request);

  if (route.type === "invalid-id") {
    return createApiResponse({ error: "Missing or invalid NVEID." }, { status: 400 });
  }

  if (route.type === "not-found") {
    return createApiResponse({ error: "NVEID resource not found." }, { status: 404 });
  }

  if (route.type === "index") {
    return createApiResponse(createIndexResponse(), { cacheControl: "public, max-age=3600" });
  }

  let minimumFlowData;
  try {
    minimumFlowData = await readMinimumFlowData(context.env);
  } catch {
    return createApiResponse(
      { error: "Minimum-flow data is unavailable." },
      { status: 503, cacheControl: "no-store" }
    );
  }

  const nveID = route.nveID;
  const entry = minimumFlowData[String(nveID)] ?? null;
  if (!entry) {
    const nveConcession = await lookupNveConcession(nveID);

    if (nveConcession && route.type === "concession") {
      return createApiResponse(await createConcessionResponse(nveID, null, nveConcession), {
        cacheControl: "public, max-age=3600"
      });
    }

    return createApiResponse({ error: "No data for NVEID.", nveID }, { status: 404, cacheControl: "public, max-age=300" });
  }

  if (route.type === "minimum-flow") {
    return createApiResponse(createMinimumFlowResponse(nveID, entry), { cacheControl: "public, max-age=3600" });
  }

  if (route.type === "concession") {
    return createApiResponse(await createConcessionResponse(nveID, entry), { cacheControl: "public, max-age=3600" });
  }

  return createApiResponse(createNveIDIndexResponse(nveID, entry), { cacheControl: "public, max-age=3600" });
}

function boolOrFalse(value) {
  return value === true;
}

function createIndexResponse() {
  return {
    path: "/api/nveid",
    endpoints: [
      "/api/nveid/{nveID}"
    ]
  };
}

function createNveIDIndexResponse(nveID, entry) {
  return {
    path: `/api/nveid/${nveID}`,
    nveID,
    navn: entry?.navn ?? "",
    endpoints: [
      `/api/nveid/${nveID}/minimum-flow`,
      `/api/nveid/${nveID}/concession`
    ],
    funnet: boolOrFalse(entry?.funnet),
    inntak: Array.isArray(entry?.inntak) ? entry.inntak : []
  };
}

function createMinimumFlowResponse(nveID, entry) {
  return {
    path: `/api/nveid/${nveID}/minimum-flow`,
    nveID,
    navn: entry?.navn ?? "",
    endpoints: [],
    funnet: boolOrFalse(entry?.funnet),
    inntak: Array.isArray(entry?.inntak) ? entry.inntak : []
  };
}

async function createConcessionResponse(nveID, entry, knownConcession = null) {
  const concession = knownConcession ?? await resolveConcession(nveID, entry);
  const base = {
    path: `/api/nveid/${nveID}/concession`,
    nveID,
    navn: entry?.navn ?? concession?.navn ?? "",
    endpoints: []
  };

  if (concession) {
    return {
      ...base,
      available: true,
      kdbNr: concession.kdbNr,
      caseID: concession.caseID,
      url: concession.url,
      pdfUrl: concession.pdfUrl
    };
  }

  return {
    ...base,
    available: false,
    reason: "No concession mapping found for this NVEID."
  };
}

function readConcessionFromEntry(entry) {
  if (!entry) return null;

  const url = readFirstString(entry.konsesjon_url, entry.concessionUrl, entry.concession?.url);
  const pdfUrl = readFirstString(entry.chosen_pdf_url, entry.concessionPdfUrl, entry.concession?.pdfUrl);
  const caseID = readFirstPositiveInteger(entry.case_id, entry.caseID, entry.concession?.caseID);
  const kdbNr = readFirstPositiveInteger(entry.kdbNr, entry.concession?.kdbNr);

  if (url || pdfUrl || caseID || kdbNr) {
    return {
      kdbNr,
      caseID,
      url: url ?? createNveConcessionUrl(caseID ?? kdbNr),
      pdfUrl,
    };
  }

  return null;
}

async function resolveConcession(nveID, entry) {
  return readConcessionFromEntry(entry) ?? await lookupNveConcession(nveID);
}

async function lookupNveConcession(nveID) {
  try {
    const params = new URLSearchParams({
      where: `vannkraftverkNr = ${nveID}`,
      outFields: "kdbNr,vannkraftverkNr,vannkraftStasjonNavn",
      returnGeometry: "false",
      f: "json",
      resultRecordCount: "1"
    });
    const response = await fetch(`${NVE_ARCGIS_QUERY}?${params}`, {
      headers: { accept: "application/json" },
      cf: { cacheTtl: 86400, cacheEverything: true }
    });

    if (!response.ok) {
      return null;
    }

    const payload = await response.json();
    const attributes = payload?.features?.[0]?.attributes ?? null;
    const kdbNr = readFirstPositiveInteger(attributes?.kdbNr);
    if (!kdbNr) {
      return null;
    }

    return {
      kdbNr,
      caseID: kdbNr,
      navn: readFirstString(attributes?.vannkraftStasjonNavn),
      url: createNveConcessionUrl(kdbNr),
      pdfUrl: null
    };
  } catch {
    return null;
  }
}

function createNveConcessionUrl(caseID) {
  if (!caseID) return null;
  const url = new URL(NVE_CONCESSION_URL);
  url.searchParams.set("id", String(caseID));
  url.searchParams.set("type", "V-1");
  return url.toString();
}

function readFirstString(...values) {
  return values.find((value) => typeof value === "string" && value.length > 0) ?? null;
}

function readFirstPositiveInteger(...values) {
  for (const value of values) {
    const number = Number.parseInt(value, 10);
    if (Number.isFinite(number) && number > 0) return number;
  }
  return null;
}

function readObjectKey(env) {
  return String(env?.MINIMUMFLOW_OBJECT_KEY ?? DEFAULT_OBJECT_KEY).trim() || DEFAULT_OBJECT_KEY;
}

async function readMinimumFlowData(env) {
  const bucket = env?.MINIMUMFLOW_R2;
  if (!bucket || typeof bucket.get !== "function") {
    throw new Error("MINIMUMFLOW_R2 binding is not configured.");
  }

  const objectKey = readObjectKey(env);
  const object = await bucket.get(objectKey);
  if (!object) {
    throw new Error(`Minimum-flow data object not found: ${objectKey}`);
  }

  const data = await object.json();
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error(`Minimum-flow data object is not a JSON object: ${objectKey}`);
  }

  return data;
}
