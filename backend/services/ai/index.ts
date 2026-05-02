import type { Env, Rules, KeywordMap } from "./types.js";
import { buildMetadataRecord, parseBooleanFlag, fillTemplate } from "./utils.js";
import { constantTimeEquals, resolveSecret, buildCorsHeaders, jsonResponse } from "./auth.js";
import { retrieveStructuredEvidence } from "./retrieval.js";
import {
  normalizeBody,
  buildDocumentedProjectDataText,
  buildSupplementaryProjectDataText,
  clampPromptSize,
  generateWithFallback,
  runSelfFeedback,
  handleUserFeedback,
} from "./generation.js";
import type { SelfFeedbackResult } from "./generation.js";

export type { Env };

const GENERATION_RATE_LIMIT = 20;
const GENERATION_RATE_WINDOW_MS = 60_000;
const generationBuckets = new Map<string, number[]>();

function checkGenerationRateLimit(request: Request): { allowed: boolean; retryAfterSeconds: number } {
  const ip = request.headers.get("cf-connecting-ip")?.trim()
    || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || "unknown";
  const now = Date.now();
  const threshold = now - GENERATION_RATE_WINDOW_MS;
  const bucket = (generationBuckets.get(ip) ?? []).filter((ts) => ts > threshold);

  if (bucket.length >= GENERATION_RATE_LIMIT) {
    generationBuckets.set(ip, bucket);
    return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((bucket[0] + GENERATION_RATE_WINDOW_MS - now) / 1000)) };
  }

  bucket.push(now);
  generationBuckets.set(ip, bucket);

  // Prevent unbounded growth under active attack (Memory Leak DoS protection)
  if (generationBuckets.size > 10000) {
    generationBuckets.clear();
  }

  return { allowed: true, retryAfterSeconds: 0 };
}

const R2_KEY_PATTERN = /^[a-zA-Z0-9._\-/]+$/;

function validateR2Key(key: string): boolean {
  return typeof key === "string" && key.length > 0 && key.length <= 1024
    && R2_KEY_PATTERN.test(key) && !key.includes("..") && !key.startsWith("/");
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const corsHeaders = buildCorsHeaders(request, env);

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders,
      });
    }

    try {
      const url = new URL(request.url);

      // --- Auth gate: admin/management routes require WORKER_API_KEY ---
      const adminPaths = new Set(["/upload", "/list", "/batch-embed", "/delete-prefix"]);
      if (adminPaths.has(url.pathname)) {
        if (!env.WORKER_API_KEY) {
          return jsonResponse({ error: "Admin routes require WORKER_API_KEY." }, 503, corsHeaders);
        }
        const authHeader = request.headers.get("authorization") ?? "";
        const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
        const expectedKey = (await resolveSecret(env.WORKER_API_KEY))?.trim();
        if (!expectedKey || !constantTimeEquals(token, expectedKey)) {
          return jsonResponse({ error: "Ugyldig eller manglande API-nøkkel." }, 401, corsHeaders);
        }
      }

      // --- R2 upload route (for corpus management) ---
      if (url.pathname === "/upload" && request.method === "POST" && env.R2_BUCKET) {
        const declaredLength = parseInt(request.headers.get("content-length") || "0", 10);
        if (declaredLength > 65536) {
          return jsonResponse({ error: "Request body too large." }, 413, corsHeaders);
        }
        const text = await request.text();
        if (new TextEncoder().encode(text).length > 65536) {
          return jsonResponse({ error: "Request body too large." }, 413, corsHeaders);
        }
        const body = JSON.parse(text) as {
          key: string;
          text: string;
          metadata?: Record<string, string | number>;
        };
        if (!validateR2Key(body.key)) {
          return jsonResponse({ error: "Invalid R2 key." }, 400, corsHeaders);
        }
        const meta = buildMetadataRecord({ metadata: body.metadata });
        // Embed via Workers AI
        let embedding: number[] | null = null;
        if (env.AI) {
          const model = env.VECTORIZE_EMBEDDING_MODEL || "@cf/baai/bge-m3";
          const embResult = await env.AI.run(model, { text: [body.text] }) as { data: number[][] };
          embedding = embResult?.data?.[0] ?? null;
        }

        // Store as JSON with text + embedding + metadata
        const payload = JSON.stringify({
          id: body.key,
          metadata: body.metadata || {},
          text: body.text,
          embedding: embedding,
        });
        await env.R2_BUCKET.put(body.key, payload, {
          httpMetadata: { contentType: "application/json; charset=utf-8" },
          customMetadata: meta,
        });

        // Upsert to Vectorize
        let vectorized = false;
        if (embedding && env.VECTORIZE_INDEX && parseBooleanFlag(env.VECTORIZE_ENABLED, false)) {
          try {
            await env.VECTORIZE_INDEX.upsert([{
              id: body.key,
              values: embedding,
              metadata: buildMetadataRecord({ metadata: body.metadata, text: body.text }),
            }]);
            vectorized = true;
          } catch (e: any) {
            console.error("Vectorize upsert failed:", e.message);
          }
        }

        const head = await env.R2_BUCKET.head(body.key);
        return jsonResponse({ ok: true, key: body.key, size: head?.size, customMetadata: head?.customMetadata, vectorized, dims: embedding?.length }, 200, corsHeaders);
      }

      // --- R2 list route ---
      if (url.pathname === "/list" && request.method === "GET" && env.R2_BUCKET) {
        const prefix = url.searchParams.get("prefix") || "";
        if (prefix && !validateR2Key(prefix)) {
          return jsonResponse({ error: "Invalid prefix." }, 400, corsHeaders);
        }
        const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit") || "50"), 1), 200);
        const listed = await env.R2_BUCKET.list({ prefix, limit });
        return jsonResponse({ count: listed.objects.length, truncated: listed.truncated, objects: listed.objects }, 200, corsHeaders);
      }

      // --- Batch embed + upload route ---
      if (url.pathname === "/batch-embed" && request.method === "POST" && env.R2_BUCKET && env.AI) {
        const declaredLength = parseInt(request.headers.get("content-length") || "0", 10);
        if (declaredLength > 524288) {
          return jsonResponse({ error: "Request body too large." }, 413, corsHeaders);
        }
        const text = await request.text();
        if (new TextEncoder().encode(text).length > 524288) {
          return jsonResponse({ error: "Request body too large." }, 413, corsHeaders);
        }
        const body = JSON.parse(text) as {
          chunks: Array<{
            id: string;
            text: string;
            sourceId?: string;
            title?: string;
            section?: string;
            metadata?: Record<string, string | number>;
          }>;
          prefix?: string;
        };
        if (!body.chunks || !Array.isArray(body.chunks) || body.chunks.length === 0) {
          return jsonResponse({ error: "chunks array required" }, 400, corsHeaders);
        }
        if (body.chunks.length > 50) {
          return jsonResponse({ error: "max 50 chunks per batch" }, 400, corsHeaders);
        }
        const prefix = body.prefix || "nve-search/";
        if (!validateR2Key(prefix)) {
          return jsonResponse({ error: "Invalid prefix." }, 400, corsHeaders);
        }
        for (const chunk of body.chunks) {
          if (!chunk.id || !validateR2Key(chunk.id)) {
            return jsonResponse({ error: `Invalid chunk id: ${chunk.id}` }, 400, corsHeaders);
          }
        }
        const model = env.VECTORIZE_EMBEDDING_MODEL || "@cf/baai/bge-m3";

        // Embed all texts in one call
        const texts = body.chunks.map(c => c.text);
        const embResult = await env.AI.run(model, { text: texts }) as { data: number[][] };
        if (!embResult?.data || embResult.data.length !== texts.length) {
          return jsonResponse({ error: "embedding failed" }, 500, corsHeaders);
        }

        // Store each chunk as JSON in R2 with text + embedding + metadata
        const results: Array<{ id: string; ok: boolean; key: string; size?: number }> = [];
        const putPromises = body.chunks.map(async (chunk, i) => {
          // Build R2 custom metadata from all available fields
          const meta = buildMetadataRecord({
            sourceId: chunk.sourceId,
            title: chunk.title,
            section: chunk.section,
            metadata: chunk.metadata,
          });
          const payload = JSON.stringify({
            id: chunk.id,
            sourceId: chunk.sourceId || "",
            title: chunk.title || "",
            section: chunk.section || "",
            metadata: chunk.metadata || {},
            text: chunk.text,
            embedding: embResult.data[i],
          });
          const key = `${prefix}${chunk.id}.json`;
          await env.R2_BUCKET!.put(key, payload, {
            httpMetadata: { contentType: "application/json; charset=utf-8" },
            customMetadata: meta,
          });
          const head = await env.R2_BUCKET!.head(key);
          results.push({ id: chunk.id, ok: true, key, size: head?.size });
        });
        await Promise.all(putPromises);

        // Upsert all embeddings to Vectorize
        let vectorized = 0;
        if (env.VECTORIZE_INDEX && parseBooleanFlag(env.VECTORIZE_ENABLED, false)) {
          try {
            const vectors = body.chunks.map((chunk, i) => {
              return {
                id: `${prefix}${chunk.id}.json`,
                values: embResult.data[i],
                metadata: buildMetadataRecord({
                  sourceId: chunk.sourceId,
                  title: chunk.title,
                  section: chunk.section,
                  metadata: chunk.metadata,
                  text: chunk.text,
                }),
              };
            });
            await env.VECTORIZE_INDEX.upsert(vectors);
            vectorized = vectors.length;
          } catch (e: any) {
            console.error("Vectorize batch upsert failed:", e.message);
          }
        }

        return jsonResponse({
          ok: true,
          embedded: results.length,
          vectorized,
          dims: embResult.data[0]?.length,
          results,
        }, 200, corsHeaders);
      }

      // --- Delete by prefix route ---
      if (url.pathname === "/delete-prefix" && request.method === "POST" && env.R2_BUCKET) {
        const declaredLength = parseInt(request.headers.get("content-length") || "0", 10);
        if (declaredLength > 1024) {
          return jsonResponse({ error: "Request body too large." }, 413, corsHeaders);
        }
        const text = await request.text();
        if (new TextEncoder().encode(text).length > 1024) {
          return jsonResponse({ error: "Request body too large." }, 413, corsHeaders);
        }
        const body = JSON.parse(text) as { prefix: string };
        if (!body.prefix || !validateR2Key(body.prefix)) {
          return jsonResponse({ error: "Invalid or missing prefix." }, 400, corsHeaders);
        }
        let deleted = 0;
        let truncated = true;
        while (truncated) {
          const listed = await env.R2_BUCKET.list({ prefix: body.prefix, limit: 100 });
          if (listed.objects.length === 0) break;
          const delPromises = listed.objects.map(async (obj: { key: string }) => {
            await (env.R2_BUCKET as any).delete(obj.key);
            deleted++;
          });
          await Promise.all(delPromises);
          truncated = listed.truncated;
        }
        return jsonResponse({ ok: true, deleted }, 200, corsHeaders);
      }

      if (request.method !== "POST") {
        return jsonResponse({ error: "Method not allowed. Use POST." }, 405, corsHeaders);
      }

      const reqUrl = new URL(request.url);
      const isServiceBinding = reqUrl.hostname === "worker.internal";
      if (!isServiceBinding) {
        const rl = checkGenerationRateLimit(request);
        if (!rl.allowed) {
          return jsonResponse(
            { error: "For mange førespurnader. Prøv igjen seinare." },
            429,
            { ...corsHeaders, "retry-after": String(rl.retryAfterSeconds) },
          );
        }
      }

      if (!env.WORKER_API_KEY) {
        return jsonResponse({ error: "Tenesta er ikkje konfigurert." }, 503, corsHeaders);
      }
      if (!isServiceBinding) {
        const authHeader = request.headers.get("authorization") ?? "";
        const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
        const expectedKey = (await resolveSecret(env.WORKER_API_KEY))?.trim();
        if (!expectedKey || !constantTimeEquals(token, expectedKey)) {
          return jsonResponse({ error: "Ugyldig eller manglande API-nøkkel." }, 401, corsHeaders);
        }
      }

      const [systemPrompt, userTemplate, rules, keywordMap, narrativeSystemPrompt, narrativeUserTemplate] = await Promise.all([
        env.PROMPT_KV.get("prompt:system:v1"),
        env.PROMPT_KV.get("prompt:user_template:v1"),
        env.PROMPT_KV.get("rules:ai:v1", "json") as Promise<Rules | null>,
        env.PROMPT_KV.get("mapping:keywords:v1", "json") as Promise<KeywordMap | null>,
        env.PROMPT_KV.get("prompt:system:narrative:v1"),
        env.PROMPT_KV.get("prompt:user_template:narrative:v1"),
      ]);

      if (!systemPrompt || !userTemplate || !rules) {
        return jsonResponse(
          {
            error:
              "Manglar KV-oppsett. Sjekk prompt:system:v1, prompt:user_template:v1 og rules:ai:v1.",
          },
          500,
          corsHeaders
        );
      }

      // --- Narrative mode selection ---
      const narrativeMode = env.NARRATIVE_MODE ?? 'supplement';
      const isNarrative = narrativeMode === 'full' || narrativeMode === 'narrative';
      const activeSystemPrompt = isNarrative ? narrativeSystemPrompt ?? systemPrompt : systemPrompt;
      const activeUserTemplate = isNarrative ? narrativeUserTemplate ?? userTemplate : userTemplate;

      // Override word/sentence limits when narrative mode is active
      const effectiveRules: Rules = isNarrative
        ? {
            ...rules,
            max_words: parseInt(env.NARRATIVE_MAX_WORDS ?? '250'),
            max_sentences: parseInt(env.NARRATIVE_MAX_SENTENCES ?? '10'),
          }
        : rules;

      const rawBody = await request.json().catch(() => null);
      if (!rawBody || typeof rawBody !== "object") {
        return jsonResponse({ error: "Ugyldig JSON-body." }, 400, corsHeaders);
      }

      if ((rawBody as Record<string, unknown>).action === "feedback") {
        return handleUserFeedback(env, rawBody as Record<string, unknown>, corsHeaders);
      }

      const body = normalizeBody(rawBody);
      if (!body) {
        return jsonResponse({ error: "Ugyldig JSON-body." }, 400, corsHeaders);
      }

      if (!body.rapportutdrag) {
        return jsonResponse({ error: "rapportutdrag manglar." }, 400, corsHeaders);
      }

      const documentedProjectDataText = buildDocumentedProjectDataText(body);
      const supplementaryProjectDataText = buildSupplementaryProjectDataText(body);
      const retrieval = await retrieveStructuredEvidence(env, body, effectiveRules, keywordMap);

      const clamped = clampPromptSize(
        body,
        activeUserTemplate,
        documentedProjectDataText,
        supplementaryProjectDataText,
        retrieval.snippetsText,
        effectiveRules
      );

      const userPrompt = fillTemplate(activeUserTemplate, {
        prosjekt: body.prosjekt || "Uoppgitt",
        prosjektbeskrivelse: clamped.prosjektbeskrivelse,
        documented_project_data: clamped.documented_project_data,
        supplementary_project_data: clamped.supplementary_project_data,
        rapportutdrag: clamped.rapportutdrag,
        nve_snippets: clamped.nve_snippets,
      });

      let result = await generateWithFallback(env, activeSystemPrompt, userPrompt, effectiveRules);

      // Self-feedback: evaluate and optionally regenerate
      let selfFeedback: SelfFeedbackResult | undefined;
      if (parseBooleanFlag(env.SELF_FEEDBACK_ENABLED, false)) {
        selfFeedback = await runSelfFeedback(
          env, result.text, retrieval.snippetsText, body, effectiveRules
        );

        // Regenerate once if score <= 2 and regeneration is enabled
        if (
          selfFeedback.score <= 2 &&
          parseBooleanFlag(env.SELF_FEEDBACK_REGENERATE, false)
        ) {
          const retry = await generateWithFallback(env, activeSystemPrompt, userPrompt, effectiveRules);
          if (retry.text) {
            result = retry;
            selfFeedback.regenerated = true;
          }
        }
      }

      // Generate feedback token for user feedback
      const feedbackToken = parseBooleanFlag(env.USER_FEEDBACK_ENABLED, false)
        ? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
        : undefined;

      return jsonResponse(
        {
          text: result.text,
          source: result.source,
          model: result.model,
          gateway_used: result.gatewayUsed,
          fallback_step: result.fallbackStep,
          narrative_mode: narrativeMode,
          retrieval_backend: retrieval.strategy,
          topics_used: retrieval.topicsUsed,
          evidence_used: retrieval.evidenceUsed,
          retrieval_sources: retrieval.sources,
          ...(selfFeedback ? { self_feedback: selfFeedback } : {}),
          ...(feedbackToken ? { feedback_token: feedbackToken, feedback_enabled: true } : {}),
        },
        200,
        corsHeaders
      );
    } catch (error) {
      console.error("Generation failed:", error instanceof Error ? error.message : error);

      return jsonResponse(
        {
          error: "Generering feila. Prøv igjen seinare.",
        },
        502,
        corsHeaders
      );
    }
  },
};
