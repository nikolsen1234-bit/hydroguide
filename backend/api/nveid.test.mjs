import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { onRequestGet } from "./nveid.js";

const minimumFlowData = JSON.parse(readFileSync(new URL("../data/minimumflow.json", import.meta.url), "utf8"));

function requestFor(path) {
  return new Request(`https://hydroguide.no${path}`);
}

function envWithData(data, onGet = () => {}) {
  return {
    MINIMUM_FLOW_BUCKET: {
      async get(key) {
        onGet(key);
        return {
          async json() {
            return data;
          }
        };
      }
    }
  };
}

async function readJson(response) {
  return response.json();
}

test("canonical minimumflow.json is perioder-only", () => {
  assert.ok(Object.keys(minimumFlowData).length > 0);

  for (const [nveID, station] of Object.entries(minimumFlowData)) {
    assert.ok(Array.isArray(station.inntak), `${nveID} must have inntak array`);

    for (const [index, intake] of station.inntak.entries()) {
      assert.equal("sommer_ls" in intake, false, `${nveID} inntak ${index} must not have sommer_ls`);
      assert.equal("sommer_periode" in intake, false, `${nveID} inntak ${index} must not have sommer_periode`);
      assert.equal("vinter_ls" in intake, false, `${nveID} inntak ${index} must not have vinter_ls`);
      assert.equal("vinter_periode" in intake, false, `${nveID} inntak ${index} must not have vinter_periode`);
      assert.ok(Array.isArray(intake.perioder) && intake.perioder.length > 0, `${nveID} inntak ${index} must have perioder`);
    }
  }
});

test("/api/nveid returns endpoint index without reading minimum-flow data", async () => {
  let readAttempted = false;
  const response = await onRequestGet({
    request: requestFor("/api/nveid"),
    env: envWithData(
      { 1696: { navn: "Hynna", funnet: true, inntak: [] } },
      () => {
        readAttempted = true;
        throw new Error("index must not read minimumflow.json");
      }
    )
  });

  assert.equal(response.status, 200);
  assert.equal(readAttempted, false);

  const payload = await readJson(response);
  assert.equal(payload.path, "/api/nveid");
  assert.deepEqual(payload.endpoints, ["/api/nveid/{nveID}"]);
});

test("/api/nveid/{nveID} returns full station data and child endpoint paths", async () => {
  const response = await onRequestGet({
    request: requestFor("/api/nveid/1696"),
    env: envWithData({
      1696: {
        navn: "Hynna",
        funnet: true,
        inntak: [
          {
            inntakFunksjon: "Hovedinntak",
            perioder: [{ ls: 150, periode: "01.05 - 30.09", note: null }]
          }
        ]
      }
    })
  });

  assert.equal(response.status, 200);
  const payload = await readJson(response);
  assert.equal(payload.path, "/api/nveid/1696");
  assert.deepEqual(payload.endpoints, [
    "/api/nveid/1696/minimum-flow",
    "/api/nveid/1696/concession"
  ]);
  assert.equal(payload.nveID, 1696);
  assert.equal(payload.navn, "Hynna");
  assert.equal(payload.funnet, true);
  assert.equal(payload.inntak.length, 1);
});

test("/api/NVEID/{NVEID} returns public V2 minimum-flow data", async () => {
  const response = await onRequestGet({
    request: requestFor("/api/NVEID/1696"),
    env: envWithData({
      1696: {
        navn: "Hynna",
        funnet: true,
        url: "https://www.nve.no/kdb/sc1696.pdf",
        inntak: [
          {
            inntakFunksjon: "Hovedinntak",
            perioder: [{ ls: 150, periode: "01.05 - 30.09", note: null }]
          }
        ]
      }
    })
  });

  assert.equal(response.status, 200);
  const payload = await readJson(response);
  assert.equal(payload["1696"].navn, "Hynna");
  assert.equal(payload["1696"].url, "https://www.nve.no/kdb/sc1696.pdf");
  assert.equal(payload["1696"].inntak[0].perioder[0].ls, 150);
});

test("/api/NVEID/{NVEID} ignores legacy seasonal minimum-flow fields", async () => {
  const response = await onRequestGet({
    request: requestFor("/api/NVEID/1696"),
    env: envWithData({
      1696: {
        navn: "Hynna",
        funnet: true,
        url: "https://www.nve.no/kdb/sc1696.pdf",
        inntak: [
          {
            inntakFunksjon: "Hovedinntak",
            sommer_ls: 150,
            sommer_periode: "01.05 - 30.09"
          }
        ]
      }
    })
  });

  assert.equal(response.status, 200);
  const payload = await readJson(response);
  assert.deepEqual(payload["1696"].inntak[0].perioder, [{ ls: null, periode: null, note: null }]);
});

test("/api/nveid/{nveID} accepts trailing slash with the same response", async () => {
  const env = envWithData({
    1696: { navn: "Hynna", funnet: true, inntak: [] }
  });
  const a = await onRequestGet({ request: requestFor("/api/nveid/1696"), env });
  const b = await onRequestGet({ request: requestFor("/api/nveid/1696/"), env });
  const aJson = await readJson(a);
  const bJson = await readJson(b);
  assert.equal(a.status, 200);
  assert.equal(b.status, 200);
  assert.deepEqual(aJson, bJson);
});

test("/api/nveid/{nveID}/minimum-flow returns only minimum-flow data", async () => {
  const response = await onRequestGet({
    request: requestFor("/api/nveid/1696/minimum-flow"),
    env: envWithData({
      1696: {
        navn: "Hynna",
        funnet: true,
        inntak: [
          {
            inntakFunksjon: "Hovedinntak",
            perioder: [{ ls: 150, periode: "01.05 - 30.09", note: null }]
          }
        ]
      }
    })
  });

  assert.equal(response.status, 200);
  const payload = await readJson(response);
  assert.equal(payload.path, "/api/nveid/1696/minimum-flow");
  assert.deepEqual(payload.endpoints, []);
  assert.equal(payload.nveID, 1696);
  assert.equal(payload.navn, "Hynna");
  assert.equal(payload.funnet, true);
  assert.equal(payload.inntak.length, 1);
  assert.equal("concession" in payload, false);
});

test("/api/nveid/{nveID}/minimum-flow accepts trailing slash with the same response", async () => {
  const env = envWithData({
    1696: { navn: "Hynna", funnet: true, inntak: [] }
  });
  const a = await onRequestGet({ request: requestFor("/api/nveid/1696/minimum-flow"), env });
  const b = await onRequestGet({ request: requestFor("/api/nveid/1696/minimum-flow/"), env });
  assert.deepEqual(await readJson(a), await readJson(b));
});

test("/api/nveid/{nveID}/concession returns concession reference shape", async () => {
  const response = await onRequestGet({
    request: requestFor("/api/nveid/1696/concession"),
    env: envWithData({
      1696: {
        navn: "Hynna",
        funnet: true,
        inntak: [],
        kdbNr: 4567,
        konsesjon_url: "https://www.nve.no/konsesjon/x?id=4567"
      }
    })
  });

  assert.equal(response.status, 200);
  const payload = await readJson(response);
  assert.equal(payload.path, "/api/nveid/1696/concession");
  assert.deepEqual(payload.endpoints, []);
  assert.equal(payload.nveID, 1696);
  assert.equal(payload.navn, "Hynna");
  assert.equal(payload.available, true);
  assert.equal(payload.kdbNr, 4567);
});

test("invalid NVEID returns 400", async () => {
  const response = await onRequestGet({
    request: requestFor("/api/nveid/abc"),
    env: envWithData({})
  });
  assert.equal(response.status, 400);
});

test("missing NVEID returns 404", async () => {
  const response = await onRequestGet({
    request: requestFor("/api/nveid/99999"),
    env: envWithData({})
  });
  assert.equal(response.status, 404);
});
