import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { defaultConfig, generateReport, normalizeReportPayload } from "../lib/pipeline.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "../../..");
const knowledgePath = resolve(repoRoot, "tools/agent-bridge/knowledge/report-knowledge.jsonl");

test("defaultConfig uses the LM Studio Qwen embedding model", () => {
  const previous = process.env.EMBEDDINGS_MODEL;
  delete process.env.EMBEDDINGS_MODEL;
  try {
    assert.equal(defaultConfig({ repoRoot }).embeddingsModel, "text-embedding-qwen3-embedding-4b");
  } finally {
    if (previous === undefined) {
      delete process.env.EMBEDDINGS_MODEL;
    } else {
      process.env.EMBEDDINGS_MODEL = previous;
    }
  }
});

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

test("normalizeReportPayload keeps source-anchored AI contract separate from answer facts", () => {
  const report = normalizeReportPayload({
    reportExtract: "Anbefalt hovedløsning: Rørslipp.",
    deterministicSelection: {
      methodCode: "intake_pipe",
      decisionStatus: "ANBEFALT_KILDEFORANKRET",
      sourceRefs: ["NVE_2020_4_2"]
    },
    answerFacts: [
      {
        id: "doc_method",
        label: "Hvordan dokumenteres vannføringen?",
        value: "doc_direct_flow",
        sourceRefs: ["NVE_2020_6_2"],
        sourceScope: "documentation_requirement"
      },
      {
        id: "nve_hourly_registration",
        label: "Automatisk registrering minst en gang per time",
        value: "documented_satisfies_source_criterion",
        sourceRefs: ["NVE_2024_MVF_4_1"],
        sourceScope: "implicit_obligation"
      }
    ],
    implicitObligations: [
      {
        id: "nve_hourly_registration",
        obligationText: "Valgt metode forutsetter automatisk registrering minst en gang per time.",
        sourceRefs: ["NVE_2024_MVF_4_1"]
      }
    ],
    sourceChunks: [
      {
        id: "NVE_2020_4_2",
        sourceRefs: ["NVE_2020_4_2"],
        text: "Rørmåling må ha dokumentert installasjon."
      }
    ]
  });

  assert.equal(report.deterministicSelection.methodCode, "intake_pipe");
  assert.deepEqual(report.answerFacts.map((fact) => fact.id), ["doc_method"]);
  assert.equal(report.implicitObligations[0].id, "nve_hourly_registration");
  assert.equal(report.sourceChunks[0].id, "NVE_2020_4_2");
});

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

test("generateReport skips validation retry when request budget is low", async () => {
  const tempDir = await mkdtemp(resolve(tmpdir(), "hydroguide-agent-"));
  let chatCalls = 0;
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
        chatCalls += 1;
        return Response.json({
          choices: [{ message: { content: JSON.stringify({ fields: {}, evidenceIds: [] }) } }]
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
      codexModel: "gpt-test",
      totalBudgetMs: 20000,
      responseReserveMs: 5000,
      validationRetryMinBudgetMs: 30000,
      minimumAgentCallMs: 1000
    }
  });

  assert.equal(result.ok, true);
  assert.equal(result.body.fallback_step, "validation-fallback");
  assert.equal(chatCalls, 1);
});
