import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const sourceDir = process.argv[2] ? path.resolve(process.argv[2]) : null;
const outputDir = process.argv[3] ? path.resolve(process.argv[3]) : null;

if (!sourceDir || !outputDir) {
  console.error("Usage: node build-ai-search-corpus.mjs <source-dir> <output-dir>");
  process.exit(1);
}

const NBSP_RE = / /g;
const CR_RE = /\r/g;
const TRAILING_SPACES_BEFORE_NL_RE = /[ \t]+\n/g;
const MULTI_BLANK_LINES_RE = /\n{3,}/g;
const ONLY_DIGITS_RE = /^\d+$/;
const SIDE_NUMBER_RE = /^side \d+$/i;
const URL_PREFIX_RE = /^https?:\/\//i;
const FOOTER_PREFIX_RE = /^(nve|telefon|e-post|postboks|midi)[\s:]/i;
const DOT_LEADER_RE = /\.{5,}/;
const SECTION_NUMBER_PREFIX_RE = /^[0-9]+(\.[0-9]+)*\s+\S+/;
const TERMINAL_PUNCT_RE = /[.!?]$/;
const PARAGRAPH_SPLIT_RE = /\n\s*\n/;
const NEWLINES_RE = /\n+/g;
const WHITESPACE_RE = /\s+/g;

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
    .replace(NBSP_RE, " ")
    .replace(CR_RE, "")
    .replace(TRAILING_SPACES_BEFORE_NL_RE, "\n")
    .replace(MULTI_BLANK_LINES_RE, "\n\n")
    .trim();
}

function isNoiseParagraph(paragraph) {
  const text = paragraph.trim();
  if (!text) {
    return true;
  }

  if (ONLY_DIGITS_RE.test(text)) {
    return true;
  }

  if (SIDE_NUMBER_RE.test(text)) {
    return true;
  }

  if (URL_PREFIX_RE.test(text)) {
    return true;
  }

  if (FOOTER_PREFIX_RE.test(text)) {
    return true;
  }

  if (DOT_LEADER_RE.test(text)) {
    return true;
  }

  return false;
}

function isHeading(paragraph) {
  const text = paragraph.trim();
  if (!text || text.length > 120) {
    return false;
  }

  if (SECTION_NUMBER_PREFIX_RE.test(text)) {
    return true;
  }

  if (!TERMINAL_PUNCT_RE.test(text) && text.split(WHITESPACE_RE).length <= 14) {
    return true;
  }

  return false;
}

function toParagraphs(rawText) {
  return normalizeText(rawText)
    .split(PARAGRAPH_SPLIT_RE)
    .map((paragraph) => paragraph.replace(NEWLINES_RE, " ").replace(WHITESPACE_RE, " ").trim())
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
