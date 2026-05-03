#!/usr/bin/env node
// Blocks staged JS/TS files containing console.log or console.debug.
// Usage:
//   node backend/scripts/check-no-console.mjs --staged   (pre-commit)
//   node backend/scripts/check-no-console.mjs --all      (CI: all tracked files)
//
// Exemptions:
// - test files (*.test.{js,mjs,ts,tsx})
// - files inside backend/scripts/ (CLI scripts use console for output)
// - files inside .ai/scripts/ (same reason)
// - files inside tools/ (CLI scripts)
// - lines with explicit allow comment: // allow-console

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

const FORBIDDEN = /\bconsole\.(log|debug)\s*\(/;

const EXEMPT_PATHS = [
  /(^|[\\/])[^/\\]+\.test\.(m?js|tsx?)$/i,
  /(^|[\\/])backend[\\/]scripts[\\/]/i,
  /(^|[\\/])frontend[\\/]scripts[\\/]/i,
  /(^|[\\/])\.ai[\\/]scripts[\\/]/i,
  /(^|[\\/])private[\\/]scripts[\\/]/i,
  /(^|[\\/])tools[\\/]/i,
];

const EXTS = new Set([".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx"]);

function git(args) {
  try {
    return execFileSync("git", args, { encoding: "utf8" }).trim();
  } catch (err) {
    return "";
  }
}

function listFiles(mode) {
  if (mode === "staged") {
    const out = git(["diff", "--cached", "--name-only", "--diff-filter=ACM"]);
    return out ? out.split(/\r?\n/).filter(Boolean) : [];
  }
  if (mode === "all") {
    const out = git(["ls-files"]);
    return out ? out.split(/\r?\n/).filter(Boolean) : [];
  }
  return [];
}

function isExempt(path) {
  return EXEMPT_PATHS.some((re) => re.test(path));
}

function hasExt(path) {
  const dot = path.lastIndexOf(".");
  if (dot === -1) return false;
  return EXTS.has(path.slice(dot).toLowerCase());
}

function checkFile(path) {
  if (!existsSync(path)) return [];
  const text = readFileSync(path, "utf8");
  const lines = text.split(/\r?\n/);
  const hits = [];
  lines.forEach((line, idx) => {
    if (line.includes("// allow-console") || line.includes("/* allow-console")) return;
    if (FORBIDDEN.test(line)) {
      hits.push({ line: idx + 1, text: line.trim() });
    }
  });
  return hits;
}

function main() {
  const args = new Set(process.argv.slice(2));
  let mode;
  if (args.has("--staged")) mode = "staged";
  else if (args.has("--all")) mode = "all";
  else {
    console.error("check-no-console: pass --staged or --all");
    process.exit(2);
  }

  const files = listFiles(mode).filter((p) => hasExt(p) && !isExempt(p));
  const offenders = [];

  for (const path of files) {
    const hits = checkFile(path);
    if (hits.length > 0) {
      offenders.push({ path, hits });
    }
  }

  if (offenders.length === 0) {
    process.exit(0);
  }

  console.error(`check-no-console blocked: console.log or console.debug found in ${offenders.length} file(s).`);
  console.error("");
  for (const off of offenders) {
    console.error(`  ${off.path}`);
    for (const hit of off.hits) {
      console.error(`    line ${hit.line}: ${hit.text}`);
    }
  }
  console.error("");
  console.error("  Remove the debug logging, or add `// allow-console` on the same line if intentional.");
  console.error("  Test files, backend/scripts/, .ai/scripts/ and tools/ are exempt automatically.");
  process.exit(1);
}

main();
