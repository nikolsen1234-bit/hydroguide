import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, "..", "..");

const privateConfigPath = resolve(rootDir, "backend/config/cloudflare.private.json");
const publicConfigPath = resolve(rootDir, "backend/config/cloudflare.public.json");

const workers = [
  {
    key: "api_worker",
    description: "hydroguide-api serves the public API and frontend data helper routes.",
    sourcePath: "backend/cloudflare/api.wrangler.jsonc",
    generatedPath: "backend/cloudflare/api.generated.wrangler.jsonc",
    placeholders: {
      REPLACE_WITH_KV_API_KEYS_NAMESPACE_ID: "KV_API_KEYS_NAMESPACE_ID",
    },
    requiredSecrets: ["API_KEY_HASH_SECRET"],
  },
  {
    key: "ai_worker",
    description: "hydroguide-ai is the internal report AI worker. It has no public route.",
    sourcePath: "backend/cloudflare/ai.wrangler.jsonc",
    generatedPath: "backend/cloudflare/ai.generated.wrangler.jsonc",
    placeholders: {
      REPLACE_WITH_ACCOUNT_ID: "CLOUDFLARE_ACCOUNT_ID",
      REPLACE_WITH_KV_REPORT_RULES_NAMESPACE_ID: "KV_REPORT_RULES_NAMESPACE_ID",
    },
    requiredSecrets: ["REPORT_WORKER_TOKEN", "AI_GATEWAY_AUTH_TOKEN", "AI_SEARCH_API_TOKEN"],
  },
  {
    key: "report_worker",
    description: "hydroguide-report receives /api/report requests and calls hydroguide-ai through a service binding.",
    sourcePath: "backend/cloudflare/report.wrangler.jsonc",
    generatedPath: "backend/cloudflare/report.generated.wrangler.jsonc",
    placeholders: {},
    requiredSecrets: ["REPORT_ACCESS_CODE_HASH", "REPORT_WORKER_TOKEN"],
  },
  {
    key: "admin_worker",
    description: "hydroguide-admin keeps API key management out of the public API.",
    sourcePath: "backend/cloudflare/admin.wrangler.jsonc",
    generatedPath: "backend/cloudflare/admin.generated.wrangler.jsonc",
    placeholders: {
      REPLACE_WITH_KV_API_KEYS_NAMESPACE_ID: "KV_API_KEYS_NAMESPACE_ID",
    },
    requiredSecrets: ["ADMIN_TOKEN", "API_KEY_HASH_SECRET"],
  },
];

const deployRequiredNames = [
  "CLOUDFLARE_ACCOUNT_ID",
  "CLOUDFLARE_API_TOKEN",
  "KV_API_KEYS_NAMESPACE_ID",
  "KV_REPORT_RULES_NAMESPACE_ID",
];

const deployConfigRequiredNames = [
  "CLOUDFLARE_ACCOUNT_ID",
  "KV_API_KEYS_NAMESPACE_ID",
  "KV_REPORT_RULES_NAMESPACE_ID",
];

const omitValues = new Set(["", "OMIT", "REPLACE_ME"]);

function usage() {
  console.log(`Usage:
  node backend/scripts/build-cloudflare-worker-config.mjs --write-public
  node backend/scripts/build-cloudflare-worker-config.mjs --check-public
  node backend/scripts/build-cloudflare-worker-config.mjs --check-deploy-config
  node backend/scripts/build-cloudflare-worker-config.mjs --write-deploy-config
  node backend/scripts/build-cloudflare-worker-config.mjs --deploy-preflight

Values are read from environment variables first, then from backend/config/cloudflare.private.json.
The private file is intended to be git-crypt encrypted.`);
}

function stripJsonc(text) {
  let output = "";
  let inString = false;
  let quote = "";
  let escaped = false;
  let inLineComment = false;
  let inBlockComment = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (inLineComment) {
      if (char === "\n" || char === "\r") {
        inLineComment = false;
        output += char;
      }
      continue;
    }

    if (inBlockComment) {
      if (char === "*" && next === "/") {
        inBlockComment = false;
        i += 1;
      }
      continue;
    }

    if (inString) {
      output += char;
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === quote) {
        inString = false;
        quote = "";
      }
      continue;
    }

    if (char === "\"" || char === "'") {
      inString = true;
      quote = char;
      output += char;
      continue;
    }

    if (char === "/" && next === "/") {
      inLineComment = true;
      i += 1;
      continue;
    }

    if (char === "/" && next === "*") {
      inBlockComment = true;
      i += 1;
      continue;
    }

    output += char;
  }

  return output.replace(/,\s*([}\]])/g, "$1");
}

function readJsonc(relativePath) {
  const absolutePath = resolve(rootDir, relativePath);
  return JSON.parse(stripJsonc(readFileSync(absolutePath, "utf8")));
}

function readPrivateValues() {
  if (!existsSync(privateConfigPath)) {
    return {};
  }

  const text = readFileSync(privateConfigPath, "utf8");
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    if (text.includes("GITCRYPT")) {
      return {};
    }

    throw error;
  }

  return parsed.cloudflare && typeof parsed.cloudflare === "object" ? parsed.cloudflare : {};
}

function isRealValue(value) {
  return typeof value === "string" && !omitValues.has(value.trim()) && !value.startsWith("REPLACE_WITH_");
}

function resolveValues(privateValues) {
  const values = {};
  for (const name of deployRequiredNames) {
    const envValue = process.env[name];
    const privateValue = privateValues[name];
    if (isRealValue(envValue)) {
      values[name] = envValue;
    } else if (isRealValue(privateValue)) {
      values[name] = privateValue;
    }
  }
  return values;
}

function replacePlaceholders(value, placeholderMap, values, missing) {
  if (typeof value === "string") {
    let nextValue = value;
    for (const [placeholder, valueName] of Object.entries(placeholderMap)) {
      if (!nextValue.includes(placeholder)) {
        continue;
      }

      if (!values[valueName]) {
        missing.add(valueName);
        continue;
      }

      nextValue = nextValue.replaceAll(placeholder, values[valueName]);
    }
    return nextValue;
  }

  if (Array.isArray(value)) {
    return value.map((item) => replacePlaceholders(item, placeholderMap, values, missing));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        replacePlaceholders(item, placeholderMap, values, missing),
      ]),
    );
  }

  return value;
}

function buildDeployConfig(worker, values) {
  const config = readJsonc(worker.sourcePath);
  const missing = new Set();
  const resolved = replacePlaceholders(config, worker.placeholders, values, missing);

  if (values.CLOUDFLARE_ACCOUNT_ID) {
    resolved.account_id = values.CLOUDFLARE_ACCOUNT_ID;
  }

  return { config: resolved, missing: Array.from(missing).sort() };
}

function ensureParentDir(filePath) {
  mkdirSync(dirname(filePath), { recursive: true });
}

function writeJson(relativePath, data) {
  const absolutePath = resolve(rootDir, relativePath);
  ensureParentDir(absolutePath);
  writeFileSync(absolutePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function redactValue(key, value) {
  if (value == null) {
    return value;
  }

  if (
    /^id$/i.test(key) ||
    /^store_id$/i.test(key) ||
    /account_id$/i.test(key) ||
    /namespace_id$/i.test(key) ||
    /(token|secret|password|hash)/i.test(key)
  ) {
    return "OMIT";
  }

  if (typeof value === "string" && value.startsWith("REPLACE_WITH_")) {
    return "OMIT";
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactValue(key, item));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([childKey, childValue]) => [
      childKey,
      redactValue(childKey, childValue),
    ]));
  }

  return value;
}

function summarizeWorker(worker) {
  const config = readJsonc(worker.sourcePath);
  const bindingSummary = {};

  if (config.kv_namespaces) {
    bindingSummary.kv_namespaces = config.kv_namespaces.map((binding) => ({
      binding: binding.binding,
      id: "OMIT",
      remote: binding.remote ?? false,
    }));
  }

  if (config.r2_buckets) {
    bindingSummary.r2_buckets = config.r2_buckets.map((binding) => ({
      binding: binding.binding,
      bucket_name: binding.bucket_name,
    }));
  }

  if (config.ai) {
    bindingSummary.ai = {
      binding: config.ai.binding,
      remote: config.ai.remote ?? false,
    };
  }

  if (config.secrets_store_secrets) {
    bindingSummary.secrets_store_secrets = config.secrets_store_secrets.map((binding) => ({
      binding: binding.binding,
      store_id: "OMIT",
      secret_name: binding.secret_name,
    }));
  }

  if (config.services) {
    bindingSummary.services = config.services.map((binding) => ({
      binding: binding.binding,
      service: binding.service,
      entrypoint: binding.entrypoint,
    }));
  }

  if (config.vars) {
    bindingSummary.vars = redactValue("vars", config.vars);
  }

  return {
    key: worker.key,
    name: config.name,
    description: worker.description,
    source_config: worker.sourcePath,
    generated_deploy_config: worker.generatedPath,
    main: config.main,
    compatibility_date: config.compatibility_date,
    workers_dev: config.workers_dev ?? null,
    observability: config.observability,
    routes: config.routes ?? [],
    bindings: bindingSummary,
    required_secrets: worker.requiredSecrets ?? [],
  };
}

function buildPublicConfig() {
  return {
    note: "Public, redacted Cloudflare Worker configuration for HydroGuide. Real account IDs, namespace IDs, API tokens and secret values are omitted.",
    generated_by: "backend/scripts/build-cloudflare-worker-config.mjs",
    private_config: "backend/config/cloudflare.private.json (git-crypt)",
    cloudflare_build_values: deployConfigRequiredNames,
    local_deploy_values: deployRequiredNames,
    deploy_secret_sources: ["Cloudflare Workers Builds", "Cloudflare Secrets Store", "local .secrets"],
    workers: workers.map(summarizeWorker),
  };
}

function normalizeJson(data) {
  return `${JSON.stringify(data, null, 2)}\n`;
}

function writePublic() {
  writeFileSync(publicConfigPath, normalizeJson(buildPublicConfig()), "utf8");
  console.log(`Wrote ${relative(rootDir, publicConfigPath)}`);
}

function checkPublic() {
  const expected = normalizeJson(buildPublicConfig());
  if (!existsSync(publicConfigPath)) {
    throw new Error(`${relative(rootDir, publicConfigPath)} does not exist. Run with --write-public.`);
  }

  const actual = readFileSync(publicConfigPath, "utf8");
  if (actual !== expected) {
    throw new Error(`${relative(rootDir, publicConfigPath)} is stale. Run with --write-public.`);
  }

  console.log(`${relative(rootDir, publicConfigPath)} is current.`);
}

function writeDeployConfigs(values) {
  const allMissing = new Set();

  for (const worker of workers) {
    const { config, missing } = buildDeployConfig(worker, values);
    for (const valueName of missing) {
      allMissing.add(valueName);
    }

    writeJson(worker.generatedPath, config);
    console.log(`Wrote ${worker.generatedPath}`);
  }

  if (allMissing.size > 0) {
    throw new Error(`Missing Cloudflare values for generated deploy config: ${Array.from(allMissing).sort().join(", ")}`);
  }
}

function checkDeployConfigs(values) {
  assertDeployConfigEnv(values);

  for (const worker of workers) {
    const { missing } = buildDeployConfig(worker, values);
    if (missing.length > 0) {
      throw new Error(`Missing Cloudflare values for ${worker.sourcePath}: ${missing.join(", ")}`);
    }
  }

  console.log("Generated Cloudflare deploy configs can be built.");
}

function assertDeployEnv(values) {
  const missing = deployRequiredNames.filter((name) => !values[name]);
  if (missing.length > 0) {
    throw new Error(`Missing Cloudflare deploy values: ${missing.join(", ")}`);
  }
}

function assertDeployConfigEnv(values) {
  const missing = deployConfigRequiredNames.filter((name) => !values[name]);
  if (missing.length > 0) {
    throw new Error(`Missing Cloudflare config values: ${missing.join(", ")}`);
  }
}

function main() {
  const args = new Set(process.argv.slice(2));
  if (args.size === 0 || args.has("--help")) {
    usage();
    return;
  }

  const needsDeployValues =
    args.has("--deploy-preflight") || args.has("--check-deploy-config") || args.has("--write-deploy-config");
  const privateValues = needsDeployValues ? readPrivateValues() : {};
  const values = needsDeployValues ? resolveValues(privateValues) : {};

  if (args.has("--deploy-preflight")) {
    assertDeployEnv(values);
    console.log("Cloudflare deploy values are present.");
  }

  if (args.has("--write-public")) {
    writePublic();
  }

  if (args.has("--check-public")) {
    checkPublic();
  }

  if (args.has("--check-deploy-config")) {
    checkDeployConfigs(values);
  }

  if (args.has("--write-deploy-config")) {
    assertDeployConfigEnv(values);
    writeDeployConfigs(values);
  }
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
