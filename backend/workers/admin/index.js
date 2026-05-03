import {
  onRequestGet as getKeys,
  onRequestOptions as optionsKeys,
  onRequestPost as postKeys
} from "../../admin/keys/index.js";
import { createRestrictedApiResponse } from "../../api/_apiUtils.js";

const ROUTES = [
  {
    name: "keys",
    pattern: /^\/admin\/keys(?:\/.*)?$/,
    handlers: {
      GET: getKeys,
      POST: postKeys,
      OPTIONS: optionsKeys
    }
  }
];

function routeRequest(request) {
  const url = new URL(request.url);
  return ROUTES.find((route) => route.pattern.test(url.pathname)) ?? null;
}

function methodNotAllowed(request, route) {
  const allowed = Object.keys(route.handlers).join(", ");
  return createRestrictedApiResponse(
    request,
    { error: "Method not allowed.", allowedMethods: Object.keys(route.handlers) },
    { status: 405, headers: { allow: allowed } }
  );
}

export default {
  async fetch(request, env, ctx) {
    const route = routeRequest(request);

    if (!route) {
      return createRestrictedApiResponse(request, { error: "Admin route not found." }, { status: 404 });
    }

    const method = request.method.toUpperCase();
    const handler = route.handlers[method];

    if (!handler) {
      return methodNotAllowed(request, route);
    }

    return handler({ request, env, ctx });
  }
};
