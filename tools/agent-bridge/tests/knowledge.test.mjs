import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { loadKnowledge, retrieveByKeyword } from "../lib/knowledge.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "../../..");
const knowledgePath = resolve(repoRoot, "tools/agent-bridge/knowledge/report-knowledge.jsonl");
const manifestPath = resolve(repoRoot, "tools/agent-bridge/knowledge/report-sources.manifest.json");

test("report source manifest is limited to official NVE and Lovdata sources", async () => {
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));

  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.sources.length >= 5, true);
  for (const source of manifest.sources) {
    const host = new URL(source.url).hostname;
    assert.equal(host.endsWith("nve.no") || host === "lovdata.no", true);
    assert.equal(typeof source.id, "string");
    assert.equal(typeof source.title, "string");
    assert.equal(typeof source.url, "string");
  }
});

test("report knowledge JSONL loads with unique source-backed metadata", async () => {
  const knowledge = await loadKnowledge(knowledgePath);

  assert.equal(knowledge.chunks.length >= 25, true);
  assert.equal(new Set(knowledge.chunks.map((chunk) => chunk.id)).size, knowledge.chunks.length);
  for (const chunk of knowledge.chunks) {
    assert.equal(typeof chunk.source.title, "string");
    assert.equal(typeof chunk.source.type, "string");
    assert.equal(chunk.source.title.length > 0, true);
    assert.equal(chunk.source.url.startsWith("https://"), true);
  }
});

test("keyword fallback retrieves relevant report knowledge chunks", async () => {
  const knowledge = await loadKnowledge(knowledgePath);
  const results = retrieveByKeyword({
    chunks: knowledge.chunks,
    queryText: "rørslipp varegrind frostfritt rom mengdemåler reguleringsventil",
    topK: 3
  });

  assert.equal(results.some((chunk) => chunk.source.title.includes("minstevannføring")), true);
});
