import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const INDEX_VERSION = 1;
const DEFAULT_BATCH_SIZE = Number.parseInt(process.env.REPORT_EMBEDDINGS_BATCH_SIZE ?? "", 10) || 8;
const WORD_RE = /[\p{L}\p{N}]{3,}/gu;
const EMBEDDING_RETRY_DELAY_MS = 3000;

function normalizeBaseUrl(baseUrl) {
  return String(baseUrl ?? "").trim().replace(/\/+$/, "");
}

function sha256Hex(value) {
  return createHash("sha256").update(value).digest("hex");
}

function delay(ms) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, ms));
}

function tokenize(text) {
  return new Set(String(text ?? "").toLowerCase().match(WORD_RE) ?? []);
}

function dot(left, right) {
  const length = Math.min(left.length, right.length);
  let sum = 0;
  for (let index = 0; index < length; index += 1) {
    sum += left[index] * right[index];
  }
  return sum;
}

function magnitude(vector) {
  return Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
}

export function cosineSimilarity(left, right) {
  if (!Array.isArray(left) || !Array.isArray(right) || left.length === 0 || right.length === 0) {
    return 0;
  }

  const denominator = magnitude(left) * magnitude(right);
  return denominator === 0 ? 0 : dot(left, right) / denominator;
}

export function parseKnowledgeJsonl(text) {
  return String(text ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, lineIndex) => {
      let chunk;
      try {
        chunk = JSON.parse(line);
      } catch (error) {
        throw new Error(`Invalid knowledge JSONL on line ${lineIndex + 1}.`);
      }

      if (!chunk || typeof chunk !== "object" || Array.isArray(chunk)) {
        throw new Error(`Knowledge line ${lineIndex + 1} must be a JSON object.`);
      }

      const { id, category, title, text: chunkText, source } = chunk;
      if (typeof id !== "string" || !id.trim()) {
        throw new Error(`Knowledge line ${lineIndex + 1} is missing id.`);
      }
      if (typeof category !== "string" || !category.trim()) {
        throw new Error(`Knowledge line ${lineIndex + 1} is missing category.`);
      }
      if (typeof title !== "string" || !title.trim()) {
        throw new Error(`Knowledge line ${lineIndex + 1} is missing title.`);
      }
      if (typeof chunkText !== "string" || !chunkText.trim()) {
        throw new Error(`Knowledge line ${lineIndex + 1} is missing text.`);
      }
      if (!source || typeof source !== "object" || typeof source.title !== "string") {
        throw new Error(`Knowledge line ${lineIndex + 1} is missing source metadata.`);
      }

      return {
        ...chunk,
        id: id.trim(),
        category: category.trim(),
        title: title.trim(),
        text: chunkText.trim(),
        tags: Array.isArray(chunk.tags) ? chunk.tags.map((tag) => String(tag).trim()).filter(Boolean) : [],
        source: {
          title: source.title.trim(),
          year: source.year ?? null,
          type: typeof source.type === "string" ? source.type.trim() : "",
          locator: typeof source.locator === "string" ? source.locator.trim() : "",
          url: typeof source.url === "string" ? source.url.trim() : ""
        }
      };
    });
}

export async function loadKnowledge(knowledgePath) {
  const absolutePath = resolve(knowledgePath);
  const text = await readFile(absolutePath, "utf8");
  const chunks = parseKnowledgeJsonl(text);
  const ids = new Set();
  for (const chunk of chunks) {
    if (ids.has(chunk.id)) {
      throw new Error(`Duplicate knowledge id: ${chunk.id}`);
    }
    ids.add(chunk.id);
  }

  return { absolutePath, sourceHash: sha256Hex(text), chunks };
}

function extractEmbeddingRows(payload) {
  const data = payload?.data ?? payload?.result?.data ?? payload?.result?.embeddings ?? payload?.embeddings;
  if (!Array.isArray(data)) {
    return [];
  }

  if (data.every((item) => Array.isArray(item))) {
    return data;
  }

  return data
    .map((item) => item?.embedding)
    .filter((embedding) => Array.isArray(embedding));
}

export async function embedTexts({
  texts,
  baseUrl,
  model,
  apiKey = "",
  fetchImpl = fetch,
  batchSize = DEFAULT_BATCH_SIZE,
  timeoutMs = 8000
}) {
  if (!Array.isArray(texts) || texts.length === 0) {
    return [];
  }

  const endpoint = `${normalizeBaseUrl(baseUrl)}/embeddings`;
  const embeddings = [];
  const embedBatch = async (input, attempt = 1) => {
    const headers = { "content-type": "application/json" };
    if (apiKey) {
      headers.authorization = `Bearer ${apiKey}`;
    }

    try {
      const response = await fetchImpl(endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify({ model, input }),
        signal: AbortSignal.timeout(timeoutMs)
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        throw new Error(`Embedding endpoint returned ${response.status}${errorText ? `: ${errorText.slice(0, 300)}` : ""}.`);
      }

      const payload = await response.json();
      const rows = extractEmbeddingRows(payload);
      if (rows.length !== input.length) {
        throw new Error(`Embedding endpoint returned ${rows.length} vectors for ${input.length} texts.`);
      }
      for (const row of rows) {
        if (!row.every((value) => Number.isFinite(value))) {
          throw new Error("Embedding endpoint returned a non-numeric vector.");
        }
      }
      return rows;
    } catch (error) {
      if (input.length > 1) {
        const midpoint = Math.ceil(input.length / 2);
        const left = await embedBatch(input.slice(0, midpoint), attempt);
        const right = await embedBatch(input.slice(midpoint), attempt);
        return [...left, ...right];
      }

      if (attempt < 3) {
        await delay(EMBEDDING_RETRY_DELAY_MS * attempt);
        return embedBatch(input, attempt + 1);
      }

      throw error;
    }
  };

  for (let start = 0; start < texts.length; start += batchSize) {
    const input = texts.slice(start, start + batchSize);
    embeddings.push(...await embedBatch(input));
  }

  return embeddings;
}

async function readIndex(indexPath) {
  try {
    return JSON.parse(await readFile(indexPath, "utf8"));
  } catch {
    return null;
  }
}

function indexIsCurrent(index, { sourceHash, model, chunks }) {
  return (
    index?.version === INDEX_VERSION &&
    index?.sourceHash === sourceHash &&
    index?.embeddingModel === model &&
    Array.isArray(index?.items) &&
    index.items.length === chunks.length
  );
}

export async function ensureVectorIndex({
  knowledgePath,
  indexPath,
  embeddingsBaseUrl,
  embeddingsModel,
  embeddingsApiKey = "",
  fetchImpl = fetch,
  embeddingsTimeoutMs = 8000,
  embeddingsBatchSize = DEFAULT_BATCH_SIZE
}) {
  const knowledge = await loadKnowledge(knowledgePath);
  const currentIndex = await readIndex(indexPath);
  if (indexIsCurrent(currentIndex, {
    sourceHash: knowledge.sourceHash,
    model: embeddingsModel,
    chunks: knowledge.chunks
  })) {
    return { knowledge, index: currentIndex, rebuilt: false };
  }

  const partialPath = `${indexPath}.partial`;
  const partialIndex = await readIndex(partialPath);
  const canResume = indexIsCurrent(partialIndex, {
    sourceHash: knowledge.sourceHash,
    model: embeddingsModel,
    chunks: {
      length: Math.min(partialIndex?.items?.length ?? 0, knowledge.chunks.length)
    }
  });
  const itemsById = new Map(
    canResume ? partialIndex.items.map((item) => [item.id, item]) : []
  );

  for (let start = 0; start < knowledge.chunks.length; start += embeddingsBatchSize) {
    const batch = knowledge.chunks
      .slice(start, start + embeddingsBatchSize)
      .filter((chunk) => !itemsById.has(chunk.id));
    if (batch.length === 0) {
      continue;
    }

    const embeddings = await embedTexts({
      texts: batch.map((chunk) => `${chunk.title}\n${chunk.text}`),
      baseUrl: embeddingsBaseUrl,
      model: embeddingsModel,
      apiKey: embeddingsApiKey,
      fetchImpl,
      timeoutMs: embeddingsTimeoutMs,
      batchSize: batch.length
    });

    batch.forEach((chunk, index) => {
      itemsById.set(chunk.id, {
        id: chunk.id,
        embedding: embeddings[index]
      });
    });

    await mkdir(dirname(indexPath), { recursive: true });
    await writeFile(
      partialPath,
      `${JSON.stringify({
        version: INDEX_VERSION,
        generatedAt: new Date().toISOString(),
        sourcePath: knowledge.absolutePath,
        sourceHash: knowledge.sourceHash,
        embeddingModel: embeddingsModel,
        dimensions: embeddings[0]?.length ?? partialIndex?.dimensions ?? 0,
        items: knowledge.chunks
          .map((chunk) => itemsById.get(chunk.id))
          .filter(Boolean)
      }, null, 2)}\n`,
      "utf8"
    );
  }

  const orderedItems = knowledge.chunks.map((chunk) => itemsById.get(chunk.id));
  if (orderedItems.some((item) => !item)) {
    throw new Error(`Vector index incomplete: ${orderedItems.filter(Boolean).length}/${knowledge.chunks.length} chunks embedded.`);
  }

  const index = {
    version: INDEX_VERSION,
    generatedAt: new Date().toISOString(),
    sourcePath: knowledge.absolutePath,
    sourceHash: knowledge.sourceHash,
    embeddingModel: embeddingsModel,
    dimensions: orderedItems[0]?.embedding?.length ?? 0,
    items: orderedItems
  };

  await mkdir(dirname(indexPath), { recursive: true });
  await writeFile(indexPath, `${JSON.stringify(index, null, 2)}\n`, "utf8");
  await rm(partialPath, { force: true });
  return { knowledge, index, rebuilt: true };
}

export function retrieveByVector({ chunks, index, queryEmbedding, topK = 8 }) {
  const chunksById = new Map(chunks.map((chunk) => [chunk.id, chunk]));
  return (index?.items ?? [])
    .map((item) => ({
      chunk: chunksById.get(item.id),
      score: cosineSimilarity(queryEmbedding, item.embedding)
    }))
    .filter((item) => item.chunk)
    .sort((left, right) => right.score - left.score)
    .slice(0, topK)
    .map(({ chunk, score }) => ({ ...chunk, score }));
}

export function retrieveByKeyword({ chunks, queryText, topK = 8 }) {
  const queryTokens = tokenize(queryText);
  return chunks
    .map((chunk) => {
      const chunkTokens = tokenize([
        chunk.id,
        chunk.category,
        chunk.title,
        chunk.tags.join(" "),
        chunk.text
      ].join(" "));
      let hits = 0;
      for (const token of queryTokens) {
        if (chunkTokens.has(token)) {
          hits += 1;
        }
      }
      return { ...chunk, score: hits / Math.max(1, queryTokens.size) };
    })
    .sort((left, right) => right.score - left.score || left.id.localeCompare(right.id))
    .slice(0, topK);
}
