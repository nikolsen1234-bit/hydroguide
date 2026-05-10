import { randomUUID, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";
import { pathToFileURL } from "node:url";
import { defaultConfig, generateReport } from "./lib/pipeline.mjs";

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 8788;
const MAX_BODY_BYTES = 64 * 1024;
const DEFAULT_MAX_QUEUE_DEPTH = 4;

function jsonResponse(res, status, payload, headers = {}) {
  try {
    if (res.destroyed || res.writableEnded) {
      return;
    }

    const body = `${JSON.stringify(payload)}\n`;
    res.writeHead(status, {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      ...headers
    });
    res.end(body);
  } catch (error) {
    console.warn(JSON.stringify({
      status: "response-write-failed",
      error: error instanceof Error ? error.message : "unknown"
    }));
  }
}

function readBearerToken(req) {
  const value = String(req.headers.authorization ?? "").trim();
  return value.toLowerCase().startsWith("bearer ") ? value.slice(7).trim() : "";
}

export function constantTimeEquals(left, right) {
  const leftBuffer = Buffer.from(String(left ?? ""));
  const rightBuffer = Buffer.from(String(right ?? ""));
  if (leftBuffer.length !== rightBuffer.length || leftBuffer.length === 0) {
    return false;
  }
  return timingSafeEqual(leftBuffer, rightBuffer);
}

async function readJsonBody(req) {
  let received = 0;
  const chunks = [];
  for await (const chunk of req) {
    received += chunk.byteLength;
    if (received > MAX_BODY_BYTES) {
      throw new Error("Request body is too large.");
    }
    chunks.push(chunk);
  }

  if (received === 0) {
    throw new Error("Request body is empty.");
  }

  const text = Buffer.concat(chunks).toString("utf8");
  const payload = JSON.parse(text);
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("Request body must be a JSON object.");
  }
  return payload;
}

export function createBridgeHandler(options = {}) {
  const config = defaultConfig(options.config ?? {});
  const expectedToken = String(options.bridgeToken ?? process.env.REPORT_BRIDGE_TOKEN ?? "").trim();
  const fetchImpl = options.fetchImpl ?? fetch;
  const maxQueueDepth = Number.parseInt(String(options.maxQueueDepth ?? process.env.REPORT_BRIDGE_MAX_QUEUE_DEPTH ?? ""), 10) || DEFAULT_MAX_QUEUE_DEPTH;
  const state = {
    queueDepth: 0,
    queueTail: Promise.resolve()
  };

  return async function handle(req, res) {
    req.on("error", (error) => {
      console.warn(JSON.stringify({
        status: "request-stream-error",
        error: error instanceof Error ? error.message : "unknown"
      }));
    });
    res.on("error", (error) => {
      console.warn(JSON.stringify({
        status: "response-stream-error",
        error: error instanceof Error ? error.message : "unknown"
      }));
    });

    let requestUrl;
    try {
      requestUrl = new URL(req.url ?? "/", `http://${req.headers.host ?? "127.0.0.1"}`);
    } catch {
      jsonResponse(res, 400, { error: "Ugyldig URL." });
      return;
    }

    if (req.method === "GET" && requestUrl.pathname === "/health") {
      jsonResponse(res, 200, { ok: true });
      return;
    }

    if (req.method !== "POST" || requestUrl.pathname !== "/report") {
      jsonResponse(res, 404, { error: "Not found." });
      return;
    }

    if (!expectedToken) {
      jsonResponse(res, 503, { error: "REPORT_BRIDGE_TOKEN is not configured." });
      return;
    }

    if (!constantTimeEquals(readBearerToken(req), expectedToken)) {
      jsonResponse(res, 401, { error: "Unauthorized." });
      return;
    }

    if (state.queueDepth >= maxQueueDepth) {
      jsonResponse(res, 429, { error: "Rapportagenten er opptatt. Prøv igjen om litt." }, { "retry-after": "20" });
      return;
    }

    let payload;
    try {
      payload = await readJsonBody(req);
    } catch {
      jsonResponse(res, 400, { error: "Ugyldig JSON-body." });
      return;
    }

    const requestId = String(payload.requestId ?? req.headers["x-hydroguide-request-id"] ?? randomUUID());
    const report = payload.report && typeof payload.report === "object" ? payload.report : payload;
    const previousTail = state.queueTail.catch(() => {});
    let releaseQueueSlot;
    state.queueTail = previousTail.then(() => new Promise((resolveQueueSlot) => {
      releaseQueueSlot = resolveQueueSlot;
    }));
    state.queueDepth += 1;

    await previousTail;
    const startedAt = Date.now();
    try {
      const result = await generateReport(report, { config, fetchImpl });
      const elapsedMs = Date.now() - startedAt;
      if (!result.ok) {
        console.warn(JSON.stringify({ requestId, status: result.status, elapsedMs, error: result.error }));
        jsonResponse(res, result.status, { requestId, error: result.error, validation_errors: result.validation_errors });
        return;
      }

      console.info(JSON.stringify({
        requestId,
        status: 200,
        elapsedMs,
        model: result.body.model,
        retrieval_backend: result.body.retrieval_backend,
        evidence_ids: result.body.evidence_used.map((item) => item.id)
      }));
      jsonResponse(res, 200, { requestId, ...result.body });
    } catch (error) {
      const elapsedMs = Date.now() - startedAt;
      console.warn(JSON.stringify({
        requestId,
        status: 502,
        elapsedMs,
        error: error instanceof Error ? error.message : "unknown"
      }));
      jsonResponse(res, 502, { requestId, error: "Klarte ikke generere rapporttekst." });
    } finally {
      state.queueDepth -= 1;
      releaseQueueSlot?.();
    }
  };
}

export function startServer(options = {}) {
  const host = options.host ?? process.env.REPORT_BRIDGE_HOST ?? DEFAULT_HOST;
  const port = Number.parseInt(String(options.port ?? process.env.REPORT_BRIDGE_PORT ?? DEFAULT_PORT), 10);
  const server = createServer(createBridgeHandler(options));
  server.on("clientError", (error, socket) => {
    console.warn(JSON.stringify({
      status: "client-error",
      error: error instanceof Error ? error.message : "unknown"
    }));
    if (socket.writable) {
      socket.end("HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n");
    }
  });
  server.listen(port, host, () => {
    const address = server.address();
    const actualPort = typeof address === "object" && address ? address.port : port;
    console.info(JSON.stringify({ status: "listening", host, port: actualPort }));
  });
  return server;
}

const entrypoint = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (import.meta.url === entrypoint) {
  process.on("uncaughtException", (error) => {
    console.error(JSON.stringify({
      status: "uncaught-exception",
      error: error instanceof Error ? error.stack ?? error.message : "unknown"
    }));
  });
  process.on("unhandledRejection", (reason) => {
    console.error(JSON.stringify({
      status: "unhandled-rejection",
      error: reason instanceof Error ? reason.stack ?? reason.message : String(reason)
    }));
  });
  startServer();
}
