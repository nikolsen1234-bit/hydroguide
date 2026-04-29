import { CORS_OPTIONS_HEADERS } from "./_constants.js";
import { checkRateLimit, createJsonResponse } from "./_edgeUtils.js";

const PVGIS_TMY_URL = "https://re.jrc.ec.europa.eu/api/v5_3/tmy";
const RATE_LIMIT = { limit: 20, windowMs: 60_000 };

export async function onRequestGet(context) {
  const rl = await checkRateLimit({ request: context.request, keyPrefix: "pvgis", ...RATE_LIMIT });
  if (!rl.allowed) {
    return createJsonResponse(
      { error: "Too many requests." },
      { status: 429, headers: { "retry-after": String(rl.retryAfterSeconds) } }
    );
  }

  const url = new URL(context.request.url);
  const lat = url.searchParams.get("lat");
  const lon = url.searchParams.get("lon");

  if (!lat || !lon || !Number.isFinite(Number(lat)) || !Number.isFinite(Number(lon))) {
    return createJsonResponse({ error: "lat and lon must be finite numbers." }, { status: 400 });
  }

  const pvgisUrl = new URL(PVGIS_TMY_URL);
  pvgisUrl.searchParams.set("lat", Number(lat).toFixed(4));
  pvgisUrl.searchParams.set("lon", Number(lon).toFixed(4));
  pvgisUrl.searchParams.set("outputformat", "json");

  try {
    const upstream = await fetch(pvgisUrl.toString(), {
      headers: { accept: "application/json" }
    });

    if (!upstream.ok) {
      return createJsonResponse(
        { error: `PVGIS API error: ${upstream.status}` },
        { status: 502 }
      );
    }

    return createJsonResponse(await upstream.json(), {
      cacheControl: "public, max-age=86400",
      headers: { "access-control-allow-origin": "*" }
    });
  } catch {
    return createJsonResponse({ error: "Failed to reach PVGIS." }, { status: 502 });
  }
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS_OPTIONS_HEADERS });
}
