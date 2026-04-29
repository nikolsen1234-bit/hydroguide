import { GEONORGE_COORD_SYSTEM, CORS_OPTIONS_HEADERS } from "./_constants.js";
import { checkRateLimit, createJsonResponse, readJsonRequest } from "./_edgeUtils.js";

const KARTVERKET_URL = "https://ws.geonorge.no/hoydedata/v1/punkt";
const MAX_POINTS_PER_REQUEST = 50;
const MAX_SAMPLES = 200;
const RATE_LIMIT = { limit: 30, windowMs: 60_000 };

export async function onRequestPost(context) {
  const rl = await checkRateLimit({ request: context.request, keyPrefix: "terrain", ...RATE_LIMIT });
  if (!rl.allowed) {
    return createJsonResponse(
      { error: "Too many requests." },
      { status: 429, headers: { "retry-after": String(rl.retryAfterSeconds) } }
    );
  }

  let body;
  try {
    body = await readJsonRequest(context.request, { maxBytes: 1024 });
  } catch (error) {
    return createJsonResponse({ error: error instanceof Error ? error.message : "Invalid request." }, { status: 400 });
  }

  const { lat1, long1, lat2, long2, samples } = body ?? {};

  if ([lat1, long1, lat2, long2].some((value) => typeof value !== "number" || !Number.isFinite(value))) {
    return createJsonResponse({ error: "lat1, long1, lat2, long2 must be finite numbers." }, { status: 400 });
  }

  const sampleCount = typeof samples === "number" && Number.isFinite(samples) && samples > 1
    ? Math.min(Math.floor(samples), MAX_SAMPLES)
    : 100;

  try {
    const points = Array.from({ length: sampleCount }, (_, index) => {
      const ratio = sampleCount === 1 ? 0 : index / (sampleCount - 1);
      return [
        Number((long1 + (long2 - long1) * ratio).toFixed(6)),
        Number((lat1 + (lat2 - lat1) * ratio).toFixed(6))
      ];
    });
    const chunks = [];
    for (let index = 0; index < points.length; index += MAX_POINTS_PER_REQUEST) {
      chunks.push(points.slice(index, index + MAX_POINTS_PER_REQUEST));
    }

    const results = await Promise.all(
      chunks.map(async (chunk) => {
        const url = new URL(KARTVERKET_URL);
        url.searchParams.set("koordsys", GEONORGE_COORD_SYSTEM);
        url.searchParams.set("datakilde", "dtm1");
        url.searchParams.set("punkter", JSON.stringify(chunk));

        const upstream = await fetch(url.toString(), {
          headers: { accept: "application/json" }
        });

        if (!upstream.ok) {
          throw new Error(`Upstream returned ${upstream.status}.`);
        }

        const data = await upstream.json();
        const pointsInChunk = Array.isArray(data?.punkter)
          ? data.punkter
          : Array.isArray(data?.points)
            ? data.points
            : Array.isArray(data)
              ? data
              : [];

        return pointsInChunk.map((point) => ({ height: point?.z ?? point?.height ?? 0 }));
      })
    );

    return createJsonResponse(
      { heights: results.flat() },
      { cacheControl: "public, max-age=86400", headers: { "access-control-allow-origin": "*" } }
    );
  } catch {
    return createJsonResponse({ error: "Failed to fetch terrain profile." }, { status: 502 });
  }
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS_OPTIONS_HEADERS });
}
