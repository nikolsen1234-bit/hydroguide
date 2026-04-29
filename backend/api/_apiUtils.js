/**
 * Shared utilities for the HydroGuide public API (/api/*).
 *
 * Provides:
 *  - API-key authentication backed by Cloudflare KV (binding: API_KEYS)
 *  - Per-key rate limiting (KV-backed with in-memory fallback)
 *  - Standard JSON response helpers with CORS
 *  - Request parsing / validation
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** @type {Map<string, number[]>} */
const rateLimitBuckets = new Map();

const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "Content-Type, Authorization, x-admin-token",
  "access-control-max-age": "86400",
  "vary": "Origin"
};

const ALLOWED_ORIGINS = new Set(["https://hydroguide.no", "https://www.hydroguide.no"]);

// API responses are JSON only — they should never load scripts, frames, or
// other resources. The default-src 'none' base denies everything and we add
// back only what JSON error pages legitimately need (none, in practice).
// frame-ancestors 'none' prevents the API responses from being embedded in any
// frame, which doubles up with x-frame-options for older browsers.
const API_CSP =
  "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'";

const SECURITY_HEADERS = {
  "referrer-policy": "same-origin",
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
  "content-security-policy": API_CSP
};

// ---------------------------------------------------------------------------
// Responses
// ---------------------------------------------------------------------------

export function createApiResponse(payload, options = {}) {
  const { status = 200, cacheControl = "no-store", headers = {} } = options;

  return Response.json(payload, {
    status,
    headers: {
      ...SECURITY_HEADERS,
      ...CORS_HEADERS,
      "cache-control": cacheControl,
      ...headers
    }
  });
}

export function createErrorResponse(message, status = 400) {
  return createApiResponse({ error: message }, { status });
}

export function handleCorsOptions() {
  return new Response(null, {
    status: 204,
    headers: { ...CORS_HEADERS, ...SECURITY_HEADERS }
  });
}

function restrictedCorsHeaders(request) {
  const origin = (request?.headers?.get("origin") ?? "").trim();
  const headers = {
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "Content-Type, Authorization, x-admin-token",
    "access-control-max-age": "86400",
    "vary": "Origin"
  };
  if (ALLOWED_ORIGINS.has(origin)) {
    headers["access-control-allow-origin"] = origin;
  }
  return headers;
}

export function createRestrictedApiResponse(request, payload, options = {}) {
  const { status = 200, cacheControl = "no-store", headers = {} } = options;
  return Response.json(payload, {
    status,
    headers: { ...SECURITY_HEADERS, ...restrictedCorsHeaders(request), "cache-control": cacheControl, ...headers }
  });
}

export function handleRestrictedCorsOptions(request) {
  return new Response(null, {
    status: 204,
    headers: { ...SECURITY_HEADERS, ...restrictedCorsHeaders(request) }
  });
}

// ---------------------------------------------------------------------------
// API key authentication (Cloudflare KV)
// ---------------------------------------------------------------------------

/**
 * KV schema for an API key entry:
 *   key   = "key:<sha256-hex>"
 *   value = JSON { name, tier, rateLimit, createdAt, active, hashAlgorithm, hashDigest }
 *
 * The Authorization header carries: `Bearer <raw-api-key>`
 * We hash it with SHA-256 for deterministic KV lookup, then verify the keyed
 * digest stored in the record with API_KEY_HASH_SECRET.
 */

export async function sha256Hex(text) {
  const data = new TextEncoder().encode(text);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function hmacSha256Hex(secret, text) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(text));
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function constantTimeHexEquals(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  if (!/^[a-f0-9]+$/i.test(a) || !/^[a-f0-9]+$/i.test(b)) return false;

  const left = a.toLowerCase();
  const right = b.toLowerCase();
  const maxLength = Math.max(left.length, right.length);
  let diff = left.length ^ right.length;

  for (let i = 0; i < maxLength; i++) {
    diff |= (left.charCodeAt(i) || 0) ^ (right.charCodeAt(i) || 0);
  }

  return diff === 0;
}

async function verifyApiKeyRecord(rawKey, record, env) {
  if (record?.hashAlgorithm !== "hmac-sha256") {
    return false;
  }

  const secret = String(env?.API_KEY_HASH_SECRET ?? "");
  if (secret.length < 32 || !record.hashDigest) {
    return false;
  }

  const expected = await hmacSha256Hex(secret, rawKey);
  return constantTimeHexEquals(expected, record.hashDigest);
}

export async function createApiKeyRecord(rawKey, { name, tier, rateLimit, createdAt = new Date().toISOString(), env }) {
  const keyHash = await sha256Hex(rawKey);
  const secret = String(env?.API_KEY_HASH_SECRET ?? "");
  if (secret.length < 32) {
    throw new Error("API_KEY_HASH_SECRET is not configured.");
  }

  const record = {
    name,
    tier,
    rateLimit,
    createdAt,
    active: true
  };
  record.hashAlgorithm = "hmac-sha256";
  record.hashDigest = await hmacSha256Hex(secret, rawKey);

  return { keyHash, record };
}

async function readApiKeyRecord(kv, keyHash) {
  const rawRecord = await kv.get(`key:${keyHash}`).catch(() => null);
  if (!rawRecord) {
    return {
      record: null,
      rawRecordLength: 0,
      parseFailed: false
    };
  }

  try {
    const parsed = JSON.parse(rawRecord);
    return {
      record: parsed && typeof parsed === "object" ? parsed : null,
      rawRecordLength: rawRecord.length,
      parseFailed: false
    };
  } catch {
    return {
      record: null,
      rawRecordLength: rawRecord.length,
      parseFailed: true
    };
  }
}

export async function authenticateRequest(request, env) {
  const authHeader = (request.headers.get("authorization") ?? "").trim();

  if (!authHeader.toLowerCase().startsWith("bearer ")) {
    return {
      authenticated: false,
      error: "Authentication failed.",
      status: 401
    };
  }

  const rawKey = authHeader.slice(7).trim();
  if (!rawKey) {
    return {
      authenticated: false,
      error: "Authentication failed.",
      status: 401
    };
  }

  const kv = env?.API_KEYS;
  if (!kv) {
    return {
      authenticated: false,
      error: "API key store is unavailable. Please contact support.",
      status: 503
    };
  }

  const keyHash = await sha256Hex(rawKey);
  const { record } = await readApiKeyRecord(kv, keyHash);

  if (!record || record.active === false || !(await verifyApiKeyRecord(rawKey, record, env))) {
    return {
      authenticated: false,
      error: "Authentication failed.",
      status: 401
    };
  }

  return {
    authenticated: true,
    keyHash,
    keyName: record.name ?? "unknown",
    tier: record.tier ?? "free",
    rateLimit: record.rateLimit ?? { max: 100, windowMs: 60_000 }
  };
}

// ---------------------------------------------------------------------------
// Per-key rate limiting (KV-backed with in-memory fallback)
// ---------------------------------------------------------------------------

function readRetryAfter(windowEnd, now) {
  return Math.max(1, Math.ceil((windowEnd - now) / 1000));
}

function checkMemoryRateLimit(key, limit, windowMs, now) {
  const threshold = now - windowMs;
  const bucket = (rateLimitBuckets.get(key) ?? []).filter((ts) => ts > threshold);

  if (bucket.length >= limit) {
    rateLimitBuckets.set(key, bucket);
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: readRetryAfter(bucket[0] + windowMs, now),
      resetAt: new Date(bucket[0] + windowMs).toISOString()
    };
  }

  bucket.push(now);
  rateLimitBuckets.set(key, bucket);
  return {
    allowed: true,
    remaining: limit - bucket.length,
    retryAfterSeconds: 0,
    resetAt: new Date(now + windowMs).toISOString()
  };
}

/**
 * KV-backed rate limiting.
 *
 * Stores a counter in KV under `ratelimit:<keyHash>` with a TTL matching the
 * rate window. This survives cold starts and works across isolates — unlike
 * the Cache API which is unreliable on Pages Functions, or pure in-memory
 * which resets on every cold start.
 *
 * Falls back to in-memory if KV is unavailable.
 */
export async function checkApiRateLimit(keyHash, rateLimit, kv) {
  const { max, windowMs } = rateLimit;
  const now = Date.now();
  const memKey = `api:${keyHash}`;

  // In-memory check first — catches bursts within the same isolate without KV round-trip.
  // KV get-then-put has a TOCTOU race across isolates; this narrows the window.
  const memResult = checkMemoryRateLimit(memKey, max, windowMs, now);
  if (!memResult.allowed) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: memResult.retryAfterSeconds,
      resetAt: new Date(now + memResult.retryAfterSeconds * 1000).toISOString()
    };
  }

  if (!kv) {
    return {
      allowed: memResult.allowed,
      remaining: max - 1,
      retryAfterSeconds: 0,
      resetAt: new Date(now + windowMs).toISOString()
    };
  }

  const kvKey = `ratelimit:${keyHash}`;
  const windowSeconds = Math.max(1, Math.ceil(windowMs / 1000));

  try {
    const raw = await kv.get(kvKey);
    let state = null;

    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed.count === "number" && typeof parsed.resetAt === "number" && parsed.resetAt > now) {
          state = parsed;
        }
      } catch {
        // Corrupted entry — treat as new window
      }
    }

    if (state) {
      if (state.count >= max) {
        return {
          allowed: false,
          remaining: 0,
          retryAfterSeconds: readRetryAfter(state.resetAt, now),
          resetAt: new Date(state.resetAt).toISOString()
        };
      }

      const updated = { count: state.count + 1, resetAt: state.resetAt };
      const ttl = Math.max(1, Math.ceil((state.resetAt - now) / 1000));
      await kv.put(kvKey, JSON.stringify(updated), { expirationTtl: ttl });

      return {
        allowed: true,
        remaining: max - updated.count,
        retryAfterSeconds: 0,
        resetAt: new Date(state.resetAt).toISOString()
      };
    }

    // New window
    const resetAt = now + windowMs;
    await kv.put(kvKey, JSON.stringify({ count: 1, resetAt }), { expirationTtl: windowSeconds });

    return {
      allowed: true,
      remaining: max - 1,
      retryAfterSeconds: 0,
      resetAt: new Date(resetAt).toISOString()
    };
  } catch {
    return {
      allowed: memResult.allowed,
      remaining: max - 1,
      retryAfterSeconds: 0,
      resetAt: new Date(now + windowMs).toISOString()
    };
  }
}

// ---------------------------------------------------------------------------
// IP-based rate limiting (for admin endpoints)
// ---------------------------------------------------------------------------

export function checkAdminRateLimit(request, { limit = 10, windowMs = 300_000 } = {}) {
  const ip = request.headers.get("cf-connecting-ip")?.trim()
    || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || "unknown";
  return checkMemoryRateLimit(`admin:${ip}`, limit, windowMs, Date.now());
}

// ---------------------------------------------------------------------------
// Request parsing
// ---------------------------------------------------------------------------

const API_REQUEST_MAX_BYTES = 32_768;

export async function readApiJsonBody(request) {
  const contentType = request.headers.get("content-type") ?? "";

  if (!contentType.toLowerCase().includes("application/json")) {
    throw new Error("Content-Type must be application/json.");
  }

  const declaredLength = parseInt(request.headers.get("content-length") || "0", 10);
  if (declaredLength > API_REQUEST_MAX_BYTES) {
    throw new Error(`Request body exceeds ${Math.floor(API_REQUEST_MAX_BYTES / 1024)} KB limit.`);
  }

  const text = await request.text();
  const byteLength = new TextEncoder().encode(text).length;

  if (!text.trim()) {
    throw new Error("Request body is empty.");
  }

  if (byteLength > API_REQUEST_MAX_BYTES) {
    throw new Error(`Request body exceeds ${Math.floor(API_REQUEST_MAX_BYTES / 1024)} KB limit.`);
  }

  try {
    const payload = JSON.parse(text);
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      throw new Error();
    }
    return payload;
  } catch {
    throw new Error("Request body must be a JSON object.");
  }
}
