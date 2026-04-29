import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const targetDir = path.resolve(__dirname, "..", "src", "generated");
const targetPath = path.join(targetDir, "build-info.json");

async function main() {
  await mkdir(targetDir, { recursive: true });

  const updatedAt = process.env.BUILD_INFO_UPDATED_AT ?? new Date().toISOString();
  await writeFile(targetPath, `${JSON.stringify({ updatedAt }, null, 2)}\n`, "utf8");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
