import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..", "..");
const sourceDir = process.argv[2] ? path.resolve(process.argv[2]) : null;
const outputDir = process.argv[3] ? path.resolve(process.argv[3]) : null;

if (!sourceDir || !outputDir) {
  console.error("Usage: node build-ai-search-corpus.mjs <source-dir> <output-dir>");
  process.exit(1);
}

const sourceSpecs = [
  {
    filename: "veileder2020_03.txt",
    sourceId: "veileder-3-2020",
    title: "Veileder 3-2020",
  },
  {
    filename: "retninglinjer-for-registrering-av-konsesjonspaalagte-minstevannfoeringer.txt",
    sourceId: "minstevannforing-2024",
    title: "Retningslinjer for registrering av konsesjonspaalagte minstevassforingar",
  },
  {
    filename: "retninglinjer-for-registrering-av-vannfoering-i-elv.txt",
    sourceId: "vannforing-i-elv-2024",
    title: "Retningslinjer for registrering av vannforing i elv",
  },
  {
    filename: "retningslinjer-for-hydrologiske-undersoekelser.txt",
    sourceId: "hydrologiske-undersokelser",
    title: "Retningslinjer for hydrologiske undersokelser",
  },
  {
    filename: "1_retn-datainnsending_20062016.txt",
    sourceId: "datainnsending-2016",
    title: "Retningslinjer for datainnsending",
  },
  {
    filename: "veiledning-for-etablering-av-paalagt-vannfoeringsstasjon (1).txt",
    sourceId: "paalagt-vannforingsstasjon-2024",
    title: "Veiledning for etablering av paalagt vannforingsstasjon",
  },
];

const topicMatchers = [
  { topic: "instrumentering", patterns: [/logger/i, /sensor/i, /kommunikasjon/i, /alarm/i] },
  { topic: "kalibrering", patterns: [/kalibrer/i, /kontrollmal/i, /verifik/i] },
  { topic: "rormaaling", patterns: [/ror/i, /ventil/i, /elektromagnet/i, /slipp/i] },
  { topic: "vassforing-i-elv", patterns: [/vannforing i elv/i, /open kanal/i, /overlop/i, /v-overlop/i] },
  { topic: "frost-og-is", patterns: [/frost/i, /is/i, /istilpass/i] },
  { topic: "energiforsyning", patterns: [/batteri/i, /sol/i, /reserve/i, /autonomi/i] },
  { topic: "rapportering", patterns: [/rapport/i, /datainnsending/i, /innsend/i] },
  { topic: "hydrologi", patterns: [/hydrolog/i, /minstevassfor/i, /vassdrag/i] },
];

function normalizeText(text) {
  return text
    .replace(/\u00a0/g, " ")
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function isNoiseParagraph(paragraph) {
  const text = paragraph.trim();
  if (!text) {
    return true;
  }

  if (/^\d+$/.test(text)) {
    return true;
  }

  if (/^side \d+$/i.test(text)) {
    return true;
  }

  if (/^https?:\/\//i.test(text)) {
    return true;
  }

  if (/^(nve|telefon|e-post|postboks|midi)[\s:]/i.test(text)) {
    return true;
  }

  if (/\.{5,}/.test(text)) {
    return true;
  }

  return false;
}

function isHeading(paragraph) {
  const text = paragraph.trim();
  if (!text || text.length > 120) {
    return false;
  }

  if (/^[0-9]+(\.[0-9]+)*\s+\S+/.test(text)) {
    return true;
  }

  if (!/[.!?]$/.test(text) && text.split(/\s+/).length <= 14) {
    return true;
  }

  return false;
}

function toParagraphs(rawText) {
  return normalizeText(rawText)
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.replace(/\n+/g, " ").replace(/\s+/g, " ").trim())
    .filter((paragraph) => paragraph && !isNoiseParagraph(paragraph));
}

function detectTopics(text) {
  const matches = [];

  for (const matcher of topicMatchers) {
    if (matcher.patterns.some((pattern) => pattern.test(text))) {
      matches.push(matcher.topic);
    }
  }

  return matches;
}

function chunkParagraphs(paragraphs) {
  const chunks = [];
  const minChars = 350;
  const maxChars = 1700;
  let currentHeading = "";
  let currentParagraphs = [];
  let currentLength = 0;

  const flush = () => {
    if (currentParagraphs.length === 0) {
      return;
    }

    chunks.push({
      heading: currentHeading,
      text: currentParagraphs.join("\n\n"),
    });
    currentParagraphs = [];
    currentLength = 0;
  };

  for (const paragraph of paragraphs) {
    if (isHeading(paragraph)) {
      if (currentLength >= minChars) {
        flush();
      }

      currentHeading = paragraph;
      continue;
    }

    const nextLength = currentLength + paragraph.length;
    if (currentLength >= minChars && nextLength > maxChars) {
      flush();
    }

    currentParagraphs.push(paragraph);
    currentLength += paragraph.length;
  }

  flush();
  return chunks;
}

function buildMarkdownDocument(spec, chunk, index) {
  const chunkId = `${spec.sourceId}-${String(index + 1).padStart(3, "0")}`;
  const headingLine = chunk.heading ? `## ${chunk.heading}\n\n` : "";

  return {
    chunkId,
    markdown: `# ${spec.title}\n\nSource ID: ${spec.sourceId}\nChunk ID: ${chunkId}\n\n${headingLine}${chunk.text}\n`,
    topicTags: detectTopics(chunk.text),
    charCount: chunk.text.length,
    section: chunk.heading || "",
  };
}

async function main() {
  await rm(outputDir, { recursive: true, force: true });
  await mkdir(outputDir, { recursive: true });

  const manifest = [];

  for (const spec of sourceSpecs) {
    const sourcePath = path.join(sourceDir, spec.filename);
    const sourceText = await readFile(sourcePath, "utf8");
    const paragraphs = toParagraphs(sourceText);
    const chunks = chunkParagraphs(paragraphs);
    const sourceOutputDir = path.join(outputDir, spec.sourceId);

    await mkdir(sourceOutputDir, { recursive: true });

    for (const [index, chunk] of chunks.entries()) {
      const doc = buildMarkdownDocument(spec, chunk, index);
      const relativePath = path.posix.join(spec.sourceId, `${doc.chunkId}.md`);
      const outputPath = path.join(sourceOutputDir, `${doc.chunkId}.md`);

      await writeFile(outputPath, doc.markdown, "utf8");

      manifest.push({
        chunkId: doc.chunkId,
        sourceId: spec.sourceId,
        title: spec.title,
        section: doc.section,
        topicTags: doc.topicTags,
        charCount: doc.charCount,
        relativePath,
      });
    }
  }

  await writeFile(
    path.join(outputDir, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8"
  );

  const summary = {
    documents: manifest.length,
    sources: sourceSpecs.length,
    outputDir,
  };

  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
