import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const MINIMUM_FLOW_LOCAL_PATH = path.join(__dirname, "..", "backend", "data", "minimumflow.json");
const LOCAL_SECRETS_PATH = path.join(__dirname, "..", ".secrets");
const BUILD_INFO_LOCAL_PATH = path.join(__dirname, "src", "generated", "build-info.json");
const minimumFlowBucketStub = {
  async get(_key: string) {
    const text = readFileSync(MINIMUM_FLOW_LOCAL_PATH, "utf8");
    return {
      async json() {
        return JSON.parse(text);
      }
    };
  }
};
const localFunctionEnv = {
  ...readLocalSecrets(),
  ...process.env
};
const cloudflareHosts = ["localhost", "127.0.0.1", ".trycloudflare.com"];
const functionRoutes = new Map([
  ["/api/openapi", path.join(__dirname, "..", "backend", "api", "docs.js")],
  ["/api/health", path.join(__dirname, "..", "backend", "api", "health.js")],
  ["/api/calculations", path.join(__dirname, "..", "backend", "api", "calculations.js")],
  ["/admin/keys", path.join(__dirname, "..", "backend", "admin", "keys", "index.js")],
  ["/api/nveid", path.join(__dirname, "..", "backend", "api", "nveid.js")],
  ["/api/place-suggestions", path.join(__dirname, "..", "backend", "api", "place-suggestions.js")],
  ["/api/terrain-profile", path.join(__dirname, "..", "backend", "api", "terrain-profile.js")],
  ["/api/pvgis-tmy", path.join(__dirname, "..", "backend", "api", "pvgis-tmy.js")],
  ["/api/report", path.join(__dirname, "..", "backend", "api", "report.js")]
]);

type BridgeRequest = NodeJS.ReadableStream & {
  url?: string;
  method?: string;
  headers?: Record<string, string | string[] | undefined>;
};

type BridgeServer = {
  middlewares: {
    use: (handler: (req: BridgeRequest, res: any, next: (error?: unknown) => void) => void) => void;
  };
};

async function readRequestBody(req: BridgeRequest) {
  const chunks: Uint8Array[] = [];
  for await (const chunk of req) {
    if (typeof chunk === "string") { chunks.push(Buffer.from(chunk)); continue; }
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return chunks.length > 0 ? Buffer.concat(chunks) : undefined;
}

function functionsDevBridge() {
  async function handleRequest(
    req: BridgeRequest,
    res: NodeJS.WritableStream & { statusCode?: number; setHeader(name: string, value: string | string[]): void; end(chunk?: string | Uint8Array): void }
  ) {
    const requestUrl = req.url ? new URL(req.url, "http://127.0.0.1:5173") : null;
    const modulePath = requestUrl ? resolveFunctionModule(requestUrl.pathname) : null;
    if (!requestUrl || !modulePath) return false;

    const method = (req.method ?? "GET").toUpperCase();
    const functionModule = await import(`${pathToFileURL(modulePath).href}?t=${Date.now()}`);
    const handler = (method === "POST" ? functionModule.onRequestPost : functionModule.onRequestGet) ?? functionModule.onRequest;
    if (typeof handler !== "function") return false;

    const headers = new Headers();
    headers.set("accept", "application/json");
    for (const [key, value] of Object.entries(req.headers ?? {})) {
      if (Array.isArray(value)) headers.set(key, value.join(", "));
      else if (typeof value === "string") headers.set(key, value);
    }

    const requestBody = method === "GET" || method === "HEAD" ? undefined : await readRequestBody(req);
    const response = await handler({
      request: new Request(requestUrl.toString(), { method, headers, body: requestBody }),
      env: { ...localFunctionEnv, MINIMUM_FLOW_BUCKET: minimumFlowBucketStub }
    });

    res.statusCode = response.status;
    response.headers.forEach((value: string, key: string) => { res.setHeader(key, value); });
    res.end(new Uint8Array(await response.arrayBuffer()));
    return true;
  }

  return {
    name: "functions-dev-bridge",
    configureServer(server: BridgeServer) {
      installBridgeMiddleware(server, handleRequest);
    },
    configurePreviewServer(server: BridgeServer) {
      installBridgeMiddleware(server, handleRequest);
    }
  };
}

function readLocalSecrets() {
  try {
    const values: Record<string, string> = {};
    const text = readFileSync(LOCAL_SECRETS_PATH, "utf8");
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) {
        continue;
      }
      const [name, ...rest] = trimmed.split("=");
      const key = name.trim();
      if (key) {
        values[key] = rest.join("=").trim();
      }
    }
    return values;
  } catch {
    return {};
  }
}

function installBridgeMiddleware(
  server: BridgeServer,
  handleRequest: (req: BridgeRequest, res: any) => Promise<boolean>
) {
  server.middlewares.use((req, res, next) => {
    if (req.url?.split("?")[0] !== "/build-info.json") {
      next();
      return;
    }

    try {
      const payload = readFileSync(BUILD_INFO_LOCAL_PATH, "utf8");
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
      res.end(payload);
      return;
    } catch {
      next();
      return;
    }
  });

  // Rewrite extensionless public HTML paths so Vite serves the file
  // instead of falling through to the SPA index.html.
  server.middlewares.use((req, _res, next) => {
    if (req.url && req.url.split("?")[0] === "/nve-kart-standalone") {
      req.url = req.url.replace("/nve-kart-standalone", "/nve-kart-standalone.html");
    }
    next();
  });
  server.middlewares.use((req, res, next) => {
    handleRequest(req, res).then((handled) => {
      if (!handled) next();
    }, next);
  });
}

function resolveFunctionModule(pathname: string) {
  const exact = functionRoutes.get(pathname);
  if (exact) return exact;
  if (/^\/api\/NVEID(?:\/.*)?$/.test(pathname)) {
    return functionRoutes.get("/api/nveid") ?? null;
  }
  for (const [route, modulePath] of functionRoutes) {
    if (pathname.startsWith(`${route}/`)) return modulePath;
  }
  return null;
}

export default defineConfig({
  plugins: [react(), functionsDevBridge()],
  server: { host: true, port: 5173, strictPort: true, allowedHosts: cloudflareHosts },
  preview: { host: true, port: 4173, strictPort: true, allowedHosts: cloudflareHosts }
});
