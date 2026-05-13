import assert from "node:assert/strict";
import { test } from "node:test";
import { embedTexts } from "../lib/knowledge.mjs";

test("embedTexts splits an unstable embedding batch into smaller requests", async () => {
  const requestSizes = [];
  const rows = await embedTexts({
    texts: ["a", "b", "c", "d"],
    baseUrl: "http://local.test/v1",
    model: "text-embedding-qwen3-embedding-4b",
    batchSize: 4,
    timeoutMs: 1000,
    fetchImpl: async (_url, init) => {
      const body = JSON.parse(init.body);
      requestSizes.push(body.input.length);
      if (body.input.length > 1) {
        throw new Error("batch too large");
      }
      return Response.json({
        data: [{ embedding: [body.input[0].charCodeAt(0)] }]
      });
    }
  });

  assert.deepEqual(requestSizes, [4, 2, 1, 1, 2, 1, 1]);
  assert.deepEqual(rows, [[97], [98], [99], [100]]);
});
