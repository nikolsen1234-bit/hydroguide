import { cp, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND_ROOT = path.resolve(__dirname, "..");
const BACKEND_ROOT = path.resolve(__dirname, "..", "..", "backend");
const DIST_ROOT = path.join(FRONTEND_ROOT, "dist");
const TEST_ROOT = process.env.HYDROGUIDE_TEST_DIR || path.resolve(FRONTEND_ROOT, "..", "test-deploy");

const FUNCTION_ALLOWLIST = [
  "_middleware.js",
  "services/calculations/_calculationCore.js",
  "api/_apiUtils.js",
  "api/calculations.js",
  "api/docs.js",
  "api/keys/index.js",
  "api/_constants.js",
  "api/_edgeUtils.js",
  "api/health.js",
  "api/nveid.js",
  "api/place-suggestions.js",
  "api/terrain-profile.js",
  "api/pvgis-tmy.js",
  "api/polish-report.js"
];

await rm(TEST_ROOT, { recursive: true, force: true });
await cp(DIST_ROOT, TEST_ROOT, { recursive: true });

for (const relativePath of FUNCTION_ALLOWLIST) {
  const sourcePath = path.join(BACKEND_ROOT, relativePath);
  const targetPath = path.join(TEST_ROOT, "functions", relativePath);
  await mkdir(path.dirname(targetPath), { recursive: true });
  await cp(sourcePath, targetPath);
}

console.log(`Copied frontend dist/ and curated backend functions/ to ${TEST_ROOT}`);
