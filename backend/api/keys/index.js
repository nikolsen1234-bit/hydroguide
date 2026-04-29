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
  handleRestrictedCorsOptions,
  readApiJsonBody
} from "../_apiUtils.js";

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
  const h = body?.key_hash?.trim();
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

async function handleCreate(request, env, body) {
  const err = await requireAdmin(request, env);
  if (err) return createErrorResponse(err, 401);

  const name = body?.name?.trim();
  if (!name) return createErrorResponse("name is required.", 400);

  const kv = env?.API_KEYS;
  if (!kv) return createErrorResponse("KV unavailable.", 503);

  const rawKey = generateRawKey();
  let keyHash;
  let record;
  try {
    ({ keyHash, record } = await createApiKeyRecord(rawKey, {
      name,
      tier: body?.tier?.trim() || "free",
      rateLimit: { max: Number(body?.rate_limit) || 100, windowMs: Number(body?.rate_window_ms) || 60000 },
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
  const action = (body?.action ?? "").trim().toLowerCase();

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
