"""
Batch PDF pre-parser.

Single convert() call for all PDFs. Classifies each as good/bad/scanned.
Scanned PDFs get OCR via OpenDataLoader hybrid mode='full'.
"""
from __future__ import annotations

import json
import logging
import os
import re
import shutil
import tempfile
from pathlib import Path

from src.models import CACHE_DIR

logger = logging.getLogger(__name__)

CONTENT_TYPES = {"heading", "paragraph", "list", "table"}

RELEVANCE_RE = re.compile(
    r"minstevannf|minstevassf|vannslipp|vassslipp|skal\s+slippes"
    r"|pålegges|pålagt|fastsett|forbi\s+inntak|forbi\s+dam"
    r"|ikke\s+underskride|resten\s+av\s+året|i\s+perioden\s+\d"
    r"|i\s+tiden\s+\d|skal\s+haldast|vert\s+sleppt|l/s|m3/s",
    re.I,
)

HYBRID_LOG_PATH = CACHE_DIR.parent / "needs_hybrid.json"


def _json_cache_path(pdf_path: Path) -> Path:
    return pdf_path.with_suffix(pdf_path.suffix + ".elements.json")


def _configure_java() -> None:
    candidate = Path(os.environ.get("JAVA_HOME", ""))
    if candidate:
        java_exe = candidate / "bin" / "java.exe"
        if java_exe.exists():
            os.environ["JAVA_HOME"] = str(candidate)
            os.environ["PATH"] = str(candidate / "bin") + os.pathsep + os.environ.get("PATH", "")
            return
    raise RuntimeError("Java 21+ not found. Set JAVA_HOME.")


def _filter_elements(elements: list[dict]) -> str:
    relevant_indices = set()
    for i, el in enumerate(elements):
        content = el.get("content", "")
        if content and RELEVANCE_RE.search(content):
            relevant_indices.add(i)

    if not relevant_indices:
        parts = [el.get("content", "") for el in elements
                 if el.get("content") and el.get("type") in CONTENT_TYPES]
        return "\n\n".join(parts)

    kept = set()
    for i in relevant_indices:
        for k in range(max(0, i - 2), min(len(elements), i + 3)):
            kept.add(k)

    parts = []
    for i in sorted(kept):
        el = elements[i]
        content = el.get("content", "")
        if content and el.get("type") in CONTENT_TYPES:
            parts.append(content)
    return "\n\n".join(parts)


def classify_elements(elements: list[dict]) -> tuple[str, str]:
    """Classify parsed elements. Returns (classification, filtered_text).
    classification is one of: 'good', 'bad', 'scanned'.
    """
    is_digital = any(el.get("type") in CONTENT_TYPES for el in elements)
    if not is_digital:
        return "scanned", ""

    filtered = _filter_elements(elements)

    if not RELEVANCE_RE.search(filtered):
        return "bad", filtered
    return "good", filtered


def _ocr_scanned_pdfs(scanned_paths: list[Path], hybrid_url: str = "http://127.0.0.1:5002") -> dict[str, str]:
    """OCR scanned PDFs via OpenDataLoader hybrid.
    First pass: auto triage. Second pass: full mode on failures.
    Returns {pdf_path_str: extracted_text}.
    """
    import opendataloader_pdf

    if not scanned_paths:
        return {}

    def _run_hybrid(paths: list[Path], mode: str) -> dict[str, str]:
        out = {}
        with tempfile.TemporaryDirectory() as tmp:
            tmp_in = Path(tmp) / "input"
            tmp_out = Path(tmp) / "output"
            tmp_in.mkdir()
            tmp_out.mkdir()

            name_map = {}
            for pdf in paths:
                safe = pdf.name.replace(" ", "_")
                shutil.copy2(pdf, tmp_in / safe)
                name_map[safe] = pdf

            opendataloader_pdf.convert(
                input_path=[str(tmp_in)],
                output_dir=str(tmp_out),
                format="text",
                quiet=True,
                hybrid="docling-fast",
                hybrid_mode=mode,
                hybrid_url=hybrid_url,
                hybrid_fallback=True,
            )

            for safe_name, orig_path in name_map.items():
                stem = Path(safe_name).stem
                txt_match = None
                for tf in tmp_out.rglob("*.txt"):
                    if tf.stem == stem or tf.stem.startswith(stem):
                        txt_match = tf
                        break
                if txt_match:
                    out[str(orig_path)] = txt_match.read_text(encoding="utf-8", errors="replace")
                else:
                    out[str(orig_path)] = ""
        return out

    results = _run_hybrid(scanned_paths, "auto")

    failed = [p for p in scanned_paths if len(results.get(str(p), "").strip()) < 100]
    if failed:
        print(f"    {len(failed)} PDFs got <100 chars from auto, retrying with full...", flush=True)
        retry = _run_hybrid(failed, "full")
        results.update(retry)

    return results


def preparse_pdfs(pdf_paths: list[Path], hybrid_url: str = "http://127.0.0.1:5002") -> dict:
    """Parse a list of PDFs in a single convert() call.
    Scanned PDFs get OCR via OpenDataLoader hybrid mode='full'.
    Returns {pdf_path_str: {"classification": ..., "filtered_text": ..., "needs_hybrid": bool}}.
    """
    _configure_java()
    import opendataloader_pdf

    if not pdf_paths:
        return {}

    results = {}
    scanned_paths = []

    with tempfile.TemporaryDirectory() as tmp:
        tmp_in = Path(tmp) / "input"
        tmp_out = Path(tmp) / "output"
        tmp_in.mkdir()
        tmp_out.mkdir()

        name_map = {}
        for pdf in pdf_paths:
            safe = pdf.name.replace(" ", "_")
            shutil.copy2(pdf, tmp_in / safe)
            name_map[safe] = pdf

        opendataloader_pdf.convert(
            input_path=[str(tmp_in)],
            output_dir=str(tmp_out),
            format="json",
            quiet=True,
            reading_order="xycut",
            use_struct_tree=True,
        )

        json_files = {jf.stem: jf for jf in tmp_out.rglob("*.json")}

        for safe_name, orig_path in name_map.items():
            pdf_stem = Path(safe_name).stem
            jf = json_files.get(pdf_stem)
            if not jf:
                for k, v in json_files.items():
                    if k.startswith(pdf_stem):
                        jf = v
                        break

            if not jf:
                classification, filtered = "scanned", ""
            else:
                data = json.loads(jf.read_text(encoding="utf-8"))
                elements = data.get("kids", [])
                classification, filtered = classify_elements(elements)

            if classification == "scanned":
                scanned_paths.append(orig_path)

            needs_hybrid = classification == "bad"
            result = {
                "classification": classification,
                "is_digital": classification != "scanned",
                "filtered_text": filtered,
                "needs_hybrid": needs_hybrid,
            }
            cache_path = _json_cache_path(orig_path)
            cache_path.write_text(json.dumps(result, ensure_ascii=False), encoding="utf-8")
            results[str(orig_path)] = result

    if scanned_paths:
        print(f"  OCR on {len(scanned_paths)} scanned PDFs via hybrid full...", flush=True)
        ocr_results = _ocr_scanned_pdfs(scanned_paths, hybrid_url=hybrid_url)
        for pdf_path in scanned_paths:
            ocr_text = ocr_results.get(str(pdf_path), "")
            classification = "good" if ocr_text.strip() and RELEVANCE_RE.search(ocr_text) else "bad"
            result = {
                "classification": classification,
                "is_digital": False,
                "filtered_text": ocr_text,
                "needs_hybrid": False,
                "ocr": True,
            }
            cache_path = _json_cache_path(pdf_path)
            cache_path.write_text(json.dumps(result, ensure_ascii=False), encoding="utf-8")
            results[str(pdf_path)] = result
            print(f"    {pdf_path.name}: OCR {len(ocr_text)} chars, {classification}")

    return results


def load_preparse(pdf_cache_name: str) -> dict | None:
    """Load pre-parsed JSON for a cached PDF. Returns None if not pre-parsed."""
    pdf_path = CACHE_DIR / pdf_cache_name
    json_path = _json_cache_path(pdf_path)
    if not json_path.exists():
        return None
    return json.loads(json_path.read_text(encoding="utf-8"))


def append_hybrid_log(entries: list[dict]) -> None:
    """Append entries to needs_hybrid.json."""
    existing = []
    if HYBRID_LOG_PATH.exists():
        try:
            existing = json.loads(HYBRID_LOG_PATH.read_text(encoding="utf-8"))
        except Exception as exc:
            logger.debug("Could not read hybrid log %s: %s", HYBRID_LOG_PATH, exc)
    seen = {e["file"] for e in existing}
    for entry in entries:
        if entry["file"] not in seen:
            existing.append(entry)
            seen.add(entry["file"])
    HYBRID_LOG_PATH.write_text(json.dumps(existing, ensure_ascii=False, indent=2), encoding="utf-8")


def clear_hybrid_log() -> None:
    """Clear the hybrid log for a fresh run."""
    if HYBRID_LOG_PATH.exists():
        HYBRID_LOG_PATH.unlink()
