import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  authenticateRequest,
  createApiKeyRecord,
  sha256Hex
} from "./_apiUtils.js";

const API_KEY_HASH_SECRET = "test-secret-with-at-least-32-characters";

function makeKv(entries) {
  const store = new Map(entries);
  return {
    async get(key) {
      return store.get(key) ?? null;
    }
  };
}

function makeRequest(rawKey) {
  return new Request("https://hydroguide.no/api/calculations", {
    headers: { authorization: `Bearer ${rawKey}` }
  });
}

describe("authenticateRequest", () => {
  it("accepts API records with HMAC verification", async () => {
    const rawKey = "hg_live_secure-test-key";
    const { keyHash, record } = await createApiKeyRecord(rawKey, {
      name: "Secure key",
      tier: "free",
      rateLimit: { max: 100, windowMs: 60_000 },
      createdAt: "2026-04-29T00:00:00.000Z",
      env: { API_KEY_HASH_SECRET }
    });

    const result = await authenticateRequest(makeRequest(rawKey), {
      API_KEY_HASH_SECRET,
      API_KEYS: makeKv([[`key:${keyHash}`, JSON.stringify(record)]])
    });

    assert.equal(result.authenticated, true);
    assert.equal(result.keyHash, keyHash);
    assert.equal(result.keyName, "Secure key");
  });

  it("rejects HMAC records when the Worker secret does not match", async () => {
    const rawKey = "hg_live_secure-test-key";
    const { keyHash, record } = await createApiKeyRecord(rawKey, {
      name: "Secure key",
      tier: "free",
      rateLimit: { max: 100, windowMs: 60_000 },
      env: { API_KEY_HASH_SECRET }
    });

    const result = await authenticateRequest(makeRequest(rawKey), {
      API_KEY_HASH_SECRET: "different-secret-with-at-least-32-chars",
      API_KEYS: makeKv([[`key:${keyHash}`, JSON.stringify(record)]])
    });

    assert.equal(result.authenticated, false);
    assert.equal(result.status, 401);
  });

  it("rejects legacy SHA-only records", async () => {
    const rawKey = "hg_live_legacy-test-key";
    const keyHash = await sha256Hex(rawKey);
    const legacyRecord = {
      name: "Legacy key",
      tier: "free",
      rateLimit: { max: 100, windowMs: 60_000 },
      active: true
    };

    const result = await authenticateRequest(makeRequest(rawKey), {
      API_KEYS: makeKv([[`key:${keyHash}`, JSON.stringify(legacyRecord)]])
    });

    assert.equal(result.authenticated, false);
    assert.equal(result.status, 401);
  });

  it("requires API_KEY_HASH_SECRET when creating new API key records", async () => {
    await assert.rejects(
      createApiKeyRecord("hg_live_missing-secret", {
        name: "No secret",
        tier: "free",
        rateLimit: { max: 100, windowMs: 60_000 },
        env: {}
      }),
      /API_KEY_HASH_SECRET/
    );
  });
});
