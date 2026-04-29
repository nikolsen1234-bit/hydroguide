/**
 * fix-r2-metadata.mjs
 *
 * Re-uploads NVE corpus chunks to R2 with ASCII-normalised metadata.
 * Replaces Norwegian characters (æøå) with ASCII equivalents in title and context.
 *
 * Usage: node backend/scripts/fix-r2-metadata.mjs
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const WORKER_URL = process.env.R2_UPLOADER_URL;
const AUTH_TOKEN = process.env.R2_UPLOADER_TOKEN;
if (!WORKER_URL || !AUTH_TOKEN) {
  console.error("Missing required env vars: R2_UPLOADER_URL and R2_UPLOADER_TOKEN");
  process.exit(1);
}
const R2_PREFIX = "ai-search/nve-search";
// Corpus chunks are stored in R2, not in this repo. Provide the path externally or place chunks alongside this script.
const CORPUS_DIR = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve(__dirname, "..", "corpus", "nve-search");

// Source metadata mapping
const SOURCE_META = {
  "veileder-3-2020": {
    doctype: "veileder",
    topic: "minstevannfoering",
    regulatory: "true",
    priority: "1",
  },
  "minstevannforing-2024": {
    doctype: "retningslinje",
    topic: "minstevannfoering",
    regulatory: "true",
    priority: "1",
  },
  "vannforing-i-elv-2024": {
    doctype: "retningslinje",
    topic: "vannfoering-i-elv",
    regulatory: "true",
    priority: "1",
  },
  "hydrologiske-undersokelser": {
    doctype: "retningslinje",
    topic: "hydrologiske-undersokelser",
    regulatory: "true",
    priority: "2",
  },
  "datainnsending-2016": {
    doctype: "retningslinje",
    topic: "datainnsending",
    regulatory: "true",
    priority: "2",
  },
  "paalagt-vannforingsstasjon-2024": {
    doctype: "veileder",
    topic: "vannfoeringsstasjon",
    regulatory: "true",
    priority: "1",
  },
};

/**
 * Replace Norwegian characters with ASCII equivalents.
 * æ→ae, ø→oe, å→aa, Æ→Ae, Ø→Oe, Å→Aa
 */
function norwegianToAscii(str) {
  return str
    .replace(/æ/g, "ae")
    .replace(/ø/g, "oe")
    .replace(/å/g, "aa")
    .replace(/Æ/g, "Ae")
    .replace(/Ø/g, "Oe")
    .replace(/Å/g, "Aa");
}

async function uploadChunk(chunk, body) {
  const r2Key = `${R2_PREFIX}/${chunk.relativePath}`;
  const sourceMeta = SOURCE_META[chunk.sourceId];

  if (!sourceMeta) {
    throw new Error(`No source metadata for sourceId: ${chunk.sourceId}`);
  }

  // Context = section path from manifest (what AI Search sends to the LLM)
  const rawContext = chunk.section || chunk.title;

  const metadata = {
    doctype: sourceMeta.doctype,
    topic: sourceMeta.topic,
    regulatory: sourceMeta.regulatory,
    priority: sourceMeta.priority,
    context: norwegianToAscii(rawContext),
    title: norwegianToAscii(chunk.title),
    sourceId: chunk.sourceId,
    chunkId: chunk.chunkId,
  };

  const resp = await fetch(`${WORKER_URL}/${r2Key}`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${AUTH_TOKEN}`,
      "Content-Type": "text/markdown; charset=utf-8",
      "X-Custom-Metadata": JSON.stringify(metadata),
    },
    body,
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Upload failed for ${r2Key}: ${resp.status} ${text}`);
  }

  return metadata;
}

async function verifyChunk(r2Key) {
  const resp = await fetch(`${WORKER_URL}/${r2Key}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${AUTH_TOKEN}`,
    },
  });

  if (!resp.ok) {
    throw new Error(`Verify failed for ${r2Key}: ${resp.status}`);
  }

  return resp.json();
}

async function main() {
  const manifestPath = path.join(CORPUS_DIR, "manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));

  console.log(`Loaded manifest with ${manifest.length} chunks`);
  console.log(`Worker URL: ${WORKER_URL}`);
  console.log(`R2 prefix: ${R2_PREFIX}`);
  console.log("");

  let uploaded = 0;
  let errors = 0;

  for (const chunk of manifest) {
    const filePath = path.join(CORPUS_DIR, chunk.relativePath);
    const body = await readFile(filePath, "utf8");

    try {
      const metadata = await uploadChunk(chunk, body);
      uploaded++;
      // Print progress every 10 chunks, or for veileder-3-2020-002 (spot check)
      if (uploaded % 10 === 0 || chunk.chunkId === "veileder-3-2020-002") {
        console.log(`[${uploaded}/${manifest.length}] ${chunk.chunkId} => context: "${metadata.context}"`);
      }
    } catch (err) {
      errors++;
      console.error(`FAILED ${chunk.chunkId}: ${err.message}`);
    }
  }

  console.log("");
  console.log(`Upload complete: ${uploaded} succeeded, ${errors} failed out of ${manifest.length}`);

  // Spot-check: verify a veileder-3-2020 chunk that had "måling"
  console.log("");
  console.log("--- Spot-check verification ---");
  const checkKey = `${R2_PREFIX}/veileder-3-2020/veileder-3-2020-002.md`;
  try {
    const result = await verifyChunk(checkKey);
    console.log(`Key: ${checkKey}`);
    console.log(`Metadata: ${JSON.stringify(result.customMetadata, null, 2)}`);
    const ctx = result.customMetadata?.context || "";
    if (ctx.includes("å") || ctx.includes("ø") || ctx.includes("æ")) {
      console.error("FAIL: Norwegian characters still present in context!");
    } else if (ctx.includes("maaling")) {
      console.log("PASS: 'maaling' found in context (was 'måling')");
    } else {
      console.log(`Context value: "${ctx}"`);
    }
  } catch (err) {
    console.error(`Spot-check failed: ${err.message}`);
  }

  // Also verify paalagt-vannforingsstasjon which had "pålagt vannføringsstasjon"
  console.log("");
  const checkKey2 = `${R2_PREFIX}/paalagt-vannforingsstasjon-2024/paalagt-vannforingsstasjon-2024-002.md`;
  try {
    const result2 = await verifyChunk(checkKey2);
    console.log(`Key: ${checkKey2}`);
    console.log(`Metadata: ${JSON.stringify(result2.customMetadata, null, 2)}`);
    const ctx2 = result2.customMetadata?.context || "";
    if (ctx2.includes("å") || ctx2.includes("ø") || ctx2.includes("æ")) {
      console.error("FAIL: Norwegian characters still present!");
    } else {
      console.log("PASS: No Norwegian special characters in metadata");
    }
  } catch (err) {
    console.error(`Spot-check 2 failed: ${err.message}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
