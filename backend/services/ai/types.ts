export interface KVNamespaceLike {
  get(key: string): Promise<string | null>;
  get<T = unknown>(key: string, type: "json"): Promise<T | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<unknown>;
}

export interface AiSearchRunnerLike {
  search(payload: unknown): Promise<unknown>;
}

export interface AiNamespaceLike {
  autorag(instanceName: string): AiSearchRunnerLike;
  run(model: string, payload: unknown): Promise<unknown>;
}

export interface VectorizeIndex {
  query(vector: number[], options?: { topK?: number; filter?: Record<string, unknown>; returnMetadata?: string; returnValues?: boolean }): Promise<VectorizeMatches>;
  upsert(vectors: VectorizeVector[]): Promise<unknown>;
}

export interface VectorizeMatches {
  matches: VectorizeMatch[];
  count: number;
}

export interface VectorizeMatch {
  id: string;
  score: number;
  metadata?: Record<string, unknown>;
  values?: number[];
}

export interface VectorizeVector {
  id: string;
  values: number[];
  metadata?: Record<string, unknown>;
}

export interface R2Bucket {
  get(key: string): Promise<R2Object | null>;
  put(key: string, value: string | ReadableStream | ArrayBuffer, options?: { httpMetadata?: { contentType?: string }; customMetadata?: Record<string, string> }): Promise<unknown>;
  delete(key: string): Promise<void>;
  head(key: string): Promise<{ key: string; size: number; customMetadata?: Record<string, string> } | null>;
  list(options?: { prefix?: string; limit?: number }): Promise<R2ObjectList>;
}

export interface R2Object {
  key: string;
  body: ReadableStream;
  text(): Promise<string>;
}

export interface R2ObjectList {
  objects: { key: string }[];
  truncated: boolean;
}

export interface SecretStoreBinding {
  get(): Promise<string>;
}

export interface Env {
  REPORT_RULES: KVNamespaceLike;
  REPORT_WORKER_TOKEN?: string | SecretStoreBinding;
  AI_SEARCH_API_TOKEN?: string | SecretStoreBinding;
  AI_GATEWAY_AUTH_TOKEN?: string | SecretStoreBinding;
  OPENAI_MODEL?: string;
  OPENAI_MODEL_PRIMARY?: string;
  OPENAI_MODEL_FALLBACK?: string;
  ALLOWED_ORIGINS?: string;
  RETRIEVAL_BACKEND?: string;
  AI_SEARCH_ACCOUNT_ID?: string;
  AI_SEARCH_INSTANCE?: string;
  AI_SEARCH_MAX_RESULTS?: string;
  AI_SEARCH_MATCH_THRESHOLD?: string;
  AI_SEARCH_ENABLE_RERANKING?: string;
  AI_SEARCH_ENABLE_QUERY_REWRITE?: string;
  AI_GATEWAY_ENABLED?: string;
  AI_GATEWAY_ACCOUNT_ID?: string;
  AI_GATEWAY_ID?: string;
  AI_GATEWAY_CACHE_TTL?: string;
  AI_GATEWAY_REQUEST_TIMEOUT_MS?: string;
  AI_GATEWAY_MAX_ATTEMPTS?: string;
  AI_GATEWAY_RETRY_DELAY_MS?: string;
  AI_GATEWAY_RETRY_BACKOFF?: string;
  AI?: AiNamespaceLike;
  VECTORIZE_INDEX?: VectorizeIndex;
  AI_REFERENCE_BUCKET?: R2Bucket;
  RETRIEVAL_STRATEGY?: string;
  NARRATIVE_MODE?: string;
  NARRATIVE_MAX_WORDS?: string;
  NARRATIVE_MAX_SENTENCES?: string;
  SELF_FEEDBACK_ENABLED?: string;
  SELF_FEEDBACK_MODEL?: string;
  SELF_FEEDBACK_REGENERATE?: string;
  USER_FEEDBACK_ENABLED?: string;
  VECTORIZE_ENABLED?: string;
  VECTORIZE_EMBEDDING_MODEL?: string;
}

export type Rules = {
  max_input_tokens_target?: number;
  max_input_tokens_hard?: number;
  max_output_tokens?: number;
  max_words?: number;
  target_words_min?: number;
  target_words_max?: number;
  max_nve_references?: number;
  max_nve_snippets?: number;
  max_sentences?: number;
  style?: string;
  primary_source?: string;
  secondary_sources?: string[];
  allow_new_topics?: boolean;
  allow_independent_assessment?: boolean;
  allow_side_topics?: boolean;
  side_topics_blocklist?: string[];
  forbidden_phrases_without_explanation?: string[];
};

export type KeywordMap = Record<string, string[]>;

export type RetrievalBackend = "kv" | "ai-search" | "vectorize" | "hybrid";

export type EvidenceUsed = {
  id: string;
  source: string;
  score: number | null;
};

export type RetrievalResult = {
  backend: RetrievalBackend;
  snippetsText: string;
  topicsUsed: string[];
  evidenceUsed: EvidenceUsed[];
};

export type GenerationResult = {
  text: string;
  model: string;
  source: string;
  gatewayUsed: boolean;
  fallbackStep: number;
};

export type NormalizedBody = {
  prosjekt: string;
  prosjektbeskrivelse: string;
  rapportutdrag: string;
  lokasjon: string;
  anleggstype: string;
  hydrologi: string;
  hovudloysing: string;
  slippmetode: string;
  primaermaaling: string;
  kontrollmaaling: string;
  maleprinsipp: string;
  maleutstyr: string;
  loggeroppsett: string;
  reserveLogger: string;
  kommunikasjon: string;
  alarmVarsling: string;
  reservekjelde: string;
  reserveEnergikjelde: string;
  primaerEnergikjelde: string;
  reserveeffektW: number | null;
  batteribankAh: number | null;
  autonomiDagar: number | null;
  istilpassing: string;
  frostsikring: string;
  bypass: string;
  arsproduksjonSolKWh: number | null;
  arslastKWh: number | null;
  arsbalanseKWh: number | null;
  solproduksjonPerArKWh: number | null;
  lastPerArKWh: number | null;
  energibalansePerArKWh: number | null;
  grunngiving: string[];
  tilleggskrav: string[];
  driftskrav: string[];
  // v2 structured answer fields
  slippkravvariasjon: string;
  slippmetodeVal: string;
  isSedimentTilstopping: string;
  fiskepassasje: string;
  bypassVedDriftsstans: string;
  maleprofil: string;
  allmentaKontroll: string;
  action?: string;
};

export type BucketedEvidence = {
  [chunkType: string]: Array<{ id: string; source: string; text: string; score: number | null }>;
};

export type OpenAIResponsePayload = {
  output_text?: string;
  output?: unknown;
  choices?: Array<{
    message?: {
      content?: unknown;
    };
  }>;
};

export type EvidenceCandidate = {
  id: string;
  source: string;
  text: string;
  score: number | null;
};

export const DEFAULT_MODEL_PRIMARY = "gpt-5.1";
export const DEFAULT_MODEL_FALLBACK = "gpt-5.4-mini";
export const DEFAULT_MAX_OUTPUT_TOKENS = 350;
export const DEFAULT_MAX_WORDS = 90;
export const DEFAULT_MAX_SENTENCES = 4;
export const DEFAULT_MAX_NVE_SNIPPETS = 4;
export const DEFAULT_INPUT_TOKEN_HARD = 4000;
export const DEFAULT_AI_SEARCH_MAX_RESULTS = 10;
export const DEFAULT_AI_SEARCH_SCORE_THRESHOLD = 0.35;
export const DEFAULT_AI_GATEWAY_CACHE_TTL = 3600;
export const DEFAULT_AI_GATEWAY_REQUEST_TIMEOUT_MS = 8000;
export const DEFAULT_AI_GATEWAY_MAX_ATTEMPTS = 3;
export const DEFAULT_AI_GATEWAY_RETRY_DELAY_MS = 500;
export const DEFAULT_AI_GATEWAY_RETRY_BACKOFF = "exponential";
export const APPROX_CHARS_PER_TOKEN = 4;
export const AI_SEARCH_TIMEOUT_MS = 10000;
export const DEFAULT_FIELD_MAX_LENGTH = 250;
export const MAX_ITEMS_PER_BUCKET = 2;
export const DEDUP_TEXT_PREFIX_LENGTH = 80;
export const METADATA_TEXT_MAX_LENGTH = 1000;
