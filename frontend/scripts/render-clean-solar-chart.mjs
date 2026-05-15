#!/usr/bin/env node
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const frontendRoot = path.resolve(__dirname, "..");
const DEFAULT_SOURCE = path.join(frontendRoot, "public", "Kalkulator.txt");
const DEFAULT_OUT = path.join(homedir(), "Downloads", "hydroguide-solinnstraling-clean.png");
const DEFAULT_URL = "http://127.0.0.1:5173";

function parseArgs(argv) {
  const args = {
    source: DEFAULT_SOURCE,
    out: DEFAULT_OUT,
    values: null,
    url: DEFAULT_URL,
    open: false
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--source") args.source = path.resolve(argv[++i]);
    else if (arg === "--out") args.out = path.resolve(argv[++i]);
    else if (arg === "--values") args.values = parseValues(argv[++i]);
    else if (arg === "--url") args.url = argv[++i].replace(/\/$/, "");
    else if (arg === "--open") args.open = true;
    else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return args;
}

function printHelp() {
  console.log(`Usage:
  npm run solar:chart -- [options]

This renders HydroGuide's actual React solar chart in clean render mode.
It does not draw a separate/generated chart.

Options:
  --source <file>  HydroGuide .txt/JSON config to read monthlySolarRadiation from.
                   Default: ${DEFAULT_SOURCE}
  --values <list>  Twelve values. Supports Norwegian decimal commas.
                   Example: "0,11 1,02 21,44 61,44 79,35 79,30 80,63 71,42 37,71 3,06 0,26 0,02"
  --out <file>     Output PNG. Default: ${DEFAULT_OUT}
  --url <url>      Running Vite URL. Default: ${DEFAULT_URL}
  --open           Open the PNG after rendering.
`);
}

function parseValues(raw) {
  const values = (raw.match(/\d+(?:[,.]\d+)?/g) ?? [])
    .map((part) => Number(part.replace(",", ".")));

  if (values.length !== 12 || values.some((value) => !Number.isFinite(value) || value < 0)) {
    throw new Error("--values must contain exactly twelve non-negative numbers.");
  }

  return values;
}

function readSourceValues(sourcePath) {
  if (!existsSync(sourcePath)) {
    throw new Error(`Source file not found: ${sourcePath}`);
  }

  const config = JSON.parse(readFileSync(sourcePath, "utf8"));
  const source = config.monthlySolarRadiation;
  if (!source || typeof source !== "object") {
    throw new Error(`Source file has no monthlySolarRadiation object: ${sourcePath}`);
  }

  const keys = [
    ["jan"],
    ["feb"],
    ["mar"],
    ["apr"],
    ["may", "mai"],
    ["jun"],
    ["jul"],
    ["aug"],
    ["sep"],
    ["oct", "okt"],
    ["nov"],
    ["dec", "des"]
  ];

  return keys.map((aliases) => {
    const raw = aliases.map((key) => source[key]).find((value) => value !== undefined);
    const value = typeof raw === "string" ? Number(raw.replace(",", ".")) : Number(raw);
    if (!Number.isFinite(value) || value < 0) {
      throw new Error(`Invalid monthlySolarRadiation value for ${aliases.join("/")}`);
    }
    return value;
  });
}

function findBrowserExecutable() {
  const candidates = process.platform === "win32"
    ? [
        "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
        "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
        "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
        "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe"
      ]
    : ["google-chrome", "chromium", "chromium-browser", "microsoft-edge"];

  for (const candidate of candidates) {
    if (process.platform === "win32" && existsSync(candidate)) return candidate;
    if (process.platform !== "win32") {
      try {
        execFileSync("which", [candidate], { stdio: "ignore" });
        return candidate;
      } catch {}
    }
  }

  throw new Error("Could not find Edge/Chrome for app screenshot rendering.");
}

async function waitForApp(baseUrl, timeoutMs = 40000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/parametere`);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 600));
  }
  throw new Error(`Vite did not respond at ${baseUrl}`);
}

async function ensureDevServer(baseUrl) {
  try {
    await waitForApp(baseUrl, 2500);
    return null;
  } catch {}

  const command = process.platform === "win32" ? "npm.cmd" : "npm";
  const child = spawn(command, ["run", "dev"], {
    cwd: frontendRoot,
    detached: true,
    stdio: "ignore",
    windowsHide: true
  });
  child.unref();
  await waitForApp(baseUrl);
  return child.pid;
}

function buildCleanChartUrl(baseUrl, values) {
  const url = new URL("/parametere", baseUrl);
  url.searchParams.set("cleanSolarChart", "1");
  url.searchParams.set("solarValues", values.join(","));
  return url.toString();
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForBrowserTarget(port, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const targets = await fetch(`http://127.0.0.1:${port}/json`).then((response) => response.json());
      const target = targets.find((item) => item.type === "page" && item.webSocketDebuggerUrl);
      if (target) return target;
    } catch {}
    await delay(300);
  }

  throw new Error("Headless browser DevTools target did not become ready.");
}

function connectCdp(webSocketDebuggerUrl) {
  if (typeof WebSocket === "undefined") {
    throw new Error("This Node.js version has no built-in WebSocket. Use Node 22+.");
  }

  const ws = new WebSocket(webSocketDebuggerUrl);
  let nextId = 0;
  const pending = new Map();

  ws.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (!message.id || !pending.has(message.id)) return;

    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);

    if (message.error) reject(new Error(message.error.message));
    else resolve(message.result ?? {});
  });

  return {
    open: new Promise((resolve, reject) => {
      ws.addEventListener("open", resolve, { once: true });
      ws.addEventListener("error", reject, { once: true });
    }),
    send(method, params = {}) {
      nextId += 1;
      const id = nextId;
      ws.send(JSON.stringify({ id, method, params }));
      return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
    },
    close() {
      ws.close();
    }
  };
}

async function renderProgramScreenshot(browser, url, outPath) {
  const userDataDir = mkdtempSync(path.join(tmpdir(), "hydroguide-solar-chart-"));
  const port = 9300 + Math.floor(Math.random() * 500);
  let child = null;
  try {
    child = spawn(browser, [
      "--headless=new",
      "--disable-gpu",
      "--hide-scrollbars",
      "--no-first-run",
      "--no-default-browser-check",
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${userDataDir}`,
      "--window-size=1320,560",
      url
    ], { stdio: "ignore", windowsHide: true });

    const target = await waitForBrowserTarget(port);
    const cdp = connectCdp(target.webSocketDebuggerUrl);
    await cdp.open;
    await cdp.send("Page.enable");
    await cdp.send("Runtime.enable");
    await cdp.send("Page.bringToFront");
    const readiness = await cdp.send("Runtime.evaluate", {
      awaitPromise: true,
      returnByValue: true,
      expression: `new Promise((resolve) => {
        let attempts = 0;
        const check = () => {
          const chart = document.querySelector("[data-clean-solar-chart]");
          const text = document.body.innerText || "";
          const rect = chart?.getBoundingClientRect();
          if (chart && rect && rect.width > 1000 && rect.height > 300 && text.includes("kWh/m²") && text.includes("Sum:")) {
            resolve({
              ready: true,
              text,
              clip: {
                x: Math.max(0, Math.floor(rect.left - 8)),
                y: Math.max(0, Math.floor(rect.top - 8)),
                width: Math.ceil(rect.width + 16),
                height: Math.ceil(rect.height + 16),
                scale: 1
              }
            });
            return;
          }
          attempts += 1;
          if (attempts > 120) {
            resolve({ ready: false, text });
            return;
          }
          setTimeout(check, 250);
        };
        check();
      })`
    });

    if (!readiness.result?.value?.ready) {
      throw new Error(`HydroGuide clean solar chart did not render. Page text: ${readiness.result?.value?.text ?? ""}`);
    }

    const screenshot = await cdp.send("Page.captureScreenshot", {
      format: "png",
      fromSurface: true,
      captureBeyondViewport: false,
      clip: readiness.result.value.clip
    });
    writeFileSync(outPath, Buffer.from(screenshot.data, "base64"));
    cdp.close();
  } finally {
    if (child && !child.killed) {
      if (process.platform === "win32") {
        spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" });
      } else {
        child.kill();
      }
    }
    try {
      rmSync(userDataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
    } catch {}
  }
}

function openFile(filePath) {
  if (process.platform === "win32") {
    spawnSync("cmd", ["/c", "start", "", filePath], { stdio: "ignore" });
  } else if (process.platform === "darwin") {
    spawnSync("open", [filePath], { stdio: "ignore" });
  } else {
    spawnSync("xdg-open", [filePath], { stdio: "ignore" });
  }
}

const args = parseArgs(process.argv.slice(2));
const values = args.values ?? readSourceValues(args.source);
const browser = findBrowserExecutable();
await ensureDevServer(args.url);
const url = buildCleanChartUrl(args.url, values);
await renderProgramScreenshot(browser, url, path.resolve(args.out));

if (args.open) openFile(path.resolve(args.out));

console.log(path.resolve(args.out));
