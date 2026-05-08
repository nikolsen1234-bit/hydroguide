import { ensureVectorIndex } from "../lib/knowledge.mjs";
import { defaultConfig } from "../lib/pipeline.mjs";
import { spawnSync } from "node:child_process";

const config = defaultConfig();

function runChecked(command, args, failureMessage) {
  const result = spawnSync(command, args, {
    cwd: config.repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });
  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || result.stdout.trim() || failureMessage);
  }
  return result.stdout.trim();
}

function embeddingModelAlreadyLoaded() {
  const result = spawnSync("lms", ["ps"], {
    cwd: config.repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });
  return result.status === 0 && result.stdout.includes(config.embeddingsModel);
}

try {
  if (process.env.REPORT_SKIP_KNOWLEDGE_BUILD !== "1") {
    runChecked("python", ["tools/agent-bridge/scripts/build-knowledge.py"], "Knowledge build failed.");
  }

  if (process.env.REPORT_SKIP_LMSTUDIO_PRELOAD !== "1" && !embeddingModelAlreadyLoaded()) {
    runChecked("lms", [
      "load",
      config.embeddingsModel,
      "--gpu",
      process.env.LMSTUDIO_EMBEDDINGS_GPU ?? "max",
      "--context-length",
      process.env.LMSTUDIO_EMBEDDINGS_CONTEXT ?? "512",
      "--parallel",
      process.env.LMSTUDIO_EMBEDDINGS_PARALLEL ?? "1",
      "--ttl",
      process.env.LMSTUDIO_EMBEDDINGS_TTL ?? "3600",
      "--identifier",
      config.embeddingsModel,
      "-y"
    ], "LM Studio embedding model preload failed.");
  }

  const result = await ensureVectorIndex({
    knowledgePath: config.knowledgePath,
    indexPath: config.indexPath,
    embeddingsBaseUrl: config.embeddingsBaseUrl,
    embeddingsModel: config.embeddingsModel,
    embeddingsApiKey: config.embeddingsApiKey
  });

  console.log(JSON.stringify({
    ok: true,
    rebuilt: result.rebuilt,
    chunks: result.knowledge.chunks.length,
    indexPath: config.indexPath,
    embeddingsModel: config.embeddingsModel
  }, null, 2));
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
