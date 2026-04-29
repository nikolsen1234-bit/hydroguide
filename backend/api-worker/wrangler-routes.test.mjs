import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

test("nveid Worker route catches both /api/nveid and nested nveid paths", async () => {
  const config = JSON.parse(await readFile(new URL("./wrangler.jsonc", import.meta.url), "utf8"));
  const nveidRoute = config.routes.find((route) => route.pattern.includes("/api/nveid"));

  assert.equal(nveidRoute?.pattern, "hydroguide.no/api/nveid*");
});

test("workers.dev subdomain is disabled so all traffic goes through hydroguide.no zone rules", async () => {
  const config = JSON.parse(await readFile(new URL("./wrangler.jsonc", import.meta.url), "utf8"));

  assert.equal(
    config.workers_dev,
    false,
    "workers_dev must be false — leaving it true exposes hydroguide-api.<account>.workers.dev as a parallel entry point that bypasses zone-level WAF and rate-limit rules."
  );
});
