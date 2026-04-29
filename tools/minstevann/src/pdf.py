from __future__ import annotations

import json
import os
import re
import tempfile
from functools import lru_cache
from pathlib import Path
from urllib.error import URLError
from urllib.request import Request, urlopen

JAVA_CANDIDATES = [
    Path(os.environ.get("JAVA_HOME", "")),
]
DEFAULT_HYBRID_URL = os.environ.get("HG_ODL_HYBRID_URL", "http://127.0.0.1:5002")
DEFAULT_HYBRID_TIMEOUT_MS = os.environ.get("HG_ODL_HYBRID_TIMEOUT_MS")
ENABLE_HYBRID = os.environ.get("HG_ODL_ENABLE_HYBRID", "1") != "0"
ENABLE_FULL_RETRY = os.environ.get("HG_ODL_ENABLE_FULL_RETRY", "1") != "0"

RELEVANCE_RE = re.compile(
    r"minstevannf|minstevassf|vannslipp|vassslipp|skal\s+slippes"
    r"|pålegges|pålagt|fastsett|forbi\s+inntak|forbi\s+dam"
    r"|ikke\s+underskride|resten\s+av\s+året|i\s+perioden\s+\d"
    r"|i\s+tiden\s+\d|skal\s+haldast|vert\s+sleppt|l/s|m3/s",
    re.I,
)

CONTENT_TYPES = {"heading", "paragraph", "list", "table"}


def _configure_java() -> None:
    for candidate in JAVA_CANDIDATES:
        if not candidate:
            continue
        java_exe = candidate / "bin" / "java.exe"
        if java_exe.exists():
            os.environ["JAVA_HOME"] = str(candidate)
            os.environ["PATH"] = str(candidate / "bin") + os.pathsep + os.environ.get("PATH", "")
            return
    raise RuntimeError(
        "Java 21+ for OpenDataLoader was not found. Set JAVA_HOME or install the JDK."
    )


def _load_opendataloader_pdf():
    try:
        import opendataloader_pdf
    except ModuleNotFoundError as exc:
        raise RuntimeError(
            "Python package 'opendataloader-pdf' is missing in the active environment."
        ) from exc
    return opendataloader_pdf


def _clean_markdown(text: str) -> str:
    text = re.sub(r"^!\[[^\]]*\]\([^)]+\)\s*$", "", text, flags=re.MULTILINE)
    text = re.sub(r"\f+", "\n", text)
    text = re.sub(r"[ \t]+\n", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


@lru_cache(maxsize=4)
def _hybrid_server_healthy(base_url: str) -> bool:
    url = base_url.rstrip("/") + "/health"
    req = Request(url, headers={"User-Agent": "HydroGuide opendataloader probe"})
    try:
        with urlopen(req, timeout=5) as response:
            return response.status == 200
    except (OSError, URLError):
        return False


# ---------- JSON-based extraction (digital PDFs) ----------


def _extract_json(pdf_bytes: bytes, opendataloader_pdf) -> list[dict]:
    with tempfile.TemporaryDirectory() as tmp_dir:
        tmp_in = Path(tmp_dir) / "input.pdf"
        tmp_out = Path(tmp_dir) / "out"
        tmp_in.write_bytes(pdf_bytes)
        tmp_out.mkdir()

        opendataloader_pdf.convert(
            input_path=[str(tmp_in)],
            output_dir=str(tmp_out),
            format="json",
            quiet=True,
            reading_order="xycut",
            use_struct_tree=True,
        )
        json_files = sorted(tmp_out.rglob("*.json"))
        if not json_files:
            return []
        data = json.loads(json_files[0].read_text(encoding="utf-8"))
        return data.get("kids", [])


def _is_digital_pdf(elements: list[dict]) -> bool:
    return any(el.get("type") in CONTENT_TYPES for el in elements)


def _filter_relevant_elements(elements: list[dict]) -> str:
    relevant_indices = set()
    for i, el in enumerate(elements):
        content = el.get("content", "")
        if content and RELEVANCE_RE.search(content):
            relevant_indices.add(i)

    if not relevant_indices:
        parts = []
        for el in elements:
            content = el.get("content", "")
            if content and el.get("type") in CONTENT_TYPES:
                parts.append(content)
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


# ---------- Text-based extraction (scanned PDFs) ----------


def _quality_score(text: str) -> float:
    stripped = text.strip()
    if not stripped:
        return -10_000.0

    words = re.findall(r"\S+", stripped)
    letters = sum(ch.isalpha() for ch in stripped)
    weird = sum(stripped.count(ch) for ch in "�□■•")
    long_words = sum(1 for word in words if len(word) >= 26)
    merged_words = sum(
        1
        for word in words
        if re.search(r"[a-zæøå]{10,}[A-ZÆØÅ][a-zæøå]{3,}", word)
    )
    keyword_hits = len(
        re.findall(
            r"vann|minste|kraft|konsesjon|vilk|tillat|slipp|inntak|magasin|reglement|vedtak|sommer|vinter",
            stripped,
            re.I,
        )
    )
    alpha_ratio = letters / max(len(stripped), 1)
    return (
        min(len(stripped), 20_000) / 25.0
        + keyword_hits * 6.0
        + alpha_ratio * 100.0
        - long_words * 10.0
        - merged_words * 25.0
        - weird * 12.0
    )


def _needs_ocr_retry(text: str) -> bool:
    stripped = text.strip()
    if len(stripped) < 600:
        return True
    return _quality_score(stripped) < 170.0


def _convert_pdf_to_text(
    pdf_bytes: bytes,
    opendataloader_pdf,
    *,
    hybrid_mode: str | None = None,
    hybrid_url: str | None = None,
) -> str:
    kwargs = {
        "format": "text",
        "quiet": True,
        "keep_line_breaks": True,
        "replace_invalid_chars": " ",
        "reading_order": "xycut",
    }
    if hybrid_mode:
        kwargs["hybrid"] = "docling-fast"
        kwargs["hybrid_mode"] = hybrid_mode
        kwargs["hybrid_url"] = hybrid_url or DEFAULT_HYBRID_URL
        if DEFAULT_HYBRID_TIMEOUT_MS:
            kwargs["hybrid_timeout"] = DEFAULT_HYBRID_TIMEOUT_MS

    with tempfile.TemporaryDirectory() as tmp_dir:
        tmp_in = Path(tmp_dir) / "input.pdf"
        tmp_out = Path(tmp_dir) / "out"
        tmp_in.write_bytes(pdf_bytes)
        tmp_out.mkdir(parents=True, exist_ok=True)

        try:
            opendataloader_pdf.convert(
                input_path=[str(tmp_in)],
                output_dir=str(tmp_out),
                **kwargs,
            )
        except FileNotFoundError as exc:
            raise RuntimeError(
                "OpenDataLoader tried to call an external dependency that is not available."
            ) from exc

        text_files = sorted(tmp_out.rglob("*.txt"))
        if not text_files:
            raise RuntimeError("OpenDataLoader produced no text output.")

        text = text_files[0].read_text(encoding="utf-8", errors="replace")
        return _clean_markdown(text)


def _text_extract(pdf_bytes: bytes) -> str:
    _configure_java()
    opendataloader_pdf = _load_opendataloader_pdf()

    plain_text = _convert_pdf_to_text(pdf_bytes, opendataloader_pdf)
    candidates = [plain_text]

    if ENABLE_HYBRID and _needs_ocr_retry(plain_text) and _hybrid_server_healthy(DEFAULT_HYBRID_URL):
        hybrid_auto = _convert_pdf_to_text(
            pdf_bytes,
            opendataloader_pdf,
            hybrid_mode="auto",
            hybrid_url=DEFAULT_HYBRID_URL,
        )
        candidates.append(hybrid_auto)

        best_score = max(_quality_score(candidate) for candidate in candidates)
        if ENABLE_FULL_RETRY and best_score < 170.0:
            hybrid_full = _convert_pdf_to_text(
                pdf_bytes,
                opendataloader_pdf,
                hybrid_mode="full",
                hybrid_url=DEFAULT_HYBRID_URL,
            )
            candidates.append(hybrid_full)

    best_text = max(candidates, key=_quality_score)
    return _clean_markdown(best_text)


# ---------- OCR normalization ----------


def normalize_ocr_artefacts(text: str) -> str:
    if not text:
        return text
    t = text

    t = t.replace("Æ", "Æ").replace("Ø", "Ø").replace("Å", "Å")
    t = t.replace("æ", "æ").replace("ø", "ø").replace("å", "å")
    t = re.sub(r"å", "å", t)
    t = re.sub(r"Å", "Å", t)
    t = re.sub(r"\bvassforing\b", "vassføring", t, flags=re.I)
    t = re.sub(r"\bvannforing\b", "vannføring", t, flags=re.I)
    t = re.sub(r"\bminstevannforing\b", "minstevannføring", t, flags=re.I)
    t = re.sub(r"\bminstevassforing\b", "minstevassføring", t, flags=re.I)
    t = re.sub(r"\bminstevannforinga\b", "minstevannføringa", t, flags=re.I)
    t = re.sub(r"\bresten av aret\b", "resten av året", t, flags=re.I)
    t = re.sub(r"\bhele aret\b", "hele året", t, flags=re.I)
    t = re.sub(r"\blagvassforing\b", "lågvassføring", t, flags=re.I)
    t = re.sub(r"\bpalegges\b", "pålegges", t, flags=re.I)
    t = re.sub(r"\bpalagt\b", "pålagt", t, flags=re.I)
    t = re.sub(r"\bovre\b", "øvre", t, flags=re.I)
    t = re.sub(r"\bnedre\b", "nedre", t, flags=re.I)
    t = re.sub(r"\basedola\b", "Åsedøla", t, flags=re.I)

    t = re.sub(r"(\d)\s*1\s*/\s*s(ekund|ek)?\b", r"\1 l/s", t)
    t = re.sub(r"(\d)\s*1\s*/\s*5\b", r"\1 l/s", t)
    t = re.sub(r"(\d)\s*Vs\b", r"\1 l/s", t)
    t = re.sub(r"(\d)\s*V\s*/\s*s(ek)?\b", r"\1 l/s", t)
    t = re.sub(r"(\d)\s*us\b", r"\1 l/s", t, flags=re.I)
    t = re.sub(r"(\d)\s*lis\b", r"\1 l/s", t, flags=re.I)
    t = re.sub(r"(\d)\s*1is\b", r"\1 l/s", t)
    t = re.sub(r"(\b\d+)1/s(ek)?\b", r"\1 l/s", t)
    t = re.sub(r"\bm[*'`´]\s*/\s*s(ek)?\b", "m3/s", t)
    t = re.sub(r"\bmf\s*/\s*s(ek)?\b", "m3/s", t)
    t = re.sub(r"\bm3is\b", "m3/s", t)
    t = re.sub(r"\btn3/s\b", "m3/s", t, flags=re.I)
    t = re.sub(r"\bm\s*[2²]\s*/\s*s(ek(und)?)?\b", "m3/s", t)
    t = re.sub(r"\bm8\s*/\s*s(ek)?\b", "m3/s", t)

    def _lpm_to_lps(match):
        num_str = match.group(1).replace(",", ".")
        try:
            val_lpm = float(num_str)
            val_lps = val_lpm / 60.0
            if val_lps == int(val_lps):
                return f"{int(val_lps)} l/s"
            return f"{val_lps:.1f} l/s"
        except ValueError:
            return match.group(0)

    t = re.sub(
        r"(\d+(?:[.,]\d+)?)\s*(?:liter\s*(?:pr\.?|per)?\s*min(?:utt)?|l/min)",
        _lpm_to_lps,
        t,
        flags=re.I,
    )
    return t


# ---------- Main entry point ----------


def pdf_to_text(pdf_bytes: bytes, cache_name: str | None = None) -> tuple[str, bool]:
    """Returns (text, pre_filtered).

    When pre_filtered=True, the text has already been relevance-filtered
    via JSON element extraction — caller should skip snippet windowing.

    If cache_name is provided, checks for pre-parsed JSON cache first
    (no JVM needed).
    """
    if cache_name:
        from src.pdf_preparse import load_preparse
        cached = load_preparse(cache_name)
        if cached:
            if cached.get("classification") == "good" and cached.get("filtered_text"):
                return cached["filtered_text"], True
            if cached.get("needs_hybrid"):
                return "", False

    _configure_java()
    odl = _load_opendataloader_pdf()

    elements = _extract_json(pdf_bytes, odl)
    if _is_digital_pdf(elements):
        text = _filter_relevant_elements(elements)
        if text:
            return text, True

    text = _text_extract(pdf_bytes)
    return text, False
