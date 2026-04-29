/**
 * POST /api/keys - unified key management endpoint.
 *
 * Actions:
 *   "rotate"  - self-service: caller sends Bearer token, gets new key back, old revoked
 *   "create"  - admin: requires x-admin-token, creates new key
 *   "list"    - admin: requires x-admin-token, lists all keys
 *   "revoke"  - admin: requires x-admin-token + key_hash
 *   "delete"  - admin: requires x-admin-token + key_hash
 *
 * GET /api/keys - admin: list all keys (requires x-admin-token)
 */

import {
  authenticateRequest,
  createRestrictedApiResponse,
  createErrorResponse,
  createApiKeyRecord,
  sha256Hex,
  checkAdminRateLimit,
  checkApiRateLimit,
  handleRestrictedCorsOptions,
  readApiJsonBody
} from "../_apiUtils.js";

// Per-key rotate rate limit. Keyed on the OLD keyHash being retired, so an
// attacker with a stolen Bearer token cannot mint fresh hashes to escape the
// cap by rotating in a chain — each chained rotation still consumes from the
// originally-stolen key's bucket through carry-over (see ROTATE_RATE_LIMIT_KEY
// derivation in handleRotate).
const ROTATE_RATE_LIMIT = { max: 5, windowMs: 60 * 60 * 1000 };

// Hash-then-XOR variant: hashes both inputs to fixed-length 32-byte digests
// before constant-time compare. Hides input length from timing analysis on
// admin tokens. The shared _edgeUtils.constantTimeEquals does raw char-code
// compare with early length-mismatch return, which is fine for already-hashed
// values but leaks length for raw secrets.
async function constantTimeEquals(a, b) {
  const encoder = new TextEncoder();
  const hashA = new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(a)));
  const hashB = new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(b)));
  let diff = 0;
  for (let i = 0; i < hashA.length; i++) diff |= hashA[i] ^ hashB[i];
  return diff === 0;
}

async function requireAdmin(request, env) {
  const expected = String(env?.INTERNAL_SERVICE_TOKEN ?? "").trim();
  if (!expected) return "Admin endpoint not configured.";
  const provided = (request.headers.get("x-admin-token") ?? "").trim();
  if (!provided || !(await constantTimeEquals(provided, expected))) return "Unauthorized.";
  return null;
}

function generateRawKey() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return `hg_live_${btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")}`;
}

function requireKeyHash(body) {
  const h = typeof body?.key_hash === "string" ? body.key_hash.trim() : "";
  if (!h || !/^[a-f0-9]{64}$/.test(h)) return null;
  return h;
}

async function handleRotate(request, env) {
  const auth = await authenticateRequest(request, env);
  if (!auth.authenticated) return createErrorResponse(auth.error, auth.status);

  const kv = env?.API_KEYS;
  if (!kv) return createErrorResponse("KV unavailable.", 503);

  const oldKey = (request.headers.get("authorization") ?? "").slice(7).trim();
  const oldHash = await sha256Hex(oldKey);
  const oldRaw = await kv.get(`key:${oldHash}`);
  if (!oldRaw) return createErrorResponse("Key not found.", 404);

  const oldRecord = JSON.parse(oldRaw);

  // Per-key rotate rate limit. Use the lineage root (the first hash in the
  // chain) so chained rotations cannot bypass the cap by minting fresh hashes.
  // The first key in a chain has no rotateLineage yet — fall back to its own hash.
  const lineageRoot = oldRecord.rotateLineage ?? oldHash;
  const rotateLimit = await checkApiRateLimit(`rotate:${lineageRoot}`, ROTATE_RATE_LIMIT, kv);
  if (!rotateLimit.allowed) {
    return createErrorResponse(
      `Too many rotations for this key. Retry after ${rotateLimit.retryAfterSeconds}s.`,
      429
    );
  }

  const newKey = generateRawKey();
  let newHash;
  let newRecord;
  try {
    ({ keyHash: newHash, record: newRecord } = await createApiKeyRecord(newKey, {
      name: oldRecord.name,
      tier: oldRecord.tier,
      rateLimit: oldRecord.rateLimit,
      createdAt: new Date().toISOString(),
      env
    }));
  } catch {
    return createErrorResponse("API key hashing is not configured.", 503);
  }

  newRecord.rotatedFrom = oldHash.slice(0, 12);
  newRecord.rotateLineage = lineageRoot;
  await kv.put(`key:${newHash}`, JSON.stringify(newRecord));

  oldRecord.active = false;
  oldRecord.revokedAt = new Date().toISOString();
  oldRecord.revokedBy = "self-rotate";
  await kv.put(`key:${oldHash}`, JSON.stringify(oldRecord));

  return createRestrictedApiResponse(request, {
    rotated: true,
    name: oldRecord.name,
    api_key: newKey,
    note: "Save this key now - your old key has been revoked."
  });
}

const ALLOWED_TIERS = ["free", "pro", "enterprise"];
const NAME_MAX_LENGTH = 200;
const RATE_LIMIT_MIN = 1;
const RATE_LIMIT_MAX = 100_000;
const RATE_WINDOW_MIN_MS = 1_000;
const RATE_WINDOW_MAX_MS = 24 * 60 * 60 * 1000;

function readOptionalString(value, fieldName) {
  if (value === undefined || value === null) return { value: "" };
  if (typeof value !== "string") return { error: `${fieldName} must be a string.` };
  return { value: value.trim() };
}

function readAction(body) {
  return typeof body?.action === "string" ? body.action.trim().toLowerCase() : "";
}

function validateCreateInput(body) {
  const nameResult = readOptionalString(body?.name, "name");
  if (nameResult.error) return { error: nameResult.error };
  const name = nameResult.value;
  if (!name) return { error: "name is required." };
  if (name.length > NAME_MAX_LENGTH) {
    return { error: `name must be ${NAME_MAX_LENGTH} characters or fewer.` };
  }

  const tierResult = readOptionalString(body?.tier, "tier");
  if (tierResult.error) return { error: tierResult.error };
  const tierRaw = tierResult.value;
  const tier = tierRaw || "free";
  if (!ALLOWED_TIERS.includes(tier)) {
    return { error: `tier must be one of: ${ALLOWED_TIERS.join(", ")}.` };
  }

  let max = 100;
  if (body?.rate_limit !== undefined) {
    const n = Number(body.rate_limit);
    if (!Number.isFinite(n) || n < RATE_LIMIT_MIN || n > RATE_LIMIT_MAX || !Number.isInteger(n)) {
      return { error: `rate_limit must be an integer between ${RATE_LIMIT_MIN} and ${RATE_LIMIT_MAX}.` };
    }
    max = n;
  }

  let windowMs = 60_000;
  if (body?.rate_window_ms !== undefined) {
    const n = Number(body.rate_window_ms);
    if (!Number.isFinite(n) || n < RATE_WINDOW_MIN_MS || n > RATE_WINDOW_MAX_MS) {
      return { error: `rate_window_ms must be between ${RATE_WINDOW_MIN_MS} and ${RATE_WINDOW_MAX_MS}.` };
    }
    windowMs = n;
  }

  return { name, tier, rateLimit: { max, windowMs } };
}

async function handleCreate(request, env, body) {
  const err = await requireAdmin(request, env);
  if (err) return createErrorResponse(err, 401);

  const validated = validateCreateInput(body);
  if (validated.error) return createErrorResponse(validated.error, 400);

  const kv = env?.API_KEYS;
  if (!kv) return createErrorResponse("KV unavailable.", 503);

  const { name, tier, rateLimit } = validated;
  const rawKey = generateRawKey();
  let keyHash;
  let record;
  try {
    ({ keyHash, record } = await createApiKeyRecord(rawKey, {
      name,
      tier,
      rateLimit,
      createdAt: new Date().toISOString(),
      env
    }));
  } catch {
    return createErrorResponse("API key hashing is not configured.", 503);
  }

  await kv.put(`key:${keyHash}`, JSON.stringify(record));

  return createRestrictedApiResponse(request, {
    created: true,
    name,
    key_hash: keyHash,
    api_key: rawKey,
    note: "Save this key now - it cannot be retrieved later."
  });
}

async function handleList(request, env) {
  const err = await requireAdmin(request, env);
  if (err) return createErrorResponse(err, 401);

  const kv = env?.API_KEYS;
  if (!kv) return createErrorResponse("KV unavailable.", 503);

  const list = await kv.list({ prefix: "key:", limit: 100 });
  const keys = [];
  for (const entry of list?.keys ?? []) {
    try {
      const record = JSON.parse(await kv.get(entry.name));
      keys.push({ key_hash: entry.name.replace("key:", ""), name: record.name ?? "unknown", tier: record.tier ?? "free", active: record.active !== false, createdAt: record.createdAt ?? null });
    } catch {
      keys.push({ key_hash: entry.name.replace("key:", ""), error: "invalid record" });
    }
  }

  return createRestrictedApiResponse(request, { count: keys.length, keys });
}

async function handleRevoke(request, env, body) {
  const err = await requireAdmin(request, env);
  if (err) return createErrorResponse(err, 401);

  const keyHash = requireKeyHash(body);
  if (!keyHash) return createErrorResponse("key_hash must be a 64-char hex string.", 400);

  const kv = env?.API_KEYS;
  if (!kv) return createErrorResponse("KV unavailable.", 503);

  const raw = await kv.get(`key:${keyHash}`);
  if (!raw) return createErrorResponse("Key not found.", 404);

  const record = JSON.parse(raw);
  record.active = false;
  record.revokedAt = new Date().toISOString();
  await kv.put(`key:${keyHash}`, JSON.stringify(record));

  return createRestrictedApiResponse(request, { revoked: true, name: record.name });
}

async function handleDelete(request, env, body) {
  const err = await requireAdmin(request, env);
  if (err) return createErrorResponse(err, 401);

  const keyHash = requireKeyHash(body);
  if (!keyHash) return createErrorResponse("key_hash must be a 64-char hex string.", 400);

  const kv = env?.API_KEYS;
  if (!kv) return createErrorResponse("KV unavailable.", 503);

  const raw = await kv.get(`key:${keyHash}`);
  if (!raw) return createErrorResponse("Key not found.", 404);

  const name = JSON.parse(raw)?.name ?? null;
  await kv.delete(`key:${keyHash}`);

  return createRestrictedApiResponse(request, { deleted: true, key_hash: keyHash, name });
}

export async function onRequestPost(context) {
  const { request, env } = context;

  const rl = checkAdminRateLimit(request);
  if (!rl.allowed) {
    return createRestrictedApiResponse(request, { error: "Too many requests." }, { status: 429, headers: { "retry-after": String(rl.retryAfterSeconds) } });
  }

  let body = null;
  try {
    body = await readApiJsonBody(request);
  } catch (error) {
    return createErrorResponse(error instanceof Error ? error.message : "Invalid request body.", 400);
  }
  const action = readAction(body);

  if (action === "rotate") return handleRotate(request, env);
  if (action === "create") return handleCreate(request, env, body);
  if (action === "list") return handleList(request, env);
  if (action === "revoke") return handleRevoke(request, env, body);
  if (action === "delete") return handleDelete(request, env, body);

  return createErrorResponse("action must be one of: rotate, create, list, revoke, delete.", 400);
}

export async function onRequestGet(context) {
  const rl = checkAdminRateLimit(context.request);
  if (!rl.allowed) {
    return createRestrictedApiResponse(context.request, { error: "Too many requests." }, { status: 429 });
  }
  return handleList(context.request, context.env);
}

export async function onRequestOptions(context) {
  return handleRestrictedCorsOptions(context.request);
}
