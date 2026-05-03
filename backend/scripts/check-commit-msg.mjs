#!/usr/bin/env node
// Validates commit message format.
// Usage: node backend/scripts/check-commit-msg.mjs <path-to-commit-msg-file>
//
// Rules (intentionally lenient — only blocks obvious sloppiness):
// - Total trimmed length >= 10 characters
// - First line is not in the blocklist of low-effort messages
// - First line is under 100 characters (warn only, not block)
// - Merge commits and revert commits are exempt

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const BLOCKLIST = new Set([
  "fix",
  "wip",
  "update",
  "updates",
  "merge",
  "test",
  "tests",
  "todo",
  "stuff",
  "things",
  "asdf",
  "asd",
  "x",
  "y",
  "tmp",
  "temp",
  "draft",
  "save",
  "saved",
  "checkpoint",
  "more",
  "another",
  "again",
  ".",
  "..",
  "...",
  "fixed bug",
  "bug fix",
  "small fix",
  "minor fix",
  "small change",
  "minor change",
  "small update",
  "minor update",
  "fix things",
  "fix stuff",
  "update stuff",
  "update things",
]);

function fail(reason, message) {
  console.error(`commit-msg blocked: ${reason}`);
  console.error(`  message: ${JSON.stringify(message)}`);
  console.error(``);
  console.error(`  Write a commit message that explains WHAT and WHY in at least 10 characters.`);
  console.error(`  Examples:`);
  console.error(`    Add minimum-flow validation to NVEID handler`);
  console.error(`    Endre rate limit til 40 req per 10s`);
  console.error(`    docs(sikkerheit): clarify HMAC-flyt`);
  process.exit(1);
}

function main() {
  const msgPath = process.argv[2];
  if (!msgPath) {
    console.error("check-commit-msg: missing commit message file argument");
    process.exit(2);
  }

  const absolutePath = resolve(msgPath);
  if (!existsSync(absolutePath)) {
    console.error(`check-commit-msg: commit message file not found: ${absolutePath}`);
    process.exit(2);
  }

  const raw = readFileSync(absolutePath, "utf8");
  const lines = raw.split(/\r?\n/);
  const firstLine = (lines.find((line) => !line.startsWith("#")) || "").trim();

  // Exempt merge and revert commits — git generates these.
  if (/^Merge\s/.test(firstLine) || /^Revert\s/.test(firstLine)) {
    process.exit(0);
  }

  if (firstLine.length < 10) {
    fail("first line is shorter than 10 characters", firstLine);
  }

  const normalized = firstLine.toLowerCase().replace(/[.!?]+$/, "").trim();
  if (BLOCKLIST.has(normalized)) {
    fail(`first line is in low-effort blocklist`, firstLine);
  }

  if (firstLine.length > 100) {
    console.error(`commit-msg warning: first line is ${firstLine.length} characters (recommended: < 72, max: 100).`);
    // Warn only, do not block.
  }

  process.exit(0);
}

main();
