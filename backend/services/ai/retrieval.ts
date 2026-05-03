import type {
  Env,
  Rules,
  KeywordMap,
  NormalizedBody,
  RetrievalBackend,
  RetrievalResult,
  EvidenceUsed,
  EvidenceCandidate,
  BucketedEvidence,
} from "./types.js";
import {
  DEFAULT_AI_SEARCH_MAX_RESULTS,
  DEFAULT_AI_SEARCH_SCORE_THRESHOLD,
  DEFAULT_MAX_NVE_SNIPPETS,
  AI_SEARCH_TIMEOUT_MS,
  MAX_ITEMS_PER_BUCKET,
  DEDUP_TEXT_PREFIX_LENGTH,
} from "./types.js";
import {
  clampMaxSnippets,
  parsePositiveInteger,
  parseScoreThreshold,
  parseBooleanFlag,
  toCleanText,
} from "./utils.js";
import { resolveSecret } from "./auth.js";

// ─── Retrieval-specific types ───

const BUCKET_PREFIXES = ["krav", "metode", "valgkrit", "risiko", "drift"] as const;
type BucketPrefix = typeof BUCKET_PREFIXES[number];

const BUCKET_LABELS: Record<string, string> = {
  krav: "Kravgrunnlag (NVE)",
  metode: "Metode (NVE)",
  valgkrit: "Valgkriterium (NVE)",
  risiko: "Risiko / forbehold (NVE)",
  drift: "Drift (NVE)",
};

export type RetrievalStrategy = "hybrid" | "vectorize-only" | "autorag-only" | "kv-only" | "auto";

export type HybridRetrievalResult = {
  strategy: RetrievalStrategy;
  snippetsText: string;
  topicsUsed: string[];
  evidenceUsed: EvidenceUsed[];
  sources: {
    vectorize: number;
    autorag: number;
    kv: number;
  };
};

// ─── Pure helpers ───

export async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error(message)), timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

export function collectTextFragments(value: unknown, bucket: string[] = []): string[] {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed) {
      bucket.push(trimmed);
    }

    return bucket;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectTextFragments(item, bucket);
    }

    return bucket;
  }

  if (!value || typeof value !== "object") {
    return bucket;
  }

  const obj = value as Record<string, unknown>;

  for (const key of ["text", "snippet", "content", "value", "body", "chunk", "chunks", "item", "metadata"]) {
    if (key in obj) {
      collectTextFragments(obj[key], bucket);
    }
  }

  return bucket;
}

export function extractResultArray(payload: unknown): Record<string, unknown>[] {
  if (!payload || typeof payload !== "object") {
    return [];
  }

  const obj = payload as Record<string, unknown>;
  if (obj.result && typeof obj.result === "object" && !Array.isArray(obj.result)) {
    const nested = obj.result as Record<string, unknown>;
    if (Array.isArray(nested.chunks)) {
      return nested.chunks.filter(
        (item): item is Record<string, unknown> => Boolean(item) && typeof item === "object"
      );
    }
    if (Array.isArray(nested.data)) {
      return nested.data.filter(
        (item): item is Record<string, unknown> => Boolean(item) && typeof item === "object"
      );
    }
  }

  for (const key of ["chunks", "data", "results", "result"]) {
    const value = obj[key];
    if (Array.isArray(value)) {
      return value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object");
    }
  }

  return [];
}

export function firstNonEmptyString(values: unknown[]): string {
  for (const value of values) {
    const text = toCleanText(value, 200);
    if (text) {
      return text;
    }
  }

  return "";
}

export function extractCandidateSource(item: Record<string, unknown>): string {
  const metadata = item.metadata && typeof item.metadata === "object"
    ? (item.metadata as Record<string, unknown>)
    : {};
  const attributes = item.attributes && typeof item.attributes === "object"
    ? (item.attributes as Record<string, unknown>)
    : {};
  const nestedItem = item.item && typeof item.item === "object"
    ? (item.item as Record<string, unknown>)
    : {};

  return (
    firstNonEmptyString([
      item.source,
      item.path,
      item.file,
      item.filename,
      item.url,
      nestedItem.key,
      nestedItem.path,
      metadata.source,
      metadata.path,
      metadata.file,
      metadata.filename,
      metadata.url,
      metadata.title,
      attributes.folder,
    ]) || "ai-search"
  );
}

export function extractCandidateId(item: Record<string, unknown>, fallbackIndex: number): string {
  const metadata = item.metadata && typeof item.metadata === "object"
    ? (item.metadata as Record<string, unknown>)
    : {};
  const nestedItem = item.item && typeof item.item === "object"
    ? (item.item as Record<string, unknown>)
    : {};

  return (
    firstNonEmptyString([
      item.id,
      item.file_id,
      item.uuid,
      item.key,
      nestedItem.key,
      metadata.id,
      metadata.key,
    ]) || `ai-search-${fallbackIndex + 1}`
  );
}

export function extractCandidateScore(item: Record<string, unknown>): number | null {
  const scoringDetails = item.scoring_details && typeof item.scoring_details === "object"
    ? (item.scoring_details as Record<string, unknown>)
    : {};

  for (const value of [
    item.score,
    item.similarity,
    item.relevance_score,
    item.match_score,
    scoringDetails.reranking_score,
    scoringDetails.vector_score,
  ]) {
    const parsed = typeof value === "number" ? value : Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return null;
}

export function toEvidenceCandidates(payload: unknown): EvidenceCandidate[] {
  const rows = extractResultArray(payload);
  return rows
    .map((item, index) => ({
      id: extractCandidateId(item, index),
      source: extractCandidateSource(item),
      text: collectTextFragments(item).join(" ").replace(/\s+/g, " ").trim(),
      score: extractCandidateScore(item),
    }))
    .filter((item) => item.text.length > 0);
}

export function formatEvidenceBlock(item: EvidenceCandidate, index: number): string {
  const score = item.score === null ? "" : ` (score ${item.score.toFixed(3)})`;
  return `[Kjelde ${index + 1}] ${item.source}${score}\n${item.text}`;
}

// ─── Search text / keyword helpers (used by retrieval) ───

function normalizeSearchText(body: NormalizedBody): string {
  return [
    body.rapportutdrag,
    body.prosjektbeskrivelse,
    body.hovudloysing,
    body.slippmetode,
    body.primaermaaling,
    body.kontrollmaaling,
    body.maleprinsipp,
    body.maleutstyr,
    body.loggeroppsett,
    body.kommunikasjon,
    body.alarmVarsling,
    body.frostsikring,
    body.bypass,
    ...body.grunngiving,
    ...body.tilleggskrav,
    ...body.driftskrav,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function countKeywordHits(text: string, keywords: string[]): number {
  let score = 0;

  for (const rawKeyword of keywords) {
    const keyword = rawKeyword.toLowerCase().trim();
    if (!keyword) {
      continue;
    }

    if (text.includes(keyword)) {
      score += 1;
    }
  }

  return score;
}

function pickTopics(body: NormalizedBody, keywordMap: KeywordMap, rules: Rules): string[] {
  const text = normalizeSearchText(body);
  const maxTopics = clampMaxSnippets(rules.max_nve_snippets);

  return Object.entries(keywordMap)
    .map(([topic, keywords]) => ({
      topic,
      score: countKeywordHits(text, keywords),
    }))
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score || left.topic.localeCompare(right.topic))
    .slice(0, maxTopics)
    .map((item) => item.topic);
}

// ─── KV retrieval ───

export async function getSelectedSnippetsFromKv(
  env: Env,
  topics: string[],
  rules: Rules
): Promise<RetrievalResult> {
  const maxTopics = clampMaxSnippets(rules.max_nve_snippets);
  const limitedTopics = topics.slice(0, maxTopics);

  const snippets = await Promise.all(
    limitedTopics.map(async (topic) => ({
      topic,
      value: await env.REPORT_RULES.get(`nve:topic:${topic}`),
    }))
  );

  const populated = snippets
    .map((entry) => ({
      topic: entry.topic,
      value: entry.value ? entry.value.trim() : "",
    }))
    .filter((entry) => entry.value.length > 0);

  return {
    backend: "kv",
    snippetsText:
      populated.length > 0
        ? populated.map((entry) => entry.value).join("\n")
        : "- Ingen relevante NVE-utdrag valde.",
    topicsUsed: populated.map((entry) => entry.topic),
    evidenceUsed: populated.map((entry) => ({
      id: `topic:${entry.topic}`,
      source: entry.topic,
      score: null,
    })),
  };
}

// ─── AI Search retrieval ───

export function buildRetrievalQuery(body: NormalizedBody): string {
  // Primary: focused query from key structured fields (short, high-signal).
  // Fallback: full rapportutdrag if structured fields are empty.
  const queryParts = [body.hovudloysing, body.slippmetode, body.primaermaaling].filter(Boolean);
  const query = queryParts.length > 0
    ? queryParts.join(". ")
    : body.rapportutdrag ?? "";

  return query;
}

export async function runAiSearch(
  env: Env,
  body: NormalizedBody,
  rules: Rules
): Promise<RetrievalResult> {
  if (!env.AI_SEARCH_INSTANCE) {
    throw new Error("AI Search er ikkje konfigurert.");
  }

  const maxResults = parsePositiveInteger(env.AI_SEARCH_MAX_RESULTS, DEFAULT_AI_SEARCH_MAX_RESULTS);
  const maxSnippets = clampMaxSnippets(rules.max_nve_snippets);
  const scoreThreshold = parseScoreThreshold(
    env.AI_SEARCH_MATCH_THRESHOLD,
    DEFAULT_AI_SEARCH_SCORE_THRESHOLD
  );
  const enableReranking = parseBooleanFlag(env.AI_SEARCH_ENABLE_RERANKING, true);
  const enableQueryRewrite = parseBooleanFlag(env.AI_SEARCH_ENABLE_QUERY_REWRITE, false);
  const query = buildRetrievalQuery(body);
  const searchClient = env.AI ? env.AI.autorag(env.AI_SEARCH_INSTANCE) : null;

  const searchViaRest = async (currentQuery: string, threshold: number, rerankingEnabled: boolean): Promise<unknown> => {
    if (!env.AI_SEARCH_API_TOKEN || !env.AI_SEARCH_ACCOUNT_ID) {
      throw new Error("AI Search REST er ikkje konfigurert.");
    }

    const aiSearchToken = await resolveSecret(env.AI_SEARCH_API_TOKEN);
    const response = await withTimeout(
      fetch(buildAiSearchRestUrl(env), {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${aiSearchToken}`,
        },
        body: JSON.stringify(buildAiSearchRestPayload(currentQuery, maxResults, threshold, rerankingEnabled)),
      }),
      AI_SEARCH_TIMEOUT_MS,
      "AI Search svarte ikkje i tide."
    );

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(`AI Search REST svarte med feil (${response.status}).`);
    }

    assertAiSearchRestSuccess(payload);
    return payload;
  };

  const searchViaBinding = async (currentQuery: string, threshold: number, rerankingEnabled: boolean): Promise<unknown> => {
    if (!searchClient) {
      throw new Error("AI Search-binding manglar.");
    }

    try {
      return await withTimeout(
        searchClient.search({
          query: currentQuery,
          rewrite_query: enableQueryRewrite,
          max_num_results: maxResults,
          ranking_options: {
            score_threshold: threshold,
          },
          reranking: {
            enabled: rerankingEnabled,
            model: "@cf/baai/bge-reranker-base",
          },
        }),
        AI_SEARCH_TIMEOUT_MS,
        "AI Search svarte ikkje i tide."
      );
    } catch {
      return withTimeout(
        searchClient.search(buildAiSearchRestPayload(currentQuery, maxResults, threshold, rerankingEnabled)),
        AI_SEARCH_TIMEOUT_MS,
        "AI Search svarte ikkje i tide."
      );
    }
  };

  const searchAiSearch = async (currentQuery: string, threshold: number, rerankingEnabled: boolean): Promise<unknown> => {
    let lastError: Error | null = null;

    // Prøv binding fyrst — pre-autentisert, raskare, ingen ekstra token
    if (searchClient) {
      try {
        return await searchViaBinding(currentQuery, threshold, rerankingEnabled);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error("AI Search-binding feila.");
        console.error("AI Search binding feila:", error instanceof Error ? error.message : error);
      }
    }

    // REST som fallback — krev eigen AI Search API-token
    if (env.AI_SEARCH_API_TOKEN && env.AI_SEARCH_ACCOUNT_ID) {
      try {
        return await searchViaRest(currentQuery, threshold, rerankingEnabled);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error("AI Search REST feila.");
        console.error("AI Search REST feila:", error instanceof Error ? error.message : error);
      }
    }

    throw lastError ?? new Error("AI Search er ikkje konfigurert.");
  };

  let payload = await searchAiSearch(query, scoreThreshold, enableReranking);

  let candidates = toEvidenceCandidates(payload);
  if (candidates.length === 0) {
    payload = await searchAiSearch(query, 0, false);
    candidates = toEvidenceCandidates(payload);
  }

  const filtered = candidates.filter((item) => item.score === null || item.score >= scoreThreshold);
  const selected = (filtered.length > 0 ? filtered : candidates).slice(0, maxSnippets);

  return {
    backend: "ai-search",
    snippetsText:
      selected.length > 0
        ? selected.map((item, index) => formatEvidenceBlock(item, index)).join("\n\n")
        : "- Ingen relevante NVE-utdrag funne i AI Search.",
    topicsUsed: Array.from(new Set(selected.map((item) => item.source))),
    evidenceUsed: selected.map((item) => ({
      id: item.id,
      source: item.source,
      score: item.score,
    })),
  };
}

export async function retrieveEvidence(
  env: Env,
  body: NormalizedBody,
  rules: Rules,
  keywordMap: KeywordMap | null
): Promise<RetrievalResult> {
  const preferredBackend = getConfiguredRetrievalBackend(env);
  const configured = String(env.RETRIEVAL_BACKEND ?? "auto").trim().toLowerCase();

  if (preferredBackend === "ai-search") {
    try {
      const aiSearchResult = await runAiSearch(env, body, rules);
      if (aiSearchResult.evidenceUsed.length > 0 || configured === "ai-search" || !keywordMap) {
        return aiSearchResult;
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error("AI Search feila, fell tilbake til KV:", msg);
      if (configured === "ai-search" || !keywordMap) {
        throw error;
      }
    }
  }

  if (!keywordMap) {
    throw new Error("Manglar fallback-oppsett for KV-retrieval.");
  }

  const topics = pickTopics(body, keywordMap, rules);
  return getSelectedSnippetsFromKv(env, topics, rules);
}

// ─── v2 Pipeline: 4-bucket KV + AI Search hybrid ───

export function mapAnswersToBucketKeywords(body: NormalizedBody): Record<BucketPrefix, string[]> {
  const slipp = (body.slippmetodeVal || body.slippmetode || "").toLowerCase();
  const profil = (body.maleprofil || body.kontrollmaaling || "").toLowerCase();
  const is = (body.isSedimentTilstopping || "").toLowerCase();

  return {
    krav: ["oppetid", "97", "timefrekvens", "noyaktigheit", "kontrollintervall", "dokumentasjon", "sensorredundans", "rapportering"],
    metode: [
      slipp.includes("royr") || slipp.includes("ror") ? "rormaaling" : "",
      slipp.includes("luke") || slipp.includes("overloep") ? "luke_tapperoyr" : "",
      slipp.includes("elve") ? "elvemaaling" : "",
      profil.includes("vasstand") || profil.includes("naturleg") ? "vasstand_kurve" : "",
      "mengdemalar",
    ].filter(Boolean),
    valgkrit: [
      slipp.includes("royr") || slipp.includes("ror") ? "ror_vs_utvendig" : "",
      "volumtid_grense",
      profil.includes("naturleg") || profil.includes("kunstig") ? "profil" : "",
      body.slippkravvariasjon === "sesongkrav" || body.slippkravvariasjon === "tilsigsstyrt" ? "aktiv_vs_passiv" : "",
    ].filter(Boolean),
    risiko: [
      is === "ja" ? "is_frost" : "",
      is === "ja" ? "sediment_tilstopping" : "",
      "kontroll_vs_ordinaer",
      profil.includes("ingen") ? "ikkje_stabilt_profil" : "",
    ].filter(Boolean),
    drift: ["tilsyn", "vedlikehald", "kalibrering"],
  };
}

export async function getBucketedKvEvidence(
  env: Env,
  body: NormalizedBody
): Promise<BucketedEvidence> {
  const bucketKeywords = mapAnswersToBucketKeywords(body);
  const result: BucketedEvidence = {};

  // For each bucket, try to fetch matching KV entries
  const fetchPromises = BUCKET_PREFIXES.map(async (bucket) => {
    const keywords = bucketKeywords[bucket];
    if (keywords.length === 0) return;

    // Try each keyword as a KV key with bucket prefix
    const snippetPromises = keywords.slice(0, 4).map(async (keyword) => {
      const key = `nve:${bucket}:${keyword}`;
      const value = await env.REPORT_RULES.get(key);
      if (value && value.trim()) {
        return { id: key, source: keyword, text: value.trim(), score: null as number | null };
      }
      return null;
    });

    const snippets = (await Promise.all(snippetPromises)).filter(
      (s): s is NonNullable<typeof s> => s !== null
    );

    if (snippets.length > 0) {
      result[bucket] = snippets.slice(0, 2); // max 2 per bucket
    }
  });

  await Promise.all(fetchPromises);

  // Also try legacy nve:topic:* keys as fallback
  if (Object.keys(result).length < 2) {
    const searchText = normalizeSearchText(body);
    const legacyTopics = ["pipeArrangement", "pipeCalibration", "instrumentation", "stageMeasurement", "stageCurve", "downstreamControl", "reporting", "planning"];
    for (const topic of legacyTopics) {
      const value = await env.REPORT_RULES.get(`nve:topic:${topic}`);
      if (value && value.trim() && searchText.includes(topic.toLowerCase().slice(0, 5))) {
        const bucket = topic.includes("Calibration") || topic.includes("reporting") ? "krav"
          : topic.includes("Arrangement") || topic.includes("stage") ? "metode"
          : "krav";
        if (!result[bucket]) result[bucket] = [];
        if (result[bucket].length < 2) {
          result[bucket].push({ id: `nve:topic:${topic}`, source: topic, text: value.trim(), score: null });
        }
      }
    }
  }

  return result;
}

export function mergeAiSearchIntoBuckets(
  kvBuckets: BucketedEvidence,
  aiSearchCandidates: EvidenceCandidate[]
): BucketedEvidence {
  const merged = { ...kvBuckets };

  for (const candidate of aiSearchCandidates) {
    // Try to determine chunkType from metadata in source path or content
    let chunkType = "krav"; // default
    const sourceLower = candidate.source.toLowerCase();
    const textLower = candidate.text.toLowerCase().slice(0, 200);

    if (sourceLower.includes("metode") || textLower.includes("mengdemalar") || textLower.includes("maaling i royr")) {
      chunkType = "metode";
    } else if (sourceLower.includes("valgkrit") || textLower.includes("bor vel") || textLower.includes("alternativ")) {
      chunkType = "valgkrit";
    } else if (sourceLower.includes("risiko") || textLower.includes("risiko") || textLower.includes("frys") || textLower.includes("tilstopping")) {
      chunkType = "risiko";
    } else if (sourceLower.includes("drift") || textLower.includes("tilsyn") || textLower.includes("vedlikehald")) {
      chunkType = "drift";
    } else if (textLower.includes("krev") || textLower.includes("skal") || textLower.includes("97") || textLower.includes("maa")) {
      chunkType = "krav";
    }

    if (!merged[chunkType]) merged[chunkType] = [];

    // Only add if score is high enough to replace or supplement KV
    const existingCount = merged[chunkType].length;
    if (existingCount < MAX_ITEMS_PER_BUCKET || (candidate.score !== null && candidate.score > 0.5)) {
      // Check dedup — don't add if very similar text already exists
      const isDuplicate = merged[chunkType].some(
        (existing) =>
          existing.text.slice(0, DEDUP_TEXT_PREFIX_LENGTH) ===
          candidate.text.slice(0, DEDUP_TEXT_PREFIX_LENGTH)
      );
      if (!isDuplicate) {
        if (existingCount >= MAX_ITEMS_PER_BUCKET && candidate.score !== null && candidate.score > 0.5) {
          // Replace lowest-scoring existing entry
          const lowestIdx = merged[chunkType].reduce((minIdx, item, idx, arr) =>
            (item.score ?? 0) < (arr[minIdx].score ?? 0) ? idx : minIdx, 0);
          if ((merged[chunkType][lowestIdx].score ?? 0) < candidate.score) {
            merged[chunkType][lowestIdx] = { ...candidate };
          }
        } else if (existingCount < MAX_ITEMS_PER_BUCKET) {
          merged[chunkType].push({ ...candidate });
        }
      }
    }
  }

  return merged;
}

export function buildDynamicEvidenceSections(buckets: BucketedEvidence): string {
  const sections: string[] = [];

  for (const [chunkType, items] of Object.entries(buckets)) {
    if (!items || items.length === 0) continue;
    const label = BUCKET_LABELS[chunkType] ?? `${chunkType} (NVE)`;
    const content = items.map((item) => item.text).join("\n");
    sections.push(`${label}:\n${content}`);
  }

  return sections.length > 0
    ? sections.join("\n\n")
    : "- Ingen relevante NVE-utdrag funne.";
}

export function bucketedToRetrievalResult(
  buckets: BucketedEvidence,
  backend: RetrievalBackend
): RetrievalResult {
  const allItems = Object.values(buckets).flat();
  return {
    backend,
    snippetsText: buildDynamicEvidenceSections(buckets),
    topicsUsed: Array.from(new Set(allItems.map((item) => item.source))),
    evidenceUsed: allItems.map((item) => ({
      id: item.id,
      source: item.source,
      score: item.score,
    })),
  };
}

export async function retrieveStructuredEvidence(
  env: Env,
  body: NormalizedBody,
  rules: Rules,
  keywordMap: KeywordMap | null
): Promise<RetrievalResult> {
  // Step 1: Always get bucketed KV evidence (free, fast, reliable)
  const kvBuckets = await getBucketedKvEvidence(env, body);

  // Step 2: Try AI Search as boost if configured
  let mergedBuckets = kvBuckets;
  const aiSearchConfigured = env.AI && env.AI_SEARCH_INSTANCE;

  if (aiSearchConfigured) {
    try {
      const query = buildRetrievalQuery(body);
      const maxResults = parsePositiveInteger(env.AI_SEARCH_MAX_RESULTS, 6);
      const scoreThreshold = parseScoreThreshold(env.AI_SEARCH_MATCH_THRESHOLD, DEFAULT_AI_SEARCH_SCORE_THRESHOLD);
      const enableReranking = parseBooleanFlag(env.AI_SEARCH_ENABLE_RERANKING, true);
      const searchClient = env.AI!.autorag(env.AI_SEARCH_INSTANCE!);

      const searchResult = await withTimeout(
        searchClient.search({
          query,
          rewrite_query: false,
          max_num_results: maxResults,
          ranking_options: { score_threshold: scoreThreshold },
          reranking: { enabled: enableReranking },
        }),
        AI_SEARCH_TIMEOUT_MS,
        "AI Search timeout"
      );

      const candidates = toEvidenceCandidates(searchResult);
      if (candidates.length > 0) {
        mergedBuckets = mergeAiSearchIntoBuckets(kvBuckets, candidates);
        return bucketedToRetrievalResult(mergedBuckets, "hybrid");
      }
    } catch (error) {
      console.error("AI Search feila, brukar berre KV:", error instanceof Error ? error.message : error);
    }
  }

  // Step 3: If bucketed KV has results, use them
  const totalKvItems = Object.values(kvBuckets).flat().length;
  if (totalKvItems > 0) {
    return bucketedToRetrievalResult(kvBuckets, "kv");
  }

  // Step 4: Fall back to legacy KV topic matching
  if (keywordMap) {
    const topics = pickTopics(body, keywordMap, rules);
    return getSelectedSnippetsFromKv(env, topics, rules);
  }

  return {
    backend: "kv",
    snippetsText: "- Ingen relevante NVE-utdrag funne.",
    topicsUsed: [],
    evidenceUsed: [],
  };
}

// ─── Vectorize retrieval ───

export async function searchVectorize(env: Env, queryText: string, rules: Rules): Promise<EvidenceCandidate[]> {
  if (!parseBooleanFlag(env.VECTORIZE_ENABLED, false) || !env.VECTORIZE_INDEX || !env.AI) {
    return [];
  }

  const model = env.VECTORIZE_EMBEDDING_MODEL || "@cf/baai/bge-m3";
  const embeddingResult = (await env.AI.run(model, { text: [queryText] })) as {
    data?: number[][];
  };
  const vector = embeddingResult?.data?.[0];
  if (!vector || vector.length === 0) {
    return [];
  }

  const topK = Math.max(1, Math.min(10, rules.max_nve_snippets ?? DEFAULT_MAX_NVE_SNIPPETS));
  const results = await env.VECTORIZE_INDEX.query(vector, {
    topK,
    returnMetadata: "all",
    returnValues: false,
  });

  const matches = results?.matches ?? [];

  // Convert to EvidenceCandidate, with R2 fallback if metadata lacks text
  const candidates: Array<EvidenceCandidate | null> = await Promise.all(
    matches.map(async (match, index) => {
      const metaText = String(match.metadata?.text || match.metadata?.content || "").trim();

      // If the metadata contains the chunk text, use it directly
      if (metaText.length > 0) {
        return {
          id: match.id || `vectorize-${index}`,
          source: String(match.metadata?.sourceId || match.metadata?.title || "vectorize"),
          text: metaText,
          score: match.score ?? null,
        };
      }

      // Fallback: try to fetch chunk text from R2 by key
      if (env.AI_REFERENCE_BUCKET && match.id) {
        try {
          const r2Object = await env.AI_REFERENCE_BUCKET.get(match.id);
          if (r2Object) {
            const r2Text = (await r2Object.text()).trim();
            if (r2Text.length > 0) {
              return {
                id: match.id,
                source: String(match.metadata?.sourceId || match.metadata?.title || match.id),
                text: r2Text,
                score: match.score ?? null,
              };
            }
          }
        } catch (error) {
          console.error(`R2 fallback for ${match.id} feila:`, error instanceof Error ? error.message : error);
        }
      }

      // No text available — skip this match
      return null;
    })
  );

  return candidates.filter((c): c is EvidenceCandidate => c !== null && c.text.length > 0);
}

// ─── Hybrid retrieval orchestrator ───

function resolveRetrievalStrategy(env: Env): RetrievalStrategy {
  const configured = String(env.RETRIEVAL_STRATEGY ?? "auto").trim().toLowerCase();

  if (configured === "hybrid") return "hybrid";
  if (configured === "vectorize-only" || configured === "vectorize") return "vectorize-only";
  if (configured === "autorag-only" || configured === "autorag" || configured === "ai-search") return "autorag-only";
  if (configured === "kv-only" || configured === "kv") return "kv-only";

  // "auto" — pick the best available strategy based on configured bindings
  const hasVectorize = parseBooleanFlag(env.VECTORIZE_ENABLED, false) && Boolean(env.VECTORIZE_INDEX) && Boolean(env.AI);
  const hasAutoRAG = Boolean(env.AI) && Boolean(env.AI_SEARCH_INSTANCE);

  if (hasVectorize && hasAutoRAG) return "hybrid";
  if (hasVectorize) return "vectorize-only";
  if (hasAutoRAG) return "autorag-only";
  return "kv-only";
}

export async function retrieveHybridEvidence(
  env: Env,
  body: NormalizedBody,
  rules: Rules,
  keywordMap: KeywordMap | null
): Promise<HybridRetrievalResult> {
  const strategy = resolveRetrievalStrategy(env);
  const query = buildRetrievalQuery(body);
  const maxSnippets = clampMaxSnippets(rules.max_nve_snippets);

  const allCandidates: EvidenceCandidate[] = [];
  const sourceCounts = { vectorize: 0, autorag: 0, kv: 0 };

  // Determine which backends to run
  const runVectorize = strategy === "hybrid" || strategy === "vectorize-only";
  const runAutoRAG = strategy === "hybrid" || strategy === "autorag-only";
  const runKV = strategy === "kv-only";

  // Launch Vectorize and AutoRAG in parallel when both are needed
  const [vectorizeResult, autoragResult] = await Promise.all([
    runVectorize
      ? searchVectorize(env, query, rules).catch((error) => {
          console.error("Vectorize feila:", error instanceof Error ? error.message : error);
          return [] as EvidenceCandidate[];
        })
      : Promise.resolve([] as EvidenceCandidate[]),
    runAutoRAG
      ? runAiSearch(env, body, rules).catch((error) => {
          console.error("AutoRAG feila i hybrid:", error instanceof Error ? error.message : error);
          return null;
        })
      : Promise.resolve(null),
  ]);

  // Collect Vectorize candidates
  for (const candidate of vectorizeResult) {
    allCandidates.push(candidate);
    sourceCounts.vectorize++;
  }

  // Collect AutoRAG candidates
  if (autoragResult) {
    for (const evidence of autoragResult.evidenceUsed) {
      // AutoRAG evidence is already formatted — find original text from snippetsText
      // We store a simplified candidate so downstream dedup works
      allCandidates.push({
        id: evidence.id,
        source: evidence.source,
        text: "", // Will be filled from snippetsText block below
        score: evidence.score,
      });
      sourceCounts.autorag++;
    }
  }

  // KV fallback: if we have no candidates from vector backends, or strategy is kv-only
  if (runKV || (allCandidates.filter((c) => c.text.length > 0).length === 0 && keywordMap)) {
    const topics = keywordMap ? pickTopics(body, keywordMap, rules) : [];
    if (topics.length > 0) {
      const kvResult = await getSelectedSnippetsFromKv(env, topics, rules);
      for (const evidence of kvResult.evidenceUsed) {
        allCandidates.push({
          id: evidence.id,
          source: evidence.source,
          text: "", // KV snippets go into snippetsText block
          score: evidence.score,
        });
        sourceCounts.kv++;
      }

      // If KV is our primary/only source, use its formatted text directly
      if (runKV || allCandidates.filter((c) => c.text.length > 0).length === 0) {
        return {
          strategy,
          snippetsText: kvResult.snippetsText,
          topicsUsed: kvResult.topicsUsed,
          evidenceUsed: kvResult.evidenceUsed,
          sources: sourceCounts,
        };
      }
    }
  }

  // Deduplicate candidates by source, preferring higher scores
  const seen = new Map<string, EvidenceCandidate>();
  for (const candidate of allCandidates) {
    if (candidate.text.length === 0) continue; // Skip empty-text placeholders

    const key = candidate.source.toLowerCase();
    const existing = seen.get(key);
    if (!existing || (candidate.score ?? 0) > (existing.score ?? 0)) {
      seen.set(key, candidate);
    }
  }

  // Sort by score descending, then pick top N
  const deduped = Array.from(seen.values())
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .slice(0, maxSnippets);

  // If hybrid produced real Vectorize candidates with text, format them
  if (deduped.length > 0) {
    const snippetsText = deduped
      .map((item, index) => formatEvidenceBlock(item, index))
      .join("\n\n");

    return {
      strategy,
      snippetsText,
      topicsUsed: Array.from(new Set(deduped.map((c) => c.source))),
      evidenceUsed: deduped.map((c) => ({
        id: c.id,
        source: c.source,
        score: c.score,
      })),
      sources: sourceCounts,
    };
  }

  // Fallback: if AutoRAG returned results but Vectorize didn't, use AutoRAG text
  if (autoragResult && autoragResult.evidenceUsed.length > 0) {
    return {
      strategy,
      snippetsText: autoragResult.snippetsText,
      topicsUsed: autoragResult.topicsUsed,
      evidenceUsed: autoragResult.evidenceUsed,
      sources: sourceCounts,
    };
  }

  // Nothing found anywhere
  return {
    strategy,
    snippetsText: "- Ingen relevante NVE-utdrag funne.",
    topicsUsed: [],
    evidenceUsed: [],
    sources: sourceCounts,
  };
}
