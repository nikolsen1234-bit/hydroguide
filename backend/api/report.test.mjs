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
      model: "gpt-5.5",
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

