import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  createApiKeyRecord,
  hmacSha256Hex,
  sha256Hex
} from "./manage-api-keys.mjs";

process.env.API_KEY_HASH_SECRET = "test-secret-with-at-least-32-characters";

describe("manage-api-keys", () => {
  it("stores a deterministic lookup hash plus a keyed verifier", () => {
    const rawKey = "hg_live_test-key";
    const { keyHash, record } = createApiKeyRecord(rawKey, {
      name: "Test customer",
      tier: "free",
      rateLimit: { max: 100, windowMs: 60_000 },
      createdAt: "2026-04-29T00:00:00.000Z"
    });

    assert.equal(keyHash, sha256Hex(rawKey));
    assert.equal(record.active, true);
    assert.equal(record.name, "Test customer");
    assert.equal(record.tier, "free");
    assert.deepEqual(record.rateLimit, { max: 100, windowMs: 60_000 });
    assert.equal(record.hashAlgorithm, "hmac-sha256");
    assert.equal(record.hashDigest, hmacSha256Hex(rawKey));
  });
});
