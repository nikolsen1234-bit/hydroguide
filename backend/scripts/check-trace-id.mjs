#!/usr/bin/env node

export const TRACE_PLACEHOLDER = "HG-TRACE";

const TRACE_PLACEHOLDER_RE = /HG-TRACE/g;
const TRACE_ID_RE = /HG-[A-F0-9]{8}/g;
const ANY_HG_ID_RE = /HG-[A-Z0-9-]+/g;
const ISO_TIMESTAMP_RE = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}Z/g;
const GENERATED_DATE_RE = /Generert\s+[^<\n]+/g;
const REPORT_HEADER_DATE_RE = /Rapport\s+HG-TRACE\s*·\s*[^<]+/g;
const REPORT_TRACE_LINE_RE = /Sist sporing:\s*(HG-[A-F0-9]{8}|HG-TRACE)/g;
const TEXT_EXTENSIONS = new Set([
  ".css",
  ".html",
  ".js",
  ".json",
  ".map",
  ".svg",
  ".txt",
  ".webmanifest",
  ".xml"
]);

function toHex(bytes) {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function encodeUtf8(text) {
  return new TextEncoder().encode(text);
}

function nodeImport(specifier) {
  return Function("specifier", "return import(specifier)")(specifier);
}

async function sha256Hex(input) {
  const bytes = typeof input === "string" ? encodeUtf8(input) : input;
  if (globalThis.crypto?.subtle) {
    const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
    return toHex(new Uint8Array(digest));
  }

  const { createHash } = await nodeImport("node:crypto");
  return createHash("sha256").update(bytes).digest("hex");
}

export function normalizeTraceHtml(html) {
  return html
    .replace(ANY_HG_ID_RE, TRACE_PLACEHOLDER)
    .replace(GENERATED_DATE_RE, "Generert TRACE-DATE")
    .replace(REPORT_HEADER_DATE_RE, "Rapport HG-TRACE · TRACE-DATE")
    .replace(ISO_TIMESTAMP_RE, "TRACE-TIMESTAMP");
}

export async function makeTraceId(html) {
  const digest = await sha256Hex(normalizeTraceHtml(html));
  return `HG-${digest.slice(0, 8).toUpperCase()}`;
}

export async function stampTraceId(html) {
  const traceId = await makeTraceId(html);
  return html.replace(TRACE_PLACEHOLDER_RE, traceId).replace(TRACE_ID_RE, traceId);
}

export async function verifyTraceId(html, label = "HTML") {
  const matches = [...html.matchAll(REPORT_TRACE_LINE_RE)].map((match) => match[1]);
  const unique = [...new Set(matches)];
  if (unique.length !== 1) {
    throw new Error(`${label}: expected exactly one trace ID, found ${unique.length}.`);
  }

  const expected = await makeTraceId(html);
  if (unique[0] !== expected) {
    throw new Error(`${label}: trace ID ${unique[0]} does not match content hash ${expected}.`);
  }
}

async function nodeDeps() {
  const [{ execFileSync }, fs, pathModule, url] = await Promise.all([
    nodeImport("node:child_process"),
    nodeImport("node:fs/promises"),
    nodeImport("node:path"),
    nodeImport("node:url")
  ]);

  const path = pathModule.default;
  const { fileURLToPath, pathToFileURL } = url;
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = path.resolve(__dirname, "..", "..");
  return { execFileSync, fs, path, pathToFileURL, repoRoot };
}

async function listFiles(root, path, fs, relativeBase = "") {
  const entries = await fs.readdir(path.join(root, relativeBase), { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const relativePath = path.join(relativeBase, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listFiles(root, path, fs, relativePath));
      continue;
    }
    if (entry.isFile()) {
      files.push(relativePath);
    }
  }

  return files;
}

export async function makeSiteTraceId(distRoot) {
  const { fs, path } = await nodeDeps();
  const files = (await listFiles(distRoot, path, fs))
    .map((filePath) => filePath.split(path.sep).join("/"))
    .filter((filePath) => filePath !== "build-info.json")
    .sort();
  const chunks = [];

  for (const relativePath of files) {
    const absolutePath = path.join(distRoot, relativePath);
    const extension = path.extname(relativePath).toLowerCase();
    chunks.push(encodeUtf8(`\n--- ${relativePath}\n`));

    if (TEXT_EXTENSIONS.has(extension)) {
      const text = await fs.readFile(absolutePath, "utf8");
      chunks.push(encodeUtf8(text.replace(/\r\n/g, "\n")));
    } else {
      chunks.push(await fs.readFile(absolutePath));
    }
  }

  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const bytes = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  const digest = await sha256Hex(bytes);
  return `HG-${digest.slice(0, 8).toUpperCase()}`;
}

export async function makeWorkspaceTraceId(frontendRoot) {
  const { fs, path } = await nodeDeps();
  const roots = ["src", "public"];
  const files = [];

  for (const rootName of roots) {
    const absoluteRoot = path.join(frontendRoot, rootName);
    try {
      const rootFiles = await listFiles(absoluteRoot, path, fs);
      files.push(
        ...rootFiles
          .map((filePath) => `${rootName}/${filePath.split(path.sep).join("/")}`)
          .filter((filePath) => filePath !== "src/generated/build-info.json")
      );
    } catch {
      // Missing public/src folders are handled by the files that do exist.
    }
  }

  files.push("package.json");
  files.sort();

  const chunks = [];
  for (const relativePath of files) {
    const absolutePath = path.join(frontendRoot, ...relativePath.split("/"));
    const extension = path.extname(relativePath).toLowerCase();
    chunks.push(encodeUtf8(`\n--- ${relativePath}\n`));

    if (TEXT_EXTENSIONS.has(extension) || [".ts", ".tsx", ".mjs"].includes(extension)) {
      const text = await fs.readFile(absolutePath, "utf8");
      chunks.push(encodeUtf8(text.replace(/\r\n/g, "\n")));
    } else {
      chunks.push(await fs.readFile(absolutePath));
    }
  }

  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const bytes = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  const digest = await sha256Hex(bytes);
  return `HG-${digest.slice(0, 8).toUpperCase()}`;
}

async function checkReportSource() {
  const { fs, path, repoRoot } = await nodeDeps();
  const [reportSource, analysisSource, packageJson, buildInfoScript] = await Promise.all([
    fs.readFile(path.join(repoRoot, "frontend", "src", "utils", "report.ts"), "utf8"),
    fs.readFile(path.join(repoRoot, "frontend", "src", "pages", "AnalysisPage.tsx"), "utf8"),
    fs.readFile(path.join(repoRoot, "frontend", "package.json"), "utf8"),
    fs.readFile(path.join(repoRoot, "frontend", "scripts", "update-build-info.mjs"), "utf8")
  ]);

  const failures = [];
  if (!reportSource.includes("backend/scripts/check-trace-id.mjs")) {
    failures.push("frontend/src/utils/report.ts must import trace stamping from backend/scripts/check-trace-id.mjs.");
  }
  if (!reportSource.includes("TRACE_PLACEHOLDER") || !reportSource.includes("stampTraceId")) {
    failures.push("frontend/src/utils/report.ts must stamp report HTML through the trace guard.");
  }
  if (!reportSource.includes("Sist sporing: ${esc(docId)}")) {
    failures.push("frontend/src/utils/report.ts must render the visible 'Sist sporing' line.");
  }
  if (!analysisSource.includes("await openReportWindow(")) {
    failures.push("AnalysisPage must await openReportWindow so async trace stamping completes before export.");
  }
  if (!packageJson.includes("node ../backend/scripts/check-trace-id.mjs --stamp-site dist")) {
    failures.push("frontend/package.json build must stamp the built site trace ID after Vite build.");
  }
  if (!buildInfoScript.includes("makeWorkspaceTraceId")) {
    failures.push("frontend/scripts/update-build-info.mjs must write a local-session siteTraceId.");
  }

  if (failures.length) {
    throw new Error(`trace source check failed:\n- ${failures.join("\n- ")}`);
  }
}

function stagedFiles(execFileSync, repoRoot) {
  const output = execFileSync("git", ["diff", "--cached", "--name-only", "--diff-filter=ACMR"], {
    cwd: repoRoot,
    encoding: "utf8"
  });
  return output.split(/\r?\n/).filter(Boolean);
}

async function checkStaged() {
  const { execFileSync, fs, path, repoRoot } = await nodeDeps();
  const files = stagedFiles(execFileSync, repoRoot);
  const relevant = files.some((filePath) =>
    filePath === "frontend/src/utils/report.ts" ||
    filePath === "frontend/src/pages/AnalysisPage.tsx" ||
    filePath === "frontend/scripts/update-build-info.mjs" ||
    filePath === "frontend/package.json" ||
    filePath === "backend/scripts/check-trace-id.mjs"
  );

  if (relevant) {
    await checkReportSource();
  }

  for (const filePath of files) {
    if (!filePath.endsWith(".html")) {
      continue;
    }
    const absolutePath = path.join(repoRoot, filePath);
    try {
      const info = await fs.stat(absolutePath);
      if (info.isFile()) {
        const html = await fs.readFile(absolutePath, "utf8");
        if (html.includes("Sist sporing:")) {
          await verifyTraceId(html, filePath);
        }
      }
    } catch (error) {
      throw new Error(`${filePath}: ${error.message}`);
    }
  }
}

async function stampFiles(files) {
  const { fs, path } = await nodeDeps();
  for (const filePath of files) {
    const absolutePath = path.resolve(filePath);
    const html = await fs.readFile(absolutePath, "utf8");
    await fs.writeFile(absolutePath, await stampTraceId(html), "utf8");
  }
}

async function checkFiles(files) {
  const { fs, path } = await nodeDeps();
  for (const filePath of files) {
    const absolutePath = path.resolve(filePath);
    await verifyTraceId(await fs.readFile(absolutePath, "utf8"), filePath);
  }
}

async function stampSite(distRoot) {
  const { fs, path } = await nodeDeps();
  const absoluteDistRoot = path.resolve(distRoot);
  const frontendRoot = path.dirname(absoluteDistRoot);
  const generatedPath = path.join(frontendRoot, "src", "generated", "build-info.json");
  const distBuildInfoPath = path.join(absoluteDistRoot, "build-info.json");

  const readJson = async (filePath) => {
    try {
      return JSON.parse(await fs.readFile(filePath, "utf8"));
    } catch {
      return {};
    }
  };

  const [generatedInfo, distInfo] = await Promise.all([
    readJson(generatedPath),
    readJson(distBuildInfoPath)
  ]);
  const siteTraceId = await makeSiteTraceId(absoluteDistRoot);
  const nextInfo = {
    ...generatedInfo,
    ...distInfo,
    siteTraceId
  };

  await fs.mkdir(path.dirname(distBuildInfoPath), { recursive: true });
  await fs.writeFile(distBuildInfoPath, `${JSON.stringify(nextInfo, null, 2)}\n`, "utf8");
}

async function main() {
  const [command, ...args] = process.argv.slice(2);

  if (command === "--staged") {
    await checkStaged();
    return;
  }
  if (command === "--all") {
    await checkReportSource();
    return;
  }
  if (command === "--stamp-report" && args.length) {
    await stampFiles(args);
    return;
  }
  if (command === "--check-report" && args.length) {
    await checkFiles(args);
    return;
  }
  if (command === "--site-id" && args.length === 1) {
    process.stdout.write(`${await makeSiteTraceId(args[0])}\n`);
    return;
  }
  if (command === "--workspace-id" && args.length === 1) {
    process.stdout.write(`${await makeWorkspaceTraceId(args[0])}\n`);
    return;
  }
  if (command === "--stamp-site" && args.length === 1) {
    await stampSite(args[0]);
    return;
  }

  throw new Error("Usage: node backend/scripts/check-trace-id.mjs --staged|--all|--stamp-report <html...>|--check-report <html...>|--site-id <dist>|--workspace-id <frontend>|--stamp-site <dist>");
}

async function isCliEntry() {
  const { pathToFileURL } = await nodeDeps();
  return process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
}

if (typeof process !== "undefined" && await isCliEntry()) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
