import { GEONORGE_COORD_SYSTEM, GEONORGE_RESULTS_PER_PAGE, CORS_OPTIONS_HEADERS } from "./_constants.js";
import { checkRateLimit, createJsonResponse, readJsonRequest } from "./_edgeUtils.js";

const PLACE_URL = "https://ws.geonorge.no/stedsnavn/v1/sted";
const ADDRESS_URL = "https://ws.geonorge.no/adresser/v1/sok";
const RATE_LIMIT = { limit: 60, windowMs: 60_000 };

function normalizeText(value) {
  return typeof value === "string"
    ? value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim()
    : "";
}

async function fetchPlaces(query) {
  const url = new URL(PLACE_URL);
  url.searchParams.set("sok", query);
  url.searchParams.set("treffPerSide", GEONORGE_RESULTS_PER_PAGE);
  url.searchParams.set("utkoordsys", GEONORGE_COORD_SYSTEM);
  try {
    const res = await fetch(url.toString(), { headers: { accept: "application/json" } });
    if (!res.ok) return [];
    const data = await res.json();
    return (data?.namn ?? []).map((item, i) => {
      const rep = item?.representasjonspunkt;
      const coords = item?.geojson?.geometry?.coordinates;
      const primary = Array.isArray(item?.stedsnavn)
        ? (item.stedsnavn.find((entry) => entry?.navnestatus === "hovednavn") ?? item.stedsnavn[0])
        : null;
      const name = primary?.["skrivem\u00E5te"] ?? "";
      const lat = rep?.nord ?? rep?.lat ?? (Array.isArray(coords) ? coords[1] : null);
      const lng = rep?.["\u00F8st"] ?? rep?.aust ?? rep?.lng ?? (Array.isArray(coords) ? coords[0] : null);
      const municipality = item?.kommuner?.[0]?.kommunenavn ?? "";
      const county = item?.fylker?.[0]?.fylkesnavn ?? "";
      const secondary = [municipality, county].filter(Boolean).join(", ");
      return {
        id: `place-${i}-${Date.now()}`,
        description: secondary ? `${name}, ${secondary}` : name,
        mainText: name,
        secondaryText: secondary,
        placeId: item?.stedsnummer ? String(item.stedsnummer) : null,
        lat: typeof lat === "number" && Number.isFinite(lat) ? lat : null,
        lng: typeof lng === "number" && Number.isFinite(lng) ? lng : null,
        kind: "place"
      };
    });
  } catch {
    return [];
  }
}

async function fetchAddresses(query) {
  const url = new URL(ADDRESS_URL);
  url.searchParams.set("sok", query);
  url.searchParams.set("treffPerSide", GEONORGE_RESULTS_PER_PAGE);
  url.searchParams.set("utkoordsys", GEONORGE_COORD_SYSTEM);
  try {
    const res = await fetch(url.toString(), { headers: { accept: "application/json" } });
    if (!res.ok) return [];
    const data = await res.json();
    return (data?.adresser ?? []).map((item, i) => {
      const rep = item?.representasjonspunkt;
      const municipality = item?.kommunenavn ?? "";
      const county = item?.fylkesnavn ?? "";
      const secondary = [municipality, county].filter(Boolean).join(", ");
      return {
        id: `addr-${i}-${Date.now()}`,
        description: secondary ? `${item.adressetekst}, ${secondary}` : item.adressetekst,
        mainText: item.adressetekst ?? "",
        secondaryText: secondary,
        placeId: item?.objid ? String(item.objid) : null,
        lat: typeof rep?.lat === "number" ? rep.lat : null,
        lng: typeof rep?.lon === "number" ? rep.lon : null,
        kind: "address"
      };
    });
  } catch {
    return [];
  }
}

export async function onRequestPost(context) {
  const rl = await checkRateLimit({ request: context.request, keyPrefix: "places", ...RATE_LIMIT });
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

  const query = typeof body?.q === "string" ? body.q.trim() : "";
  if (query.length < 2) return createJsonResponse({ suggestions: [] });

  const [places, addresses] = await Promise.all([fetchPlaces(query), fetchAddresses(query)]);
  const normalizedQuery = normalizeText(query);

  const suggestions = [...places, ...addresses].sort((a, b) => {
    const aName = normalizeText(a.mainText);
    const bName = normalizeText(b.mainText);
    const aExact = aName === normalizedQuery ? 1 : 0;
    const bExact = bName === normalizedQuery ? 1 : 0;
    if (aExact !== bExact) return bExact - aExact;
    const aPrefix = aName.startsWith(normalizedQuery) ? 1 : 0;
    const bPrefix = bName.startsWith(normalizedQuery) ? 1 : 0;
    if (aPrefix !== bPrefix) return bPrefix - aPrefix;
    return 0;
  });

  return createJsonResponse(
    { suggestions },
    { cacheControl: "public, max-age=300", headers: { "access-control-allow-origin": "*" } }
  );
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS_OPTIONS_HEADERS });
}
