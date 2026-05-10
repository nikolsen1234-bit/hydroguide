#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import html
import json
import re
import sys
import urllib.request
from html.parser import HTMLParser
from pathlib import Path


USER_AGENT = "HydroGuide local NVE corpus builder/1.0"
DEFAULT_MANIFEST = "tools/agent-bridge/knowledge/report-sources.manifest.json"
NOISE_LINES = {
    "Søk",
    "Meny",
    "Forside",
    "English",
    "Kontakt oss",
    "Om NVE",
    "Om nettstedet",
    "RME",
    "Gå til hovedinnhold",
    "Verktøylinje",
    "Innholdsfortegnelse",
    "Skriv ut"
}


class TextExtractor(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.parts: list[str] = []
        self.skip_depth = 0

    def handle_starttag(self, tag: str, attrs) -> None:
        if tag in {"script", "style", "noscript", "svg"}:
            self.skip_depth += 1
            return
        if self.skip_depth:
            return
        if tag in {"h1", "h2", "h3", "h4", "p", "li", "tr", "br", "section", "article"}:
            self.parts.append("\n")

    def handle_endtag(self, tag: str) -> None:
        if tag in {"script", "style", "noscript", "svg"} and self.skip_depth:
            self.skip_depth -= 1
            return
        if self.skip_depth:
            return
        if tag in {"h1", "h2", "h3", "h4", "p", "li", "tr", "section", "article"}:
            self.parts.append("\n")

    def handle_data(self, data: str) -> None:
        if not self.skip_depth:
            self.parts.append(data)


def repo_root() -> Path:
    return Path(__file__).resolve().parents[3]


def normalize_text(value: str) -> str:
    value = html.unescape(value)
    value = value.replace("\x00", " ")
    value = value.replace("\u00ad", "")
    value = value.replace("\u2028", "\n").replace("\u2029", "\n")
    value = re.sub(r"[ \t\r\f\v]+", " ", value)
    value = re.sub(r"\n{3,}", "\n\n", value)
    return value.strip()


def clean_lines(value: str) -> str:
    lines = []
    for raw in normalize_text(value).splitlines():
        line = re.sub(r"\s+", " ", raw).strip()
        if len(line) < 3:
            continue
        if line in NOISE_LINES:
            continue
        if re.fullmatch(r"[\W_]+", line, flags=re.UNICODE):
            continue
        lines.append(line)
    return "\n".join(lines)


def looks_like_navigation_or_toc(text: str) -> bool:
    lower = text.casefold()
    if text.count("....") >= 6:
        return True
    if "søk i innholdsfortegnelse" in lower:
        return True
    if "søk i veilederen" in lower and "praktisk informasjon" in lower:
        return True
    return False


def cache_name(source: dict) -> str:
    suffix = ".pdf" if source["format"] == "pdf" else ".html"
    return f"{source['id']}{suffix}"


def download(url: str, target: Path, refresh: bool) -> None:
    if target.exists() and target.stat().st_size > 0 and not refresh:
        return
    target.parent.mkdir(parents=True, exist_ok=True)
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=60) as response:
        target.write_bytes(response.read())


def extract_pdf_pages(path: Path) -> list[tuple[str, str]]:
    try:
        import fitz  # type: ignore

        doc = fitz.open(path)
        return [(f"s. {index + 1}", clean_lines(page.get_text("text"))) for index, page in enumerate(doc)]
    except Exception:
        pass

    try:
        from pypdf import PdfReader  # type: ignore

        reader = PdfReader(str(path))
        return [(f"s. {index + 1}", clean_lines(page.extract_text() or "")) for index, page in enumerate(reader.pages)]
    except Exception as error:
        raise RuntimeError(f"Could not extract PDF text from {path}: {error}") from error


def trim_html_noise(text: str, source: dict) -> str:
    if source.get("authority") == "NVE":
        marker = str(source["title"]).split(":")[-1].strip()
        marker_index = text.rfind(marker)
        if marker_index >= 0:
            return text[marker_index:]

    if source.get("authority") == "Lovdata":
        title = str(source["title"]).split(":")[0].strip()
        marker_index = text.find(title)
        if marker_index >= 0:
            return text[marker_index:]

    return text


def extract_html_text(path: Path, source: dict) -> str:
    raw = path.read_text("utf-8", errors="replace")
    main_match = re.search(r"<main\b[^>]*>(.*?)</main>", raw, flags=re.IGNORECASE | re.DOTALL)
    body = main_match.group(1) if main_match else raw
    parser = TextExtractor()
    parser.feed(body)
    return trim_html_noise(clean_lines("".join(parser.parts)), source)


def should_keep(text: str, source: dict) -> bool:
    if looks_like_navigation_or_toc(text):
        return False
    required = source.get("mustContainAny") or []
    if not required:
        return True
    lower = text.casefold()
    return any(str(term).casefold() in lower for term in required)


def split_words(text: str, max_words: int, overlap_words: int, min_words: int) -> list[str]:
    words = text.split()
    if len(words) < min_words:
        return []
    if len(words) <= max_words:
        return [" ".join(words)]

    chunks = []
    step = max(1, max_words - overlap_words)
    for start in range(0, len(words), step):
        chunk_words = words[start:start + max_words]
        if len(chunk_words) < min_words:
            continue
        chunks.append(" ".join(chunk_words))
        if start + max_words >= len(words):
            break
    return chunks


def stable_chunk_id(source_id: str, locator: str, index: int, text: str) -> str:
    locator_slug = re.sub(r"[^a-z0-9]+", "-", locator.casefold()).strip("-") or "chunk"
    digest = hashlib.sha1(text.encode("utf-8")).hexdigest()[:8]
    return f"{source_id}.{locator_slug}.{index:02d}.{digest}"


def build_chunks(source: dict, cached_path: Path, max_words: int, overlap_words: int, min_words: int) -> list[dict]:
    if source["format"] == "pdf":
        units = extract_pdf_pages(cached_path)
    elif source["format"] == "html":
        units = [("nettside", extract_html_text(cached_path, source))]
    else:
        raise ValueError(f"Unsupported source format: {source['format']}")

    rows = []
    for locator, unit_text in units:
        if source["format"] == "pdf" and not should_keep(unit_text, source):
            continue
        for local_index, chunk_text in enumerate(split_words(unit_text, max_words, overlap_words, min_words), start=1):
            if not should_keep(chunk_text, source):
                continue
            rows.append({
                "id": stable_chunk_id(source["id"], locator, local_index, chunk_text),
                "category": source["category"],
                "tags": source.get("tags", []),
                "title": f"{source['title']} ({locator})",
                "text": chunk_text,
                "source": {
                    "title": source["title"],
                    "year": source["year"],
                    "type": source["type"],
                    "locator": locator,
                    "url": source["url"]
                }
            })
    return rows


def main() -> int:
    parser = argparse.ArgumentParser(description="Build HydroGuide report knowledge JSONL from official NVE/Lovdata sources.")
    parser.add_argument("--manifest", default=DEFAULT_MANIFEST)
    parser.add_argument("--refresh", action="store_true", help="Download source documents again even when cached.")
    args = parser.parse_args()

    root = repo_root()
    manifest_path = (root / args.manifest).resolve()
    manifest = json.loads(manifest_path.read_text("utf-8"))
    cache_dir = (root / manifest["sourceCacheDir"]).resolve()
    output_path = (root / manifest["generatedKnowledgePath"]).resolve()

    chunking = manifest.get("chunking", {})
    max_words = int(chunking.get("maxWords", 220))
    overlap_words = int(chunking.get("overlapWords", 35))
    min_words = int(chunking.get("minWords", 45))

    all_rows = []
    for source in manifest["sources"]:
        cached_path = cache_dir / cache_name(source)
        download(source["url"], cached_path, refresh=args.refresh)
        all_rows.extend(build_chunks(source, cached_path, max_words, overlap_words, min_words))

    if not all_rows:
        raise RuntimeError("No knowledge chunks were generated.")

    ids = [row["id"] for row in all_rows]
    if len(ids) != len(set(ids)):
        raise RuntimeError("Generated duplicate knowledge ids.")

    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("w", encoding="utf-8", newline="\n") as handle:
        for row in all_rows:
            handle.write(json.dumps(row, ensure_ascii=False, sort_keys=True) + "\n")

    print(json.dumps({
        "ok": True,
        "sources": len(manifest["sources"]),
        "chunks": len(all_rows),
        "outputPath": str(output_path),
        "cacheDir": str(cache_dir)
    }, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
