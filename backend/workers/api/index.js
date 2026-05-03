import { createApiResponse, handleCorsOptions } from "../../api/_apiUtils.js";
import { onRequestGet as getHealth } from "../../api/health.js";
import { onRequestGet as getNveid } from "../../api/nveid.js";
import {
  onRequestOptions as optionsPlaceSuggestions,
  onRequestPost as postPlaceSuggestions
} from "../../api/place-suggestions.js";
import {
  onRequestOptions as optionsTerrainProfile,
  onRequestPost as postTerrainProfile
} from "../../api/terrain-profile.js";
import {
  onRequestGet as getPvgisTmy,
  onRequestOptions as optionsPvgisTmy
} from "../../api/pvgis-tmy.js";
import {
  onRequestGet as getCalculations,
  onRequestOptions as optionsCalculations,
  onRequestPost as postCalculations
} from "../../api/calculations.js";
import {
  onRequestGet as getDocs,
  onRequestOptions as optionsDocs
} from "../../api/docs.js";

const ROUTES = [
  {
    name: "health",
    pattern: /^\/api\/health(?:\/.*)?$/,
    handlers: {
      GET: getHealth,
      OPTIONS: () => handleCorsOptions()
    }
  },
  {
    name: "docs",
    pattern: /^\/api\/docs(?:\/.*)?$/,
    handlers: {
      GET: getDocs,
      OPTIONS: optionsDocs
    }
  },
  {
    name: "calculations",
    pattern: /^\/api\/calculations(?:\/.*)?$/,
    handlers: {
      GET: getCalculations,
      POST: postCalculations,
      OPTIONS: optionsCalculations
    }
  },
  {
    name: "nveid",
    pattern: /^\/api\/nveid(?:\/.*)?$/,
    handlers: {
      GET: getNveid,
      OPTIONS: () => handleCorsOptions()
    }
  },
  {
    name: "pvgis-tmy",
    pattern: /^\/api\/pvgis-tmy(?:\/.*)?$/,
    handlers: {
      GET: getPvgisTmy,
      OPTIONS: optionsPvgisTmy
    }
  },
  {
    name: "place-suggestions",
    pattern: /^\/api\/place-suggestions(?:\/.*)?$/,
    handlers: {
      POST: postPlaceSuggestions,
      OPTIONS: optionsPlaceSuggestions
    }
  },
  {
    name: "terrain-profile",
    pattern: /^\/api\/terrain-profile(?:\/.*)?$/,
    handlers: {
      POST: postTerrainProfile,
      OPTIONS: optionsTerrainProfile
    }
  }
];

function routeRequest(request) {
  const url = new URL(request.url);
  return ROUTES.find((route) => route.pattern.test(url.pathname)) ?? null;
}

function methodNotAllowed(route) {
  const allowed = Object.keys(route.handlers).join(", ");
  return createApiResponse(
    { error: "Method not allowed.", allowedMethods: Object.keys(route.handlers) },
    { status: 405, headers: { allow: allowed } }
  );
}

export default {
  async fetch(request, env, ctx) {
    const route = routeRequest(request);

    if (!route) {
      return createApiResponse({ error: "API route not found." }, { status: 404 });
    }

    const method = request.method.toUpperCase();
    const handler = route.handlers[method];

    if (!handler) {
      return methodNotAllowed(route);
    }

    return handler({ request, env, ctx });
  }
};
