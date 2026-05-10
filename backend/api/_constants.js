export const GEONORGE_COORD_SYSTEM = "4258";
export const GEONORGE_RESULTS_PER_PAGE = "5";

export const CORS_OPTIONS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "Content-Type, Accept"
};

export const SMALL_JSON_BODY_MAX_BYTES = 1024;
export const DEFAULT_JSON_BODY_MAX_BYTES = 4096;
export const API_JSON_BODY_MAX_BYTES = 32_768;
export const REPORT_JSON_BODY_MAX_BYTES = 32_768;

export const RATE_LIMIT_WINDOW_MS_1MIN = 60_000;
export const RATE_LIMIT_WINDOW_MS_1HOUR = 60 * RATE_LIMIT_WINDOW_MS_1MIN;
