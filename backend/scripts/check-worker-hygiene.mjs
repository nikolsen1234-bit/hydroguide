import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..", "..");
const args = new Set(process.argv.slice(2));
const allFiles = args.has("--all");
const ci = args.has("--ci");
const changedMode = args.has("--changed");
const allowPrivateConfig = args.has("--allow-private-config");
const stagedMode = args.has("--staged") || (!allFiles && !changedMode);

const workerFilePatterns = [
  /^\.github\/workflows\/ci\.yml$/,
  /^\.github\/workflows\/cloudflare-workers\.yml$/,
  /^backend\/cloudflare\/.*\.wrangler\.jsonc$/,
  /^backend\/workers\//,
  /^backend\/scripts\/build-cloudflare-worker-config\.mjs$/,
  /^backend\/scripts\/check-worker-hygiene\.mjs$/,
  /^backend\/config\/cloudflare\.public\.json$/,
];

const generatedConfigPattern = /^backend\/cloudflare\/.*\.generated\.wrangler\.jsonc$/;
const privateConfigPaths = [".secrets", "backend/config/cloudflare.private.json"];
const privateConfigPath = "backend/config/cloudflare.private.json";

function fail(message) {
  console.error(message);
  process.exit(1);
}

function run(command, commandArgs, { quiet = false, allowFailure = false } = {}) {
  const result = spawnSync(command, commandArgs, {
    cwd: repoRoot,
    encoding: "utf8",
    shell: false,
  });

  if (!quiet && result.stdout) {
    process.stdout.write(result.stdout);
  }

  if (!quiet && result.stderr) {
    process.stderr.write(result.stderr);
  }

  if (result.error) {
    console.error(`Failed to run ${command}: ${result.error.message}`);
  }

  if (!allowFailure && result.status !== 0) {
    process.exit(result.status ?? 1);
  }

  return result;
}

function git(commandArgs, options = {}) {
  return run("git", commandArgs, { quiet: true, ...options });
}

function splitLines(value) {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim().replaceAll("\\", "/"))
    .filter(Boolean);
}

function getCandidateFiles() {
  if (allFiles) {
    return splitLines(git(["ls-files"]).stdout);
  }

  if (stagedMode) {
    return splitLines(git(["diff", "--name-only", "--cached"]).stdout);
  }

  return splitLines(git(["diff", "--name-only"]).stdout);
}

function hasWorkerChange(files) {
  return files.some((file) => workerFilePatterns.some((pattern) => pattern.test(file)));
}

function hasPrivateConfigChange(files) {
  return files.some((file) => privateConfigPaths.includes(file));
}

function checkPrivateConfig(files) {
  if (allowPrivateConfig || allFiles) {
    return;
  }

  const privateFiles = files.filter((file) => privateConfigPaths.includes(file));
  if (privateFiles.length === 0) {
    return;
  }

  fail(
    [
      "Private Cloudflare config is staged:",
      ...privateFiles.map((file) => `- ${file}`),
      "Keep generated/private deploy values local unless this commit explicitly rotates encrypted config.",
    ].join("\n"),
  );
}

function checkGeneratedConfigs(files) {
  const generatedFiles = files.filter((file) => generatedConfigPattern.test(file));
  const trackedGeneratedFiles = splitLines(git(["ls-files", "backend/cloudflare"]).stdout).filter((file) =>
    generatedConfigPattern.test(file),
  );

  const blockedFiles = [...new Set([...generatedFiles, ...trackedGeneratedFiles])];
  if (blockedFiles.length === 0) {
    return;
  }

  fail(
    [
      "Generated Wrangler deploy configs must stay out of git:",
      ...blockedFiles.map((file) => `- ${file}`),
      "Use backend/config/cloudflare.private.json locally and let the build script generate deploy configs.",
    ].join("\n"),
  );
}

function checkBranchIsNotBehindUpstream() {
  if (ci || allFiles) {
    return;
  }

  const upstream = git(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"], {
    allowFailure: true,
  }).stdout.trim();

  if (!upstream) {
    return;
  }

  const countResult = git(["rev-list", "--left-right", "--count", `${upstream}...HEAD`], {
    allowFailure: true,
  });

  if (countResult.status !== 0) {
    return;
  }

  const [behindRaw] = countResult.stdout.trim().split(/\s+/);
  const behind = Number.parseInt(behindRaw, 10);
  if (behind > 0) {
    fail(
      `Worker files are staged while this branch is ${behind} commit(s) behind ${upstream}. Fetch and merge/rebase main before committing Worker config changes.`,
    );
  }
}

function runConfigChecks() {
  run(process.execPath, ["backend/scripts/build-cloudflare-worker-config.mjs", "--check-public"]);

  const hasPrivateConfig = hasReadableJsonFile(privateConfigPath);
  const hasDeployConfigEnv = Boolean(
    process.env.CLOUDFLARE_ACCOUNT_ID ||
      process.env.KV_API_KEYS_NAMESPACE_ID ||
      process.env.KV_REPORT_RULES_NAMESPACE_ID ||
      process.env.MINIMUM_FLOW_BUCKET_NAME ||
      process.env.AI_REFERENCE_BUCKET_NAME ||
      process.env.ASSETS_BUCKET_NAME,
  );

  if (hasPrivateConfig || hasDeployConfigEnv) {
    run(process.execPath, ["backend/scripts/build-cloudflare-worker-config.mjs", "--check-deploy-config"]);
  } else {
    console.log("Skipping deploy-config check: no private Cloudflare config or deploy env values are available.");
  }
}

function hasReadableJsonFile(filePath) {
  const absolutePath = resolve(repoRoot, filePath);
  if (!existsSync(absolutePath)) {
    return false;
  }

  try {
    JSON.parse(readFileSync(absolutePath, "utf8"));
    return true;
  } catch {
    return false;
  }
}

const files = getCandidateFiles();
const relevant = allFiles || hasWorkerChange(files) || hasPrivateConfigChange(files);

if (!relevant) {
  console.log("No Worker config/source changes detected.");
  process.exit(0);
}

checkPrivateConfig(files);
checkGeneratedConfigs(files);
checkBranchIsNotBehindUpstream();
runConfigChecks();
console.log("Worker config hygiene checks passed.");
