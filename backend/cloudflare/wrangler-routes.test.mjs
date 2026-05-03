import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const workerConfigPaths = [
  "./api.wrangler.jsonc",
  "./report.wrangler.jsonc",
  "./ai.wrangler.jsonc",
  "./admin.wrangler.jsonc"
];

async function readConfig(relativePath) {
  return JSON.parse(await readFile(new URL(relativePath, import.meta.url), "utf8"));
}

test("nveid Worker route catches both /api/nveid and nested nveid paths", async () => {
  const config = await readConfig("./api.wrangler.jsonc");
  const nveidRoute = config.routes.find((route) => route.pattern.includes("/api/nveid"));

  assert.equal(nveidRoute?.pattern, "hydroguide.no/api/nveid*");
});

test("workers.dev subdomain is disabled for every HydroGuide Worker", async () => {
  for (const path of workerConfigPaths) {
    const config = await readConfig(path);
    assert.equal(
      config.workers_dev,
      false,
      "workers_dev must be false - leaving it true exposes a parallel workers.dev entry point that bypasses zone-level WAF and rate-limit rules."
    );
  }
});

test("source Wrangler configs do not contain custom secret metadata", async () => {
  for (const path of workerConfigPaths) {
    const config = await readConfig(path);
    assert.equal(config.secrets, undefined);
  }
});

test("report Worker calls the AI Worker through a service binding", async () => {
  const config = await readConfig("./report.wrangler.jsonc");
  const binding = config.services.find((service) => service.binding === "REPORT_AI_WORKER");

  assert.equal(binding?.service, "hydroguide-ai");
});

test("admin routes are not mounted on the public API Worker", async () => {
  const config = await readConfig("./api.wrangler.jsonc");
  const adminRoute = config.routes.find((route) => route.pattern.includes("/admin"));

  assert.equal(adminRoute, undefined);
});
