import { copyFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sourcePath = path.resolve(__dirname, "..", "src", "generated", "build-info.json");
const targetPath = path.resolve(__dirname, "..", "dist", "build-info.json");

await copyFile(sourcePath, targetPath);
