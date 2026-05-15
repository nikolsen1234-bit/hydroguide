import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { onRequestOptions, onRequestPost } from "./report.js";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

async function sha256Hex(text) {
  const hashBuffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(hashBuffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function reportRequest(body, headers = {}) {
  return new Request("https://hydroguide.no/api/report", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "cf-connecting-ip": crypto.randomUUID(),
      ...headers
    },
    body: JSON.stringify(body)
  });
}

test("report Worker forwards sanitized report payload to local bridge", async () => {
  const accessCodeHash = await sha256Hex("rapport");
  let capturedRequest;
  globalThis.fetch = async (request) => {
    capturedRequest = request;
    return Response.json({
      text: "MÃ¥lesystemet bÃ¸r dokumenteres med kontinuerlig registrering og kontrollmÃ¥ling.",
      source: "local-codex-bridge",
      model: "gpt-5.4",
      retrieval_backend: "qwen-vector",
      evidence_used: []
    });
  };

  const response = await onRequestPost({
    request: reportRequest({
      accessCodeHash,
      project: "Test",
      mainSolution: "RÃ¸rslipp",
      rapportutdrag: "Anbefalt hovedlÃ¸sning: RÃ¸rslipp.",
      ignored: "do not forward"
    }, { origin: "https://hydroguide.no" }),
    env: {
      REPORT_ACCESS_CODE_HASH: accessCodeHash,
      REPORT_BRIDGE_URL: "https://agent-bridge.hydroguide.no",
      REPORT_BRIDGE_TOKEN: "bridge-token"
    }
  });

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("access-control-allow-origin"), "https://hydroguide.no");
  assert.equal(capturedRequest.url, "https://agent-bridge.hydroguide.no/report");
  assert.equal(capturedRequest.headers.get("authorization"), "Bearer bridge-token");
  const forwarded = await capturedRequest.json();
  assert.equal(typeof forwarded.requestId, "string");
  assert.equal(forwarded.report.project, "Test");
  assert.equal(forwarded.report.ignored, undefined);
  assert.equal(forwarded.report.accessCodeHash, undefined);
});

test("report Worker forwards source-anchored AI contract and drops legacy obligation answers", async () => {
  const accessCodeHash = await sha256Hex("rapport");
  let capturedRequest;
  globalThis.fetch = async (request) => {
    capturedRequest = request;
    return Response.json({
      fields: {
        recommendationNote: "Valgt metode er kildeforankret.",
        measurementNote: "Måleopplegget har sporbare kriterier.",
        energyNote: "Energioppsettet er dokumentert.",
        evidenceNote: "Kildegrunnlaget er brukt som avgrensing."
      },
      evidenceIds: ["nve.test"]
    });
  };

  const response = await onRequestPost({
    request: reportRequest({
      accessCodeHash,
      reportExtract: "Anbefalt hovedløsning: Rørslipp.",
      deterministicSelection: {
        methodCode: "pipe_via_intake_with_pipe_flow_meter",
        decisionStatus: "ANBEFALT_KILDEFORANKRET",
        sourceRefs: ["NVE_2020_4_2"]
      },
      answerFacts: [
        {
          id: "pipe_full_through_meter",
          label: "Rør er vannfylt gjennom måleren",
          value: "documented_satisfies_source_criterion",
          sourceRefs: ["NVE_2020_4_2"],
          sourceScope: "documentation_requirement"
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
      ],
      hourlyAutomaticLogging: "yes",
      secureDataStorageForNve: "yes",
      accuracyWithinFivePercent: "yes",
      completenessNinetySevenPercent: "yes"
    }),
    env: {
      REPORT_ACCESS_CODE_HASH: accessCodeHash,
      REPORT_BRIDGE_URL: "https://agent-bridge.hydroguide.no",
      REPORT_BRIDGE_TOKEN: "bridge-token"
    }
  });

  assert.equal(response.status, 200);
  const forwarded = await capturedRequest.json();
  assert.equal(forwarded.report.deterministicSelection.methodCode, "pipe_via_intake_with_pipe_flow_meter");
  assert.equal(forwarded.report.answerFacts[0].id, "pipe_full_through_meter");
  assert.equal(forwarded.report.implicitObligations[0].id, "nve_hourly_registration");
  assert.equal(forwarded.report.sourceChunks[0].id, "NVE_2020_4_2");
  assert.equal(forwarded.report.hourlyAutomaticLogging, undefined);
  assert.equal(forwarded.report.secureDataStorageForNve, undefined);
  assert.equal(forwarded.report.accuracyWithinFivePercent, undefined);
  assert.equal(forwarded.report.completenessNinetySevenPercent, undefined);
});

test("report Worker strips removed HydroGuide question fields from stale direct callers", async () => {
  const accessCodeHash = await sha256Hex("rapport");
  let capturedRequest;
  globalThis.fetch = async (request) => {
    capturedRequest = request;
    return Response.json({
      fields: {
        recommendationNote: "Valgt metode er kildeforankret.",
        measurementNote: "Måleopplegget har sporbare kriterier.",
        energyNote: "Energioppsettet er dokumentert.",
        evidenceNote: "Kildegrunnlaget er brukt som avgrensing."
      },
      evidenceIds: []
    });
  };

  const response = await onRequestPost({
    request: reportRequest({
      accessCodeHash,
      reportExtract:
        "Er kalibrering og kontrollmåling dokumentert? Kontrollmålinger og skade-/endringsrutiner er dokumentert.",
      controlMeasurement: "Kontrollmålinger og skade-/endringsrutiner er dokumentert",
      deterministicSelection: {
        methodCode: "pipe_via_intake_with_pipe_flow_meter",
        missingDocumentation: ["pipe_calibration_control", "pipe_full_through_meter"],
        "Er kalibrering og kontrollmåling dokumentert?": "old title key leaked"
      },
      answerFacts: [
        { id: "pipe_calibration_control", label: "Er kalibrering og kontrollmåling dokumentert?" },
        { id: "pipe_full_through_meter", label: "Er røret vannfylt gjennom hele rørstrekket?" }
      ],
      sourceChunks: [
        { id: "artificial_profile_control_measurements", text: "Kontrollmålinger og skade-/endringsrutiner er dokumentert" },
        { id: "NVE_2020_4_2", text: "Rørmåling må ha fylt rør." }
      ]
    }),
    env: {
      REPORT_ACCESS_CODE_HASH: accessCodeHash,
      REPORT_BRIDGE_URL: "https://agent-bridge.hydroguide.no",
      REPORT_BRIDGE_TOKEN: "bridge-token"
    }
  });

  assert.equal(response.status, 200);
  const forwarded = await capturedRequest.json();
  const forwardedText = JSON.stringify(forwarded.report);
  assert.equal(forwardedText.includes("pipe_calibration_control"), false);
  assert.equal(forwardedText.includes("artificial_profile_control_measurements"), false);
  assert.equal(forwardedText.includes("Er kalibrering og kontrollmåling dokumentert?"), false);
  assert.equal(forwardedText.includes("Kontrollmålinger og skade-/endringsrutiner er dokumentert"), false);
  assert.equal(forwarded.report.controlMeasurement, undefined);
  assert.deepEqual(forwarded.report.deterministicSelection.missingDocumentation, ["pipe_full_through_meter"]);
  assert.deepEqual(forwarded.report.answerFacts.map((item) => item.id), ["pipe_full_through_meter"]);
  assert.deepEqual(forwarded.report.sourceChunks.map((item) => item.id), ["NVE_2020_4_2"]);
});

test("report Worker accepts structured report fields without narrative text", async () => {
  const accessCodeHash = await sha256Hex("rapport");
  globalThis.fetch = async () =>
    Response.json({
      fields: {
        recommendationNote: "Valgt løsning passer prosjektdataene.",
        measurementNote: "Måling og logging henger sammen.",
        energyNote: "Energioppsettet passer beregnet last.",
        evidenceNote: "Kildene støtter sporbar dokumentasjon."
      },
      evidenceIds: ["nve.test"]
    });

  const response = await onRequestPost({
    request: reportRequest({
      accessCodeHash,
      project: "Test",
      reportExtract: "Anbefalt hovedløsning: Rørslipp."
    }),
    env: {
      REPORT_ACCESS_CODE_HASH: accessCodeHash,
      REPORT_BRIDGE_URL: "https://agent-bridge.hydroguide.no",
      REPORT_BRIDGE_TOKEN: "bridge-token"
    }
  });

  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.fields.recommendationNote, "Valgt løsning passer prosjektdataene.");
});

test("report Worker rejects invalid access code before bridge fetch", async () => {
  const expectedHash = await sha256Hex("rapport");
  let called = false;
  globalThis.fetch = async () => {
    called = true;
    return Response.json({ text: "unexpected" });
  };

  const response = await onRequestPost({
    request: reportRequest({ accessCodeHash: await sha256Hex("wrong"), reportExtract: "x" }),
    env: {
      REPORT_ACCESS_CODE_HASH: expectedHash,
      REPORT_BRIDGE_URL: "https://agent-bridge.hydroguide.no",
      REPORT_BRIDGE_TOKEN: "bridge-token"
    }
  });

  assert.equal(response.status, 403);
  assert.equal(called, false);
});

test("report Worker accepts legacy Norwegian access-code hash field", async () => {
  const accessCodeHash = await sha256Hex("rapport");
  let capturedRequest;
  let didFetchBridge = false;
  globalThis.fetch = async (request) => {
    capturedRequest = request;
    didFetchBridge = true;
    return Response.json({ text: "ok" });
  };

  const response = await onRequestPost({
    request: reportRequest({
      tilgangskodeHash: accessCodeHash,
      rapportutdrag: "Anbefalt hovedlÃ¸sning: RÃ¸rslipp."
    }),
    env: {
      REPORT_ACCESS_CODE_HASH: accessCodeHash,
      REPORT_BRIDGE_TOKEN: "bridge-token",
      REPORT_BRIDGE_URL: "https://agent-bridge.hydroguide.no"
    }
  });

  assert.equal(response.status, 200);
  assert.equal(didFetchBridge, true);
  const forwarded = await capturedRequest.json();
  assert.equal(forwarded.report.reportExtract, "Anbefalt hovedlÃ¸sning: RÃ¸rslipp.");
});

test("report Worker OPTIONS restricts CORS to allowed origins", async () => {
  const response = await onRequestOptions({
    request: new Request("https://hydroguide.no/api/report", {
      method: "OPTIONS",
      headers: { origin: "https://evil.example" }
    })
  });

  assert.equal(response.status, 204);
  assert.equal(response.headers.get("access-control-allow-origin"), null);
  assert.equal(response.headers.get("access-control-allow-methods"), "POST, OPTIONS");
});

