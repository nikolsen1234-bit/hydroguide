import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { generateReport } from "../lib/pipeline.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "../../..");
const knowledgePath = resolve(repoRoot, "tools/agent-bridge/knowledge/report-knowledge.jsonl");

function vectorFor(text) {
  const value = String(text ?? "").toLowerCase();
  return [
    value.includes("rør") || value.includes("varegrind") ? 1 : 0,
    value.includes("kontroll") || value.includes("verifikasjon") ? 1 : 0,
    value.includes("logger") || value.includes("sensor") ? 1 : 0,
    0.1
  ];
}

function validReportText() {
  return [
    "Rørslipp etter varegrind gir et tydelig og kontrollerbart målepunkt for ordinær drift, samtidig som utstyret skjermes bedre mot is, fukt og drivgods.",
    "NVE-grunnlaget peker også på behovet for kalibrering og senere kontrollmåling, slik at løsningen ikke bare beskrives teoretisk, men kan verifiseres med sporbare måledata.",
    "Loggeroppsett og kommunikasjon bør derfor vurderes sammen med måleprinsippet."
  ].join(" ");
}

function firstEvidenceIdFromPrompt(body) {
  const content = body.messages.at(-1).content;
  return content.match(/^id: ([^\n]+)$/m)?.[1] ?? "nve.metode.rormaaling";
}

function validReportFields() {
  return {
    recommendationNote: "Rorslipp etter varegrind passer fordi losningen gir et tydelig og kontrollerbart malepunkt for valgt driftssituasjon.",
    measurementNote: "Mengdemaler, logger og kontrollmaling henger sammen ved at ordinaer registrering kan kontrolleres mot sporbare feltmalinger.",
    energyNote: "Logger, samband og reserveoppsett passer nar batteri og solproduksjon vurderes samlet mot beregnet last og krav til oppetid.",
    evidenceNote: "Kildegrunnlaget stotter dokumentasjon med sporbar maling, kontrollverdier og etterprovbar drift."
  };
}

function createMockFetch({ failEmbeddings = false } = {}) {
  return async (url, init) => {
    const href = String(url);
    const body = JSON.parse(init.body);

    if (href.endsWith("/embeddings")) {
      if (failEmbeddings) {
        return Response.json({ error: "down" }, { status: 503 });
      }
      const input = Array.isArray(body.input) ? body.input : [body.input];
      return Response.json({
        data: input.map((text) => ({ embedding: vectorFor(text) }))
      });
    }

    if (href.endsWith("/chat/completions")) {
      return Response.json({
        choices: [
          {
            message: {
              content: JSON.stringify({
                fields: validReportFields(),
                evidenceIds: [firstEvidenceIdFromPrompt(body)]
              })
            }
          }
        ]
      });
    }

    throw new Error(`Unexpected mock fetch URL: ${href}`);
  };
}

function reportPayload() {
  return {
    project: "Testkraft",
    mainSolution: "Rørslipp med mengdemåler",
    releaseMethod: "Slipp gjennom rør etter varegrind",
    primaryMeasurement: "Mengdemåler i rør",
    controlMeasurement: "Kontrollmåling hvert tredje år",
    loggerSetup: "Logger med backup",
    reportExtract: "Anbefalt hovedløsning: Rørslipp med mengdemåler. Kontrollmåling for verifikasjon hvert tredje år."
  };
}

test("generateReport retrieves vectors and returns text with metadata", async () => {
  const tempDir = await mkdtemp(resolve(tmpdir(), "hydroguide-agent-"));
  const result = await generateReport(reportPayload(), {
    fetchImpl: createMockFetch(),
    config: {
      repoRoot,
      knowledgePath,
      indexPath: resolve(tempDir, "report-index.json"),
      embeddingsBaseUrl: "http://embedding.local/v1",
      embeddingsModel: "qwen-test",
      cliproxyBaseUrl: "http://cliproxy.local/v1",
      codexModel: "gpt-test"
    }
  });

  assert.equal(result.ok, true);
  assert.equal(result.body.model, "gpt-test");
  assert.equal(result.body.retrieval_backend, "qwen-vector-rebuilt");
  assert.equal(result.body.evidence_used.length, 1);
  assert.equal(result.body.narrative_mode, "report-fields");
  assert.equal(typeof result.body.fields.recommendationNote, "string");
});

test("generateReport falls back to keyword retrieval when embeddings fail", async () => {
  const tempDir = await mkdtemp(resolve(tmpdir(), "hydroguide-agent-"));
  const result = await generateReport(reportPayload(), {
    fetchImpl: createMockFetch({ failEmbeddings: true }),
    config: {
      repoRoot,
      knowledgePath,
      indexPath: resolve(tempDir, "report-index.json"),
      embeddingsBaseUrl: "http://embedding.local/v1",
      embeddingsModel: "qwen-test",
      cliproxyBaseUrl: "http://cliproxy.local/v1",
      codexModel: "gpt-test"
    }
  });

  assert.equal(result.ok, true);
  assert.equal(result.body.retrieval_backend, "keyword-fallback");
  assert.equal(typeof result.body.retrieval_warning, "string");
});

test("generateReport accepts legacy Norwegian report extract field", async () => {
  const tempDir = await mkdtemp(resolve(tmpdir(), "hydroguide-agent-"));
  const payload = reportPayload();
  payload.rapportutdrag = payload.reportExtract;
  delete payload.reportExtract;

  const result = await generateReport(payload, {
    fetchImpl: createMockFetch(),
    config: {
      repoRoot,
      knowledgePath,
      indexPath: resolve(tempDir, "report-index.json"),
      embeddingsBaseUrl: "http://embedding.local/v1",
      embeddingsModel: "qwen-test",
      cliproxyBaseUrl: "http://cliproxy.local/v1",
      codexModel: "gpt-test"
    }
  });

  assert.equal(result.ok, true);
  assert.equal(result.body.model, "gpt-test");
});

test("generateReport falls back to deterministic text when agent returns invalid JSON", async () => {
  const tempDir = await mkdtemp(resolve(tmpdir(), "hydroguide-agent-"));
  const result = await generateReport(reportPayload(), {
    fetchImpl: async (url, init) => {
      const href = String(url);
      const body = JSON.parse(init.body);

      if (href.endsWith("/embeddings")) {
        const input = Array.isArray(body.input) ? body.input : [body.input];
        return Response.json({
          data: input.map((text) => ({ embedding: vectorFor(text) }))
        });
      }

      if (href.endsWith("/chat/completions")) {
        return Response.json({
          choices: [{ message: { content: "Dette er ikke JSON." } }]
        });
      }

      throw new Error(`Unexpected mock fetch URL: ${href}`);
    },
    config: {
      repoRoot,
      knowledgePath,
      indexPath: resolve(tempDir, "report-index.json"),
      embeddingsBaseUrl: "http://embedding.local/v1",
      embeddingsModel: "qwen-test",
      cliproxyBaseUrl: "http://cliproxy.local/v1",
      codexModel: "gpt-test"
    }
  });

  assert.equal(result.ok, true);
  assert.equal(result.body.fallback_step, "agent-fallback");
  assert.equal(result.body.source, "local-codex-bridge");
});
