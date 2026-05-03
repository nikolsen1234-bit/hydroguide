import {
  onRequestOptions,
  onRequestPost
} from "../../api/report.js";

function methodNotAllowed() {
  return Response.json(
    { error: "Metoden er ikkje tillaten." },
    {
      status: 405,
      headers: {
        allow: "POST, OPTIONS",
        "cache-control": "no-store",
        "x-content-type-options": "nosniff"
      }
    }
  );
}

function routeRequest(request) {
  const url = new URL(request.url);
  return /^\/api\/report(?:\/.*)?$/.test(url.pathname);
}

export default {
  async fetch(request, env, ctx) {
    if (!routeRequest(request)) {
      return Response.json({ error: "Report route not found." }, { status: 404 });
    }

    const method = request.method.toUpperCase();
    if (method === "OPTIONS") {
      return onRequestOptions({ request, env, ctx });
    }
    if (method === "POST") {
      return onRequestPost({ request, env, ctx });
    }
    return methodNotAllowed();
  }
};
