import {
  DEFAULT_MAX_NVE_SNIPPETS,
  DEFAULT_AI_GATEWAY_RETRY_BACKOFF,
  METADATA_TEXT_MAX_LENGTH,
} from "./types.js";

const WHITESPACE_RE = /\s+/g;
const NON_WHITESPACE_RE = /\S+/g;
const SPLIT_WHITESPACE_RE = /\s+/;
const TRAILING_PUNCT_RE = /[,:;/-]+$/g;
const TERMINAL_PUNCT_RE = /[.!?]$/;
const TEMPLATE_TOKEN_RE = /\{\{(\w+)\}\}/g;

export function clampMaxSnippets(value: number | undefined): number {
  return Math.max(1, Math.min(8, value ?? DEFAULT_MAX_NVE_SNIPPETS));
}

export function buildMetadataRecord({
  sourceId,
  title,
  section,
  metadata,
  text,
}: {
  sourceId?: string;
  title?: string;
  section?: string;
  metadata?: Record<string, string | number>;
  text?: string;
}): Record<string, string> {
  const record: Record<string, string> = {};

  if (sourceId) record.sourceId = sourceId;
  if (title) record.title = title;
  if (section) record.section = section;

  if (metadata) {
    for (const [key, value] of Object.entries(metadata)) {
      if (value !== undefined && value !== null && value !== "") {
        record[key] = String(value);
      }
    }
  }

  if (text) {
    record.text = text.slice(0, METADATA_TEXT_MAX_LENGTH);
  }

  return record;
}

export function toCleanText(value: unknown, maxLength = 4000): string {
  if (typeof value !== "string") {
    return "";
  }

  return value.replace(WHITESPACE_RE, " ").trim().slice(0, maxLength);
}

export function toFiniteNumber(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function toStringArray(value: unknown, maxItems = 25, maxLength = 300): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .slice(0, maxItems)
    .map((item) => toCleanText(item, maxLength))
    .filter(Boolean);
}

export function parsePositiveInteger(value: string | undefined, fallbackValue: number): number {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallbackValue;
}

export function parseScoreThreshold(value: string | undefined, fallbackValue: number): number {
  const parsed = Number.parseFloat(String(value ?? ""));
  if (!Number.isFinite(parsed)) {
    return fallbackValue;
  }

  return Math.min(1, Math.max(0, parsed));
}

export function parseBooleanFlag(value: string | undefined, fallbackValue: boolean): boolean {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }

  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }

  return fallbackValue;
}

export function parseRetryBackoff(value: string | undefined): string {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "constant" || normalized === "linear" || normalized === "exponential") {
    return normalized;
  }

  return DEFAULT_AI_GATEWAY_RETRY_BACKOFF;
}

export function formatNumber(value: number | null, suffix: string): string {
  if (value === null) {
    return "";
  }

  return `${new Intl.NumberFormat("nn-NO", { maximumFractionDigits: 2 }).format(value)} ${suffix}`;
}

export function countWords(text: string): number {
  const words = text.trim().match(NON_WHITESPACE_RE);
  return words ? words.length : 0;
}

export function truncateToWordLimit(text: string, maxWords: number): string {
  const words = text.trim().split(SPLIT_WHITESPACE_RE).slice(0, maxWords);
  if (words.length === 0) {
    return "";
  }

  const joined = words.join(" ").replace(TRAILING_PUNCT_RE, "").trim();
  return TERMINAL_PUNCT_RE.test(joined) ? joined : `${joined}.`;
}

export function fillTemplate(template: string, values: Record<string, string>): string {
  return template.replace(TEMPLATE_TOKEN_RE, (_, key: string) => values[key] ?? "");
}
