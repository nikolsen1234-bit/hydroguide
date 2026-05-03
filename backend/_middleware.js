const GLOBAL_CSP =
  "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'self'; frame-src 'self' blob:; form-action 'self'; script-src 'self' https://static.cloudflareinsights.com; script-src-elem 'self' https://static.cloudflareinsights.com; script-src-attr 'none'; style-src 'self' 'unsafe-inline'; style-src-attr 'unsafe-inline'; img-src 'self' data: https://cache.kartverket.no https://files.hydroguide.no; font-src 'self' data:; connect-src 'self' https://cloudflareinsights.com https://ws.geonorge.no; worker-src 'self' blob:; upgrade-insecure-requests";

const NVE_STANDALONE_CSP =
  "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'self'; frame-src 'self' blob:; form-action 'self'; script-src 'self' 'unsafe-inline' https://unpkg.com/leaflet@1.9.4/ https://unpkg.com/esri-leaflet@3.0.12/ https://static.cloudflareinsights.com; script-src-elem 'self' 'unsafe-inline' https://unpkg.com/leaflet@1.9.4/ https://unpkg.com/esri-leaflet@3.0.12/ https://static.cloudflareinsights.com; script-src-attr 'none'; style-src 'self' 'unsafe-inline' https://unpkg.com/leaflet@1.9.4/ https://fonts.googleapis.com; style-src-attr 'unsafe-inline'; img-src 'self' data: https://cache.kartverket.no https://files.hydroguide.no https://gis3.nve.no https://*.wikipedia.org https://*.wikimedia.org; font-src 'self' data: https://fonts.gstatic.com; connect-src 'self' https://gis3.nve.no https://ws.geonorge.no https://*.wikipedia.org https://*.wikimedia.org https://cloudflareinsights.com; worker-src 'self' blob:; upgrade-insecure-requests";

const SOLAR_MAP_CSP =
  "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'self'; frame-src 'self' blob:; form-action 'self'; script-src 'self' 'unsafe-inline' https://unpkg.com/leaflet@1.9.4/ https://unpkg.com/esri-leaflet@3.0.12/ https://static.cloudflareinsights.com; script-src-elem 'self' 'unsafe-inline' https://unpkg.com/leaflet@1.9.4/ https://unpkg.com/esri-leaflet@3.0.12/ https://static.cloudflareinsights.com; script-src-attr 'none'; style-src 'self' 'unsafe-inline' https://unpkg.com/leaflet@1.9.4/; style-src-attr 'unsafe-inline'; img-src 'self' data: https://cache.kartverket.no https://gis3.nve.no; font-src 'self' data:; connect-src 'self' https://gis3.nve.no https://ws.geonorge.no https://cloudflareinsights.com; worker-src 'self' blob:; upgrade-insecure-requests";

function resolveContentSecurityPolicy(pathname) {
  if (pathname === "/nve-kart-standalone" || pathname === "/nve-kart-standalone.html") {
    return NVE_STANDALONE_CSP;
  }

  if (pathname === "/solar-location-map" || pathname === "/solar-location-map.html") {
    return SOLAR_MAP_CSP;
  }

  return GLOBAL_CSP;
}

// Routes that set their own CSP (e.g. with a nonce) — do not overwrite.
function hasOwnCsp(pathname) {
  return pathname === "/api/docs";
}

export async function onRequest(context) {
  const response = await context.next();
  const headers = new Headers(response.headers);
  const { pathname } = new URL(context.request.url);

  if (!hasOwnCsp(pathname) || !headers.has("content-security-policy")) {
    headers.set("Content-Security-Policy", resolveContentSecurityPolicy(pathname));
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}
