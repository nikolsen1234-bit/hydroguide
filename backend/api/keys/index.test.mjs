import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { onRequestPost } from "./index.js";

const ADMIN_TOKEN = "admin-token-with-32-or-more-characters-for-tests";
const HASH_SECRET = "hmac-secret-with-at-least-32-characters!";

function makeKv() {
  const store = new Map();
  return {
    store,
    async get(key) {
      return store.get(key) ?? null;
    },
    async put(key, value) {
      store.set(key, value);
    },
    async delete(key) {
      store.delete(key);
    },
    async list() {
      return { keys: Array.from(store.keys()).map((name) => ({ name })) };
    }
  };
}

function makeEnv() {
  return {
    INTERNAL_SERVICE_TOKEN: ADMIN_TOKEN,
    API_KEY_HASH_SECRET: HASH_SECRET,
    API_KEYS: makeKv()
  };
}

let testIpCounter = 0;
function uniqueTestIp() {
  testIpCounter += 1;
  return `203.0.113.${testIpCounter}`;
}

function adminPost(body, env = makeEnv()) {
  const request = new Request("https://hydroguide.no/api/keys", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-admin-token": ADMIN_TOKEN,
      "cf-connecting-ip": uniqueTestIp()
    },
    body: JSON.stringify(body)
  });
  return onRequestPost({ request, env });
}

function adminCreate(body, env = makeEnv()) {
  return adminPost({ action: "create", ...body }, env);
}

describe("POST /api/keys action=create — input validation (API3 BOPLA hardening)", () => {
  it("accepts a valid create with tier=free", async () => {
    const env = makeEnv();
    const response = await adminCreate({ name: "Test key", tier: "free" }, env);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.created, true);
    assert.equal(body.name, "Test key");
    assert.match(body.api_key ?? "", /^hg_live_/);
  });

  it("accepts tier=pro and tier=enterprise", async () => {
    for (const tier of ["pro", "enterprise"]) {
      const response = await adminCreate({ name: `Key ${tier}`, tier });
      assert.equal(response.status, 200, `tier=${tier} should be accepted`);
    }
  });

  it("rejects an unknown tier with 400", async () => {
    const response = await adminCreate({ name: "Bad tier", tier: "godmode" });
    assert.equal(response.status, 400);
    const body = await response.json();
    assert.match(body.error ?? "", /tier/i);
  });

  it("rejects rate_limit values that are negative, zero, or non-finite", async () => {
    for (const bad of [-1, 0, Number.NaN, "Infinity"]) {
      const response = await adminCreate({ name: "Bad rate", tier: "free", rate_limit: bad });
      assert.equal(response.status, 400, `rate_limit=${bad} should be rejected`);
    }
  });

  it("rejects rate_limit values above the documented ceiling", async () => {
    const response = await adminCreate({ name: "Huge rate", tier: "free", rate_limit: 1_000_000 });
    assert.equal(response.status, 400);
  });

  it("rejects rate_window_ms values below 1 second or above 24 hours", async () => {
    for (const bad of [-1, 0, 500, 25 * 60 * 60 * 1000]) {
      const response = await adminCreate({
        name: "Bad window",
        tier: "free",
        rate_window_ms: bad
      });
      assert.equal(response.status, 400, `rate_window_ms=${bad} should be rejected`);
    }
  });

  it("rejects names longer than 200 characters", async () => {
    const response = await adminCreate({ name: "a".repeat(201), tier: "free" });
    assert.equal(response.status, 400);
    const body = await response.json();
    assert.match(body.error ?? "", /name/i);
  });

  it("rejects empty names", async () => {
    const response = await adminCreate({ name: "", tier: "free" });
    assert.equal(response.status, 400);
  });

  it("rejects non-string name and tier values with 400", async () => {
    for (const body of [
      { name: 123, tier: "free" },
      { name: "Bad tier type", tier: 123 }
    ]) {
      const response = await adminCreate(body);
      assert.equal(response.status, 400);
      const responseBody = await response.json();
      assert.match(responseBody.error ?? "", /must be a string/i);
    }
  });

  it("defaults tier to free when omitted", async () => {
    const response = await adminCreate({ name: "Default tier" });
    assert.equal(response.status, 200);
  });
});

describe("POST /api/keys malformed action handling", () => {
  it("returns 400 instead of throwing when action is not a string", async () => {
    const response = await adminPost({ action: 1 });
    assert.equal(response.status, 400);
    const body = await response.json();
    assert.match(body.error ?? "", /action must be one of/i);
  });

  it("returns 400 instead of throwing when key_hash is not a string", async () => {
    const response = await adminPost({ action: "revoke", key_hash: 1 });
    assert.equal(response.status, 400);
    const body = await response.json();
    assert.match(body.error ?? "", /key_hash/i);
  });
});

describe("POST /api/keys action=rotate — per-key rate limit (API6 hardening)", () => {
  // Provision a key directly into the KV mock so authenticateRequest can verify it.
  // Mirrors the pattern in _apiUtils.test.mjs. Each call uses a fresh seed so
  // tests in this block do not share rate-limit buckets via the module-scoped
  // in-memory Map in _apiUtils.js.
  let provisionSeed = 0;
  async function provisionKey(env) {
    provisionSeed += 1;
    const { createApiKeyRecord } = await import("../_apiUtils.js");
    const rawKey = `rotate-rate-limit-test-key-${provisionSeed}-${Date.now()}`;
    const { keyHash, record } = await createApiKeyRecord(rawKey, {
      name: "Rotate test",
      tier: "free",
      rateLimit: { max: 100, windowMs: 60_000 },
      createdAt: "2026-04-29T00:00:00.000Z",
      env
    });
    await env.API_KEYS.put(`key:${keyHash}`, JSON.stringify(record));
    return rawKey;
  }

  function rotateRequest(rawKey) {
    return new Request("https://hydroguide.no/api/keys", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${rawKey}`,
        "cf-connecting-ip": uniqueTestIp()
      },
      body: JSON.stringify({ action: "rotate" })
    });
  }

  it("blocks rotate after the per-key rotate limit is exceeded", async () => {
    const env = makeEnv();
    let rawKey = await provisionKey(env);

    // Allow up to 5 rotations within the window. The 6th should 429.
    const ROTATE_LIMIT = 5;
    for (let i = 0; i < ROTATE_LIMIT; i++) {
      const response = await onRequestPost({ request: rotateRequest(rawKey), env });
      assert.equal(response.status, 200, `rotation #${i + 1} should succeed`);
      const body = await response.json();
      assert.equal(body.rotated, true);
      // Each rotate replaces the active key; use the new one for the next call.
      rawKey = body.api_key;
    }

    const blocked = await onRequestPost({ request: rotateRequest(rawKey), env });
    assert.equal(blocked.status, 429, "rotation past the limit must be 429");
    const body = await blocked.json();
    assert.match(body.error ?? "", /too many|rate/i);
  });

  it("rate-limits on the OLD keyHash being rotated away from, so chained rotations cannot bypass the cap", async () => {
    // Regression: if the limit is keyed on the *new* hash, an attacker can rotate
    // unlimited times because each call mints a fresh hash with an empty bucket.
    // The limit must apply to the key being retired, accumulated across the chain.
    const env = makeEnv();
    let rawKey = await provisionKey(env);

    const ROTATE_LIMIT = 5;
    for (let i = 0; i < ROTATE_LIMIT; i++) {
      const response = await onRequestPost({ request: rotateRequest(rawKey), env });
      assert.equal(response.status, 200);
      rawKey = (await response.json()).api_key;
    }

    // After 5 rotations, the chain has produced 5 retired hashes. The 6th must still
    // be blocked even though the freshly-issued key has never been rotated before.
    const blocked = await onRequestPost({ request: rotateRequest(rawKey), env });
    assert.equal(blocked.status, 429);
  });
});
