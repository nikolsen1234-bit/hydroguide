import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const MINIMUMFLOW_LOCAL_PATH = path.join(__dirname, "..", "backend", "data", "minimumflow.json");
const minimumFlowR2Stub = {
  async get(_key: string) {
    const text = readFileSync(MINIMUMFLOW_LOCAL_PATH, "utf8");
    return {
      async json() {
        return JSON.parse(text);
      }
    };
  }
};
const cloudflareHosts = ["localhost", "127.0.0.1", ".trycloudflare.com"];
const canonicalJsChunkNames = new Map([
  ["AnalysisPage", "AnalysisPage-DW49hPYf.js"],
  ["ApiPage", "ApiPage-dNgpZCXI.js"],
  ["BudgetPage", "BudgetPage-B8bGVTeL.js"],
  ["chunk", "chunk-B3K2TuZy.js"],
  ["ContactPage", "ContactPage-B90tnn8j.js"],
  ["DocumentationPage", "DocumentationPage-CqfD4sMe.js"],
  ["FormFields", "FormFields-BU-GDrAu.js"],
  ["index", "index-BUYsEGeb.js"],
  ["jsx-runtime", "jsx-runtime-ClXwjIxh.js"],
  ["leaflet", "leaflet-DCnXZOqV.js"],
  ["leaflet-src", "leaflet-src-DWk_SuGo.js"],
  ["MainPage", "MainPage-CWWzLUjE.js"],
  ["OverviewPage", "OverviewPage-DzvnAPo5.js"],
  ["SiktlinjeRadioPage", "SiktlinjeRadioPage-CdFnUkGd.js"],
  ["SystemCharts", "SystemCharts-Ds9X225g.js"],
  ["SystemPage", "SystemPage-DGjHx9u5.js"],
  ["WelcomePage", "WelcomePage-YyXq5FMH.js"],
  ["workspace", "workspace-Btc1hWRU.js"],
  ["WorkspaceSection", "WorkspaceSection-CBKHlbw1.js"]
]);
const canonicalAssetNames = new Map([["index.css", "index-14iAWX-t.css"]]);

const functionRoutes = new Map([
  ["/api/health", path.join(__dirname, "..", "backend", "api", "health.js")],
  ["/api/docs", path.join(__dirname, "..", "backend", "api", "docs.js")],
  ["/api/calculations", path.join(__dirname, "..", "backend", "api", "calculations.js")],
  ["/api/keys", path.join(__dirname, "..", "backend", "api", "keys", "index.js")],
  ["/api/nveid", path.join(__dirname, "..", "backend", "api", "nveid.js")],
  ["/api/place-suggestions", path.join(__dirname, "..", "backend", "api", "place-suggestions.js")],
  ["/api/terrain-profile", path.join(__dirname, "..", "backend", "api", "terrain-profile.js")],
  ["/api/pvgis-tmy", path.join(__dirname, "..", "backend", "api", "pvgis-tmy.js")],
  ["/api/polish-report", path.join(__dirname, "..", "backend", "api", "polish-report.js")]
]);

type BridgeRequest = NodeJS.ReadableStream & {
  url?: string;
  method?: string;
  headers?: Record<string, string | string[] | undefined>;
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
    const functionModule = await import(pathToFileURL(modulePath).href);
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
      env: { ...process.env, MINIMUMFLOW_R2: minimumFlowR2Stub }
    });

    res.statusCode = response.status;
    response.headers.forEach((value: string, key: string) => { res.setHeader(key, value); });
    res.end(new Uint8Array(await response.arrayBuffer()));
    return true;
  }

  return {
    name: "functions-dev-bridge",
    configureServer(server: { middlewares: { use: (handler: (req: BridgeRequest, res: any, next: (error?: unknown) => void) => void) => void } }) {
      // Rewrite extensionless public HTML paths so Vite serves the file
      // instead of falling through to the SPA index.html.
      server.middlewares.use((req, _res, next) => {
        if (req.url && req.url.split("?")[0] === "/nve-kart-standalone") {
          req.url = req.url.replace("/nve-kart-standalone", "/nve-kart-standalone.html");
        }
        next();
      });
      server.middlewares.use((req, res, next) => { handleRequest(req, res).then((handled) => { if (!handled) next(); }, next); });
    },
    configurePreviewServer(server: { middlewares: { use: (handler: (req: BridgeRequest, res: any, next: (error?: unknown) => void) => void) => void } }) {
      server.middlewares.use((req, _res, next) => {
        if (req.url && req.url.split("?")[0] === "/nve-kart-standalone") {
          req.url = req.url.replace("/nve-kart-standalone", "/nve-kart-standalone.html");
        }
        next();
      });
      server.middlewares.use((req, res, next) => { handleRequest(req, res).then((handled) => { if (!handled) next(); }, next); });
    }
  };
}

function resolveFunctionModule(pathname: string) {
  const exact = functionRoutes.get(pathname);
  if (exact) return exact;
  for (const [route, modulePath] of functionRoutes) {
    if (pathname.startsWith(`${route}/`)) return modulePath;
  }
  return null;
}

export default defineConfig({
  plugins: [react(), functionsDevBridge()],
  build: {
    rollupOptions: {
      output: {
        entryFileNames(chunkInfo) {
          return `assets/${canonicalJsChunkNames.get(chunkInfo.name) ?? "[name]-[hash].js"}`;
        },
        chunkFileNames(chunkInfo) {
          return `assets/${canonicalJsChunkNames.get(chunkInfo.name) ?? "[name]-[hash].js"}`;
        },
        assetFileNames(assetInfo) {
          const assetName = assetInfo.name ? path.basename(assetInfo.name) : "";
          return `assets/${canonicalAssetNames.get(assetName) ?? "[name]-[hash][extname]"}`;
        }
      }
    }
  },
  server: { host: true, port: 5173, strictPort: true, allowedHosts: cloudflareHosts },
  preview: { host: true, port: 4173, strictPort: true, allowedHosts: cloudflareHosts }
});
