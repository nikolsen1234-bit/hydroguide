#!/usr/bin/env node

/**
 * API Key Management for HydroGuide Public API
 *
 * Uses Cloudflare KV (namespace: API_KEYS) to store hashed keys.
 *
 * Usage:
 *   node scripts/manage-api-keys.mjs create --name "Acme Corp" [--tier pro] [--rate-limit 200]
 *   node scripts/manage-api-keys.mjs list
 *   node scripts/manage-api-keys.mjs update --key-hash <sha256-hex> [--name "..."] [--tier pro] [--rate-limit 200] [--active true]
 *   node scripts/manage-api-keys.mjs revoke --key-hash <sha256-hex>
 *   node scripts/manage-api-keys.mjs delete --key-hash <sha256-hex>
 *
 * Prerequisites:
 *   1. Create a KV namespace:
 *        npx wrangler kv namespace create API_KEYS
 *
 *   2. Add the binding to wrangler.toml (or Cloudflare Pages settings):
 *        [[kv_namespaces]]
 *        binding = "API_KEYS"
 *        id = "<namespace-id>"
 *
 *   3. Set the namespace ID in the KV_NAMESPACE_ID variable below, or pass
 *      it via the --namespace-id flag.
 */

import { execSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// ---------------------------------------------------------------------------
// Config — set your KV namespace ID here or pass --namespace-id
// ---------------------------------------------------------------------------
const DEFAULT_KV_NAMESPACE_ID = process.env.KV_NAMESPACE_ID ?? "";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseArgs(args) {
  const parsed = { _positional: [] };
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith("--")) {
      const key = args[i].slice(2);
      const next = args[i + 1];
      if (next && !next.startsWith("--")) {
        parsed[key] = next;
        i++;
      } else {
        parsed[key] = true;
      }
    } else {
      parsed._positional.push(args[i]);
    }
  }
  return parsed;
}

function sha256Hex(text) {
  return crypto.createHash("sha256").update(text, "utf8").digest("hex");
}

function parseBooleanArg(value, fieldName) {
  if (value === undefined) {
    return undefined;
  }

  const normalized = String(value).trim().toLowerCase();
  if (normalized === "true") {
    return true;
  }

  if (normalized === "false") {
    return false;
  }

  console.error(`Error: --${fieldName} must be true or false.`);
  process.exit(1);
}

function generateApiKey() {
  const prefix = "hg_live_";
  const random = crypto.randomBytes(32).toString("base64url");
  return `${prefix}${random}`;
}

function resolveLocationArgs(args) {
  return args.local ? ["--local"] : ["--remote"];
}

function wranglerGet(key, namespaceId, locationArgs) {
  try {
    return execSync(
      `npx wrangler kv key get ${JSON.stringify(key)} --namespace-id=${namespaceId} --text ${locationArgs.join(" ")}`,
      { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"], cwd: process.cwd() }
    ).trim();
  } catch (error) {
    console.error("Wrangler command failed:", error.stderr ?? error.message);
    process.exit(1);
  }
}

function wranglerPut(key, value, namespaceId, locationArgs) {
  // Write value to a temp file to avoid shell quoting issues on Windows.
  const tmpFile = path.join(os.tmpdir(), `hg-api-key-${Date.now()}.json`);
  try {
    fs.writeFileSync(tmpFile, value, "utf8");
    execSync(
      `npx wrangler kv key put ${JSON.stringify(key)} --namespace-id=${namespaceId} --path=${JSON.stringify(tmpFile)} ${locationArgs.join(" ")}`,
      { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"], cwd: process.cwd() }
    );
  } catch (error) {
    console.error("Wrangler command failed:", error.stderr ?? error.message);
    process.exit(1);
  } finally {
    try { fs.unlinkSync(tmpFile); } catch {}
  }
}

function wranglerDelete(key, namespaceId, locationArgs) {
  try {
    execSync(
      `npx wrangler kv key delete ${JSON.stringify(key)} --namespace-id=${namespaceId} ${locationArgs.join(" ")}`,
      { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"], cwd: process.cwd() }
    );
  } catch (error) {
    console.error("Wrangler command failed:", error.stderr ?? error.message);
    process.exit(1);
  }
}

function wranglerList(namespaceId, locationArgs) {
  try {
    return execSync(
      `npx wrangler kv key list --namespace-id=${namespaceId} ${locationArgs.join(" ")}`,
      { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"], cwd: process.cwd() }
    ).trim();
  } catch (error) {
    console.error("Wrangler command failed:", error.stderr ?? error.message);
    process.exit(1);
  }
}

function readKeyRecord(keyHash, namespaceId, locationArgs) {
  const existing = wranglerGet(`key:${keyHash}`, namespaceId, locationArgs);
  try {
    return JSON.parse(existing);
  } catch {
    console.error(`Could not find key with hash: ${keyHash}`);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

function createKey(args, namespaceId, locationArgs) {
  const name = args.name;
  if (!name) {
    console.error("Error: --name is required.\n  Example: node scripts/manage-api-keys.mjs create --name \"Acme Corp\"");
    process.exit(1);
  }

  const tier = args.tier ?? "free";
  const rateMax = parseInt(args["rate-limit"] ?? "100", 10);
  const windowMs = parseInt(args["rate-window-ms"] ?? "60000", 10);

  const rawKey = generateApiKey();
  const keyHash = sha256Hex(rawKey);

  const record = {
    name,
    tier,
    rateLimit: { max: rateMax, windowMs },
    createdAt: new Date().toISOString(),
    active: true
  };

  wranglerPut(`key:${keyHash}`, JSON.stringify(record), namespaceId, locationArgs);

  console.log("");
  console.log("=== API Key Created ===");
  console.log("");
  console.log(`  Name:       ${name}`);
  console.log(`  Tier:       ${tier}`);
  console.log(`  Rate limit: ${rateMax} requests / ${windowMs / 1000}s`);
  console.log(`  Key hash:   ${keyHash}`);
  console.log("");
  console.log(`  API Key:    ${rawKey}`);
  console.log("");
  console.log("  ⚠  Save this key now — it cannot be retrieved later.");
  console.log("  The user should send it as: Authorization: Bearer " + rawKey);
  console.log("");
}

function listKeys(args, namespaceId, locationArgs) {
  const output = wranglerList(namespaceId, locationArgs);

  let keys;
  try {
    keys = JSON.parse(output);
  } catch {
    console.log("No keys found or could not parse response.");
    return;
  }

  const apiKeys = keys.filter((k) => k.name.startsWith("key:"));
  if (apiKeys.length === 0) {
    console.log("No API keys found.");
    return;
  }

  console.log(`\nFound ${apiKeys.length} API key(s):\n`);

  for (const entry of apiKeys) {
    const hash = entry.name.replace("key:", "");
    const maskedHash =
      hash.length > 10 ? `${hash.slice(0, 6)}...${hash.slice(-4)}` : "[redacted]";
    try {
      const value = wranglerGet(`key:${hash}`, namespaceId, locationArgs);
      const record = JSON.parse(value);
      const status = record.active === false ? "REVOKED" : "ACTIVE";
      console.log(`  [${status}] ${record.name ?? "unknown"}`);
      console.log(`    Hash:       ${maskedHash}`);
      console.log(`    Tier:       ${record.tier ?? "free"}`);
      console.log(`    Rate limit: ${record.rateLimit?.max ?? "?"} / ${(record.rateLimit?.windowMs ?? 60000) / 1000}s`);
      console.log(`    Created:    ${record.createdAt ?? "?"}`);
      console.log("");
    } catch {
      console.log(`  [?] ${hash} — could not read record`);
    }
  }
}

function revokeKey(args, namespaceId, locationArgs) {
  const keyHash = args["key-hash"];
  if (!keyHash) {
    console.error("Error: --key-hash is required.\n  Example: node scripts/manage-api-keys.mjs revoke --key-hash abc123...");
    process.exit(1);
  }

  const record = readKeyRecord(keyHash, namespaceId, locationArgs);

  record.active = false;
  record.revokedAt = new Date().toISOString();

  wranglerPut(`key:${keyHash}`, JSON.stringify(record), namespaceId, locationArgs);
  console.log(`\n  Key "${record.name}" has been revoked.\n`);
}

function updateKey(args, namespaceId, locationArgs) {
  const keyHash = args["key-hash"];
  if (!keyHash) {
    console.error("Error: --key-hash is required.\n  Example: node scripts/manage-api-keys.mjs update --key-hash abc123... --tier pro");
    process.exit(1);
  }

  const record = readKeyRecord(keyHash, namespaceId, locationArgs);
  const previous = JSON.parse(JSON.stringify(record));

  if (args.name) {
    record.name = String(args.name).trim();
  }

  if (args.tier) {
    record.tier = String(args.tier).trim();
  }

  if (args["rate-limit"] !== undefined || args["rate-window-ms"] !== undefined) {
    const nextMax = parseInt(args["rate-limit"] ?? String(record.rateLimit?.max ?? 100), 10);
    const nextWindowMs = parseInt(args["rate-window-ms"] ?? String(record.rateLimit?.windowMs ?? 60000), 10);

    if (!Number.isFinite(nextMax) || nextMax <= 0) {
      console.error("Error: --rate-limit must be a positive integer.");
      process.exit(1);
    }

    if (!Number.isFinite(nextWindowMs) || nextWindowMs <= 0) {
      console.error("Error: --rate-window-ms must be a positive integer.");
      process.exit(1);
    }

    record.rateLimit = {
      max: nextMax,
      windowMs: nextWindowMs
    };
  }

  const nextActive = parseBooleanArg(args.active, "active");
  if (nextActive !== undefined) {
    record.active = nextActive;
    if (nextActive) {
      delete record.revokedAt;
    } else {
      record.revokedAt = new Date().toISOString();
    }
  }

  record.updatedAt = new Date().toISOString();

  wranglerPut(`key:${keyHash}`, JSON.stringify(record), namespaceId, locationArgs);

  console.log("");
  console.log("=== API Key Updated ===");
  console.log("");
  console.log(`  Hash:       ${keyHash}`);
  console.log(`  Name:       ${previous.name ?? "unknown"} -> ${record.name ?? "unknown"}`);
  console.log(`  Tier:       ${previous.tier ?? "free"} -> ${record.tier ?? "free"}`);
  console.log(
    `  Rate limit: ${previous.rateLimit?.max ?? "?"} / ${Math.floor((previous.rateLimit?.windowMs ?? 60000) / 1000)}s -> ` +
    `${record.rateLimit?.max ?? "?"} / ${Math.floor((record.rateLimit?.windowMs ?? 60000) / 1000)}s`
  );
  console.log(`  Active:     ${previous.active !== false} -> ${record.active !== false}`);
  console.log("");
}

function deleteKey(args, namespaceId, locationArgs) {
  const keyHash = args["key-hash"];
  if (!keyHash) {
    console.error("Error: --key-hash is required.\n  Example: node scripts/manage-api-keys.mjs delete --key-hash abc123...");
    process.exit(1);
  }

  const record = readKeyRecord(keyHash, namespaceId, locationArgs);
  wranglerDelete(`key:${keyHash}`, namespaceId, locationArgs);
  console.log(`\n  Key "${record.name}" has been deleted.\n`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const args = parseArgs(process.argv.slice(2));
const command = args._positional[0];
const namespaceId = args["namespace-id"] ?? DEFAULT_KV_NAMESPACE_ID;
const locationArgs = resolveLocationArgs(args);

if (!namespaceId) {
  console.error(
    "Error: KV namespace ID is required.\n" +
    "  Either set KV_NAMESPACE_ID env var, edit DEFAULT_KV_NAMESPACE_ID in this script,\n" +
    "  or pass --namespace-id <id>.\n\n" +
    "  To create a namespace:\n" +
    "    npx wrangler kv namespace create API_KEYS"
  );
  process.exit(1);
}

switch (command) {
  case "create":
    createKey(args, namespaceId, locationArgs);
    break;
  case "list":
    listKeys(args, namespaceId, locationArgs);
    break;
  case "update":
    updateKey(args, namespaceId, locationArgs);
    break;
  case "revoke":
    revokeKey(args, namespaceId, locationArgs);
    break;
  case "delete":
    deleteKey(args, namespaceId, locationArgs);
    break;
  default:
    console.log(`
HydroGuide API Key Management

Usage:
  node scripts/manage-api-keys.mjs create --name "Company Name" [--tier pro] [--rate-limit 200]
  node scripts/manage-api-keys.mjs list
  node scripts/manage-api-keys.mjs update --key-hash <sha256> [--name "New Name"] [--tier pro] [--rate-limit 200] [--active true]
  node scripts/manage-api-keys.mjs revoke --key-hash <sha256>
  node scripts/manage-api-keys.mjs delete --key-hash <sha256>

Options:
  --namespace-id <id>    Cloudflare KV namespace ID (or set KV_NAMESPACE_ID env var)
  --name <name>          Name/label for the API key
  --tier <tier>          Tier: "free" (default) or "pro"
  --rate-limit <n>       Max requests per window (default: 100)
  --rate-window-ms <ms>  Rate limit window in ms (default: 60000)
  --active <bool>        true or false (update only)
  --local                Use local Wrangler KV state instead of remote Cloudflare KV
`);
    break;
}
