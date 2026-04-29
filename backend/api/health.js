/**
 * GET /api/health
 *
 * Health check endpoint for uptime monitoring.
 */

import { createApiResponse } from "./_apiUtils.js";

export async function onRequestGet() {
  return createApiResponse({ status: "ok", timestamp: new Date().toISOString() });
}
