#!/usr/bin/env node
// Blocks staged files containing real Cloudflare account/namespace/secret IDs.
//
// Source of truth for IDs: private/known-bad-ids.json (git-crypt encrypted,
// shared between collaborators with the key). Without that file (e.g. CI
// without git-crypt key, or a fresh clone), the check has nothing to compare
// against and exits 0 — that is acceptable because the same IDs in .secrets
// would also be encrypted binary in CI and unreadable.
//
// Usage:
//   node backend/scripts/check-hardcoded-ids.mjs --staged
//   node backend/scripts/check-hardcoded-ids.mjs --all

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

const KNOWN_IDS_PATH = resolve(process.cwd(), "private", "known-bad-ids.json");

const SKIP_PATHS = [
  /(^|[\\/])node_modules[\\/]/i,
  /(^|[\\/])dist[\\/]/i,
  /(^|[\\/])build[\\/]/i,
  /(^|[\\/])\.wrangler[\\/]/i,
  /(^|[\\/])test-deploy[\\/]/i,
  /\.(png|jpe?g|gif|webp|ico|pdf|woff2?|ttf|otf|zip|gz)$/i,
];

// NOTE: .secrets and backend/config/cloudflare.private.json are intentionally
// NOT in SKIP_PATHS. They are git-crypt encrypted in the remote, but if
// git-crypt fails locally and the working-tree files are plaintext, this check
// must still catch hardcoded IDs before they get committed in the clear.
// In CI (where git-crypt is not active), the files are encrypted binary and
// the regex below will not match either way.

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

function loadExtraIds() {
  if (!existsSync(KNOWN_IDS_PATH)) return [];
  try {
    const data = JSON.parse(readFileSync(KNOWN_IDS_PATH, "utf8"));
    if (Array.isArray(data?.ids)) {
      return data.ids.filter((id) => typeof id === "string" && id.length >= 16);
    }
  } catch {
    return [];
  }
  return [];
}

function buildPattern(ids) {
  const escaped = ids.map((id) => id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  return new RegExp(escaped.join("|"), "i");
}

function isSkippable(path) {
  return SKIP_PATHS.some((re) => re.test(path));
}

function isGitCryptEncrypted(path) {
  // Files with the git-crypt filter are stored encrypted in the repo. Even
  // if locally readable as plaintext (after unlock), they cannot leak IDs to
  // the public remote. Skip them to avoid false positives on collaborator
  // machines.
  try {
    const out = execFileSync("git", ["check-attr", "filter", "--", path], {
      encoding: "utf8",
    }).trim();
    return out.endsWith(": filter: git-crypt");
  } catch {
    return false;
  }
}

function isReadable(path) {
  try {
    const s = statSync(path);
    return s.isFile();
  } catch {
    return false;
  }
}

function checkFile(path, pattern) {
  if (!isReadable(path)) return [];
  let text;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    return [];
  }
  const lines = text.split(/\r?\n/);
  const hits = [];
  lines.forEach((line, idx) => {
    if (pattern.test(line)) {
      hits.push({ line: idx + 1, text: line.trim().slice(0, 120) });
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
    console.error("check-hardcoded-ids: pass --staged or --all");
    process.exit(2);
  }

  const allIds = [...new Set(loadExtraIds())];
  if (allIds.length === 0) {
    // No known IDs to check against (private/known-bad-ids.json missing or
    // unreadable). This happens in CI without git-crypt key, or in fresh
    // clones. Pass through — encrypted files cannot leak IDs anyway.
    process.exit(0);
  }
  const pattern = buildPattern(allIds);

  const files = listFiles(mode)
    .filter((p) => !isSkippable(p))
    .filter((p) => !isGitCryptEncrypted(p));
  const offenders = [];
  for (const path of files) {
    const hits = checkFile(path, pattern);
    if (hits.length > 0) offenders.push({ path, hits });
  }

  if (offenders.length === 0) {
    process.exit(0);
  }

  console.error(`check-hardcoded-ids blocked: real Cloudflare ID found in ${offenders.length} file(s).`);
  console.error("");
  for (const off of offenders) {
    console.error(`  ${off.path}`);
    for (const hit of off.hits) {
      console.error(`    line ${hit.line}: ${hit.text}`);
    }
  }
  console.error("");
  console.error("  Real account/namespace/secret IDs must NOT appear in tracked files.");
  console.error("  Use REPLACE_WITH_* placeholders in config; real values belong in .secrets (git-crypt encrypted).");
  process.exit(1);
}

main();
