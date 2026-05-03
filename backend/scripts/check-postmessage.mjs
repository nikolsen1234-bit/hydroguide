#!/usr/bin/env node
// Blocks postMessage calls that use the wildcard targetOrigin "*".
// Wildcard origin leaks message contents to any embedding parent and is a
// known XSS / data-leak vector.
//
// Usage:
//   node backend/scripts/check-postmessage.mjs --staged   (pre-commit)
//   node backend/scripts/check-postmessage.mjs --all      (CI)
//
// Exemptions:
// - test files (*.test.{js,mjs,ts,tsx})
// - backend/scripts/, frontend/scripts/, .ai/scripts/, private/scripts/, tools/
// - lines with explicit allow comment: // allow-postmessage-wildcard

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";

// Matches: postMessage(<anything>, "*") or postMessage(<anything>, '*')
// Multiline-safe via [\s\S].
const FORBIDDEN = /postMessage\s*\(\s*[\s\S]*?,\s*["']\*["']\s*\)/;

const EXEMPT_PATHS = [
  /(^|[\\/])[^/\\]+\.test\.(m?js|tsx?)$/i,
  /(^|[\\/])backend[\\/]scripts[\\/]/i,
  /(^|[\\/])frontend[\\/]scripts[\\/]/i,
  /(^|[\\/])\.ai[\\/]scripts[\\/]/i,
  /(^|[\\/])private[\\/]scripts[\\/]/i,
  /(^|[\\/])tools[\\/]/i,
];

const EXTS = new Set([".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx", ".html"]);

function git(args) {
  try {
    return execFileSync("git", args, { encoding: "utf8" }).trim();
  } catch {
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

function isReadable(path) {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

function checkFile(path) {
  if (!isReadable(path)) return [];
  let text;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    return [];
  }
  // We need both line numbers and multiline support, so scan line-by-line
  // first (most cases are single-line), and fall back to a whole-file match
  // for multiline calls.
  const hits = [];
  const lines = text.split(/\r?\n/);
  lines.forEach((line, idx) => {
    if (line.includes("// allow-postmessage-wildcard")) return;
    if (FORBIDDEN.test(line)) {
      hits.push({ line: idx + 1, text: line.trim().slice(0, 120) });
    }
  });
  // Whole-file scan for multiline cases not caught above.
  if (hits.length === 0 && /postMessage\s*\(/.test(text) && FORBIDDEN.test(text)) {
    hits.push({ line: 0, text: "(multiline postMessage call with '*' targetOrigin)" });
  }
  return hits;
}

function main() {
  const args = new Set(process.argv.slice(2));
  let mode;
  if (args.has("--staged")) mode = "staged";
  else if (args.has("--all")) mode = "all";
  else {
    console.error("check-postmessage: pass --staged or --all");
    process.exit(2);
  }

  const files = listFiles(mode).filter((p) => hasExt(p) && !isExempt(p));
  const offenders = [];

  for (const path of files) {
    const hits = checkFile(path);
    if (hits.length > 0) offenders.push({ path, hits });
  }

  if (offenders.length === 0) {
    process.exit(0);
  }

  console.error(`check-postmessage blocked: wildcard targetOrigin "*" found in ${offenders.length} file(s).`);
  console.error("");
  for (const off of offenders) {
    console.error(`  ${off.path}`);
    for (const hit of off.hits) {
      const where = hit.line > 0 ? `line ${hit.line}` : "multiline";
      console.error(`    ${where}: ${hit.text}`);
    }
  }
  console.error("");
  console.error('  Wildcard "*" sends the message to ANY embedding parent regardless of origin.');
  console.error("  Replace with a specific origin (e.g. PARENT_ORIGIN or location.origin).");
  console.error("  Add `// allow-postmessage-wildcard` on the same line if intentional.");
  process.exit(1);
}

main();
