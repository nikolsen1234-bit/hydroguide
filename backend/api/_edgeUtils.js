const RATE_LIMIT_CACHE_ORIGIN = "https://hydroguide.internal";
const DEFAULT_RESPONSE_HEADERS = {
  "referrer-policy": "same-origin",
  "x-content-type-options": "nosniff"
};
const rateLimitBuckets = new Map();

function getCache() {
  return globalThis.caches?.default ?? null;
}

function jsonReq(url) {
  return new Request(url, { method: "GET", headers: { accept: "application/json" } });
}

function readRetryAfter(windowEnd, now) {
  return Math.max(1, Math.ceil((windowEnd - now) / 1000));
}

async function readRateLimitState(cacheKey, now) {
  const cache = getCache();
  if (!cache) {
    return null;
  }

  try {
    const response = await cache.match(jsonReq(cacheKey));
    if (!response) {
      return null;
    }

    const payload = await response.json();
    const count = Number(payload?.count);
    const resetAt = Number(payload?.resetAt);
    return Number.isFinite(count) && Number.isFinite(resetAt) && count >= 0 && resetAt > now
      ? { count: Math.floor(count), resetAt }
      : null;
  } catch {
    return null;
  }
}

async function writeRateLimitState(cacheKey, state, now) {
  const cache = getCache();
  if (!cache) {
    return false;
  }

  try {
    await cache.put(
      jsonReq(cacheKey),
      new Response(JSON.stringify(state), {
        headers: {
          "content-type": "application/json",
          "cache-control": `private, max-age=${readRetryAfter(state.resetAt, now)}`
        }
      })
    );
    return true;
  } catch {
    return false;
  }
}

function checkMemoryRateLimit(key, limit, windowMs, now) {
  const threshold = now - windowMs;
  const bucket = (rateLimitBuckets.get(key) ?? []).filter((timestamp) => timestamp > threshold);

  if (bucket.length >= limit) {
    rateLimitBuckets.set(key, bucket);
    return { allowed: false, retryAfterSeconds: readRetryAfter(bucket[0] + windowMs, now) };
  }

  bucket.push(now);
  rateLimitBuckets.set(key, bucket);
  return { allowed: true, retryAfterSeconds: 0 };
}

function getClientIdentifier(request, keyPrefix) {
  const ip = request.headers.get("cf-connecting-ip")?.trim()
    || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || "unknown";
  return `${keyPrefix}:${ip}`;
}

export function constantTimeEquals(left, right) {
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i++) diff |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return diff === 0;
}

export function createJsonResponse(payload, options = {}) {
  const { status = 200, cacheControl = "no-store", headers = {} } = options;

  return Response.json(payload, {
    status,
    headers: {
      ...DEFAULT_RESPONSE_HEADERS,
      "cache-control": cacheControl,
      ...headers
    }
  });
}

export function createMethodNotAllowedResponse(allowedMethods) {
  return createJsonResponse(
    { error: "Metoden er ikkje tillaten." },
    { status: 405, headers: { allow: allowedMethods.join(", ") } }
  );
}

export async function readJsonRequest(request, options = {}) {
  const { maxBytes = 4096 } = options;
  const contentType = request.headers.get("content-type") ?? "";

  if (!contentType.toLowerCase().includes("application/json")) {
    throw new Error("Foresporselen ma bruke application/json.");
  }

  const text = await request.text();
  const byteLength = new TextEncoder().encode(text).length;

  if (!text.trim()) {
    throw new Error("Foresporselen manglar JSON-innhald.");
  }

  if (byteLength > maxBytes) {
    throw new Error("Foresporselen er for stor.");
  }

  try {
    const payload = JSON.parse(text);
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      throw new Error();
    }

    return payload;
  } catch {
    throw new Error("Foresporselen ma vere eit JSON-objekt.");
  }
}

export async function checkRateLimit({ request, keyPrefix, limit, windowMs }) {
  const now = Date.now();
  const key = getClientIdentifier(request, keyPrefix);
  const cacheKey = `${RATE_LIMIT_CACHE_ORIGIN}/rate-limit/${key}`;
  const sharedState = await readRateLimitState(cacheKey, now);

  if (sharedState) {
    if (sharedState.count >= limit) {
      return { allowed: false, retryAfterSeconds: readRetryAfter(sharedState.resetAt, now) };
    }

    if (
      await writeRateLimitState(
        cacheKey,
        { count: sharedState.count + 1, resetAt: sharedState.resetAt },
        now
      )
    ) {
      return { allowed: true, retryAfterSeconds: 0 };
    }
  } else if (await writeRateLimitState(cacheKey, { count: 1, resetAt: now + windowMs }, now)) {
    return { allowed: true, retryAfterSeconds: 0 };
  }

  return checkMemoryRateLimit(key, limit, windowMs, now);
}
