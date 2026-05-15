import {
  authenticateRequest,
  checkApiRateLimit,
  createApiResponse,
  createErrorResponse,
  handleCorsOptions,
  readApiJsonBody
} from "./_apiUtils.js";
import {
  calculateNumericResults,
  normalizeCalculationRequest,
  validateCalculationRequest
} from "../services/calculations/_calculationCore.js";

function usagePayload(rl) {
  return { requestsRemaining: rl.remaining, resetAt: rl.resetAt };
}

export async function onRequestPost(context) {
  const auth = await authenticateRequest(context.request, context.env);
  if (!auth.authenticated) return createErrorResponse(auth.error, auth.status);

  const rl = await checkApiRateLimit(auth.keyHash, auth.rateLimit, context.env?.API_KEYS);
  if (!rl.allowed) {
    return createApiResponse(
      {
        error: "Rate limit exceeded.",
        usage: {
          requestsRemaining: 0,
          retryAfterSeconds: rl.retryAfterSeconds,
          resetAt: rl.resetAt
        }
      },
      { status: 429, headers: { "retry-after": String(rl.retryAfterSeconds) } }
    );
  }

  let body;
  try {
    body = await readApiJsonBody(context.request);
  } catch (error) {
    return createApiResponse(
      { error: error instanceof Error ? error.message : "Invalid request.", usage: usagePayload(rl) },
      { status: 400 }
    );
  }

  const cfg = normalizeCalculationRequest(body);
  const errors = validateCalculationRequest(cfg);
  if (Object.keys(errors).length > 0) {
    return createApiResponse(
      { error: "Validation failed.", validationErrors: errors, usage: usagePayload(rl) },
      { status: 422 }
    );
  }

  return createApiResponse({ calculations: calculateNumericResults(cfg), usage: usagePayload(rl) });
}

export async function onRequestGet() {
  return createApiResponse({
    path: "/api/calculations",
    description: "Endpoint information. Use POST to run a calculation.",
    endpoints: [
      {
        method: "POST",
        path: "/api/calculations",
        authentication: "Bearer <api-key>",
        contentType: "application/json",
        requiredBodyFields: ["solar", "battery", "monthlySolarRadiation", "equipmentRows"],
        conditionalBodyFields: {
          backupSource: "Required when hasBackupSource is true; represents whether a secondary source is used.",
          fuelCell: "Required when the secondary source selection includes fuelCell.",
          diesel: "Required when the secondary source selection includes diesel.",
          other: "Required when hasBackupSource is true."
        },
        docs: "/api"
      }
    ]
  });
}

export async function onRequestOptions() {
  return handleCorsOptions();
}
