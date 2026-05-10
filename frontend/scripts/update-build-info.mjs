import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { makeWorkspaceTraceId } from "../../backend/scripts/check-trace-id.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const frontendRoot = path.resolve(__dirname, "..");
const targetDir = path.resolve(__dirname, "..", "src", "generated");
const targetPath = path.join(targetDir, "build-info.json");

async function main() {
  await mkdir(targetDir, { recursive: true });

  const updatedAt = process.env.BUILD_INFO_UPDATED_AT ?? new Date().toISOString();
  const siteTraceId = await makeWorkspaceTraceId(frontendRoot);
  await writeFile(targetPath, `${JSON.stringify({ updatedAt, siteTraceId }, null, 2)}\n`, "utf8");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
