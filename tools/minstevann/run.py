"""
Minstevann extraction pipeline - single entry point.

Usage:
    python tools/minstevann/run.py plant 1696
    python tools/minstevann/run.py plant 1696,2034 2450
    python tools/minstevann/run.py batch --n 10
"""
from __future__ import annotations

import argparse
import json
import random
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path
from textwrap import dedent

from src.models import (
    NveidResult, DEFAULT_MODEL, DEFAULT_OLLAMA_HOST,
    CACHE_DIR, KONSESJON_URL,
)
from src.scraper import (
    cached_get, parse_konsesjon_html, rank_attachment,
    score_attachment_text, score_case_candidate,
    load_case_id_lookup, resolve_case_ids,
    fetch_plants_from_nve_ids, fetch_all_plants,
)
from src.pdf import pdf_to_text, DEFAULT_HYBRID_URL
from src.snippet import find_relevant_window, extract_inntak_inventory
from src.llm import extract_with_llm, OllamaError
from src.assembly import assemble_inntak_from_claims
from src.report import format_report
from src.pdf_preparse import preparse_pdfs, load_preparse
from src.minimumflow_db import load_minimumflow_db, save_minimumflow_db, write_station_result


# ---------- Selection helpers ----------


def choose_batch(plants: list[dict], used_nve_ids: set[int], n: int, seed: int) -> list[dict]:
    candidates = [plant for plant in plants if plant["nveId"] not in used_nve_ids]
    rng = random.Random(seed)
    rng.shuffle(candidates)
    return candidates[:n]


def _download_station_pdfs(nve_id: int, resolved_kdb_nr: int, navn: str) -> dict:
    """Download NVE konsesjonssak HTML + PDF attachments for one station.

    Returns {"res": NveidResult, "pdf_files": [cache_name_strings],
             "ranked_atts": [attachment_dicts]}.
    """
    res = NveidResult(
        nveId=nve_id,
        source_kdb_nr=resolved_kdb_nr,
        navn=navn,
        konsesjon_url="",
    )
    pdf_files: list[str] = []
    ranked_atts: list[dict] = []

    try:
        case_ids = resolve_case_ids(resolved_kdb_nr, load_case_id_lookup())
        parsed = None
        best_score = -10_000
        best_case_id = None
        best_case_url = ""

        for case_id in case_ids:
            candidate_url = KONSESJON_URL.format(id=case_id)
            html = cached_get(candidate_url, f"kons_{resolved_kdb_nr}_{case_id}.html")
            if isinstance(html, bytes):
                html = html.decode("utf-8", errors="replace")
            candidate = parse_konsesjon_html(html)
            score = score_case_candidate(candidate, kdb_nr=resolved_kdb_nr, plant_name=navn)
            if score > best_score:
                best_score = score
                parsed = candidate
                best_case_id = case_id
                best_case_url = candidate_url

        if parsed is None:
            fallback_case_id = case_ids[0]
            res.case_id = fallback_case_id
            res.konsesjon_url = KONSESJON_URL.format(id=fallback_case_id)
            html = cached_get(res.konsesjon_url, f"kons_{resolved_kdb_nr}_{fallback_case_id}.html")
            if isinstance(html, bytes):
                html = html.decode("utf-8", errors="replace")
            parsed = parse_konsesjon_html(html)
        else:
            res.case_id = best_case_id
            res.konsesjon_url = best_case_url

        res.fritekst_summary = parsed["fritekst"]

        ranked = sorted(
            parsed["attachments"],
            key=lambda a: rank_attachment(a["title"], plant_name=navn),
            reverse=True,
        )
        ranked = [a for a in ranked if rank_attachment(a["title"], plant_name=navn) > 0]

        for att in ranked[:4]:
            fn = f"pdf_{resolved_kdb_nr}_{att['url'].rsplit('/', 1)[-1]}.pdf"
            try:
                pdf_bytes = cached_get(att["url"], fn, as_bytes=True)
                if isinstance(pdf_bytes, str):
                    pdf_bytes = pdf_bytes.encode("utf-8")
                # Write to cache so preparse can find the file
                cache_path = CACHE_DIR / fn
                if not cache_path.exists():
                    cache_path.write_bytes(pdf_bytes)
                pdf_files.append(fn)
                ranked_atts.append(att)
            except Exception as e:
                res.attachments_tried.append({
                    "title": att["title"],
                    "url": att["url"],
                    "error": str(e),
                })

        if not ranked:
            res.llm_result = {"funnet": False, "grunn": "ingen digitaliserte vedlegg"}
    except Exception as e:
        res.error = f"{type(e).__name__}: {e}"

    return {"res": res, "pdf_files": pdf_files, "ranked_atts": ranked_atts}


def _run_ollama_on_station(
    download_info: dict,
    model: str,
    host: str,
    use_cache: bool,
) -> tuple[NveidResult, dict | None]:
    """Run Ollama extraction on a downloaded station.

    Reads preparse cache for each PDF, picks the best attachment,
    runs snippet windowing if not pre_filtered, calls Ollama.
    Skips PDFs marked needs_hybrid.
    Returns (NveidResult, assembled_dict_or_None).
    """
    from src.pdf import normalize_ocr_artefacts

    res: NveidResult = download_info["res"]
    pdf_files: list[str] = download_info["pdf_files"]
    ranked_atts: list[dict] = download_info["ranked_atts"]
    navn = res.navn

    if res.llm_result is not None:
        # Already has a result (e.g. "ingen digitaliserte vedlegg")
        return res, None
    if res.error:
        return res, None

    best_attachment_score = -10_000
    combined_text = ""
    pre_filtered = False
    any_needs_hybrid = False

    for fn, att in zip(pdf_files, ranked_atts):
        preparse_data = load_preparse(fn)

        if preparse_data and preparse_data.get("needs_hybrid"):
            any_needs_hybrid = True
            continue  # Skip hybrid-needed PDFs in this phase

        title_score = rank_attachment(att["title"], plant_name=navn)

        if preparse_data and preparse_data.get("classification") == "good" and preparse_data.get("filtered_text"):
            text = preparse_data["filtered_text"]
            content_score = score_attachment_text(text)
            total_score = title_score + content_score
            res.attachments_tried.append({
                "title": att["title"],
                "url": att["url"],
                "text_chars": len(text),
                "has_minstevann": "minstevannf" in text.lower(),
                "title_score": title_score,
                "content_score": content_score,
                "total_score": total_score,
            })
            if text.strip() and total_score > best_attachment_score:
                best_attachment_score = total_score
                combined_text = text
                pre_filtered = True
                res.chosen_pdf_url = att["url"]
                res.chosen_pdf_title = att["title"]
        elif preparse_data and preparse_data.get("classification") != "scanned":
            # Digital PDF but not classified 'good' â€” use filtered_text if available
            text = preparse_data.get("filtered_text", "")
            content_score = score_attachment_text(text) if text else 0
            total_score = title_score + content_score
            res.attachments_tried.append({
                "title": att["title"],
                "url": att["url"],
                "text_chars": len(text),
                "has_minstevann": "minstevannf" in text.lower() if text else False,
                "title_score": title_score,
                "content_score": content_score,
                "total_score": total_score,
            })
            if text.strip() and total_score > best_attachment_score:
                best_attachment_score = total_score
                combined_text = text
                pre_filtered = True
                res.chosen_pdf_url = att["url"]
                res.chosen_pdf_title = att["title"]
        else:
            # No preparse data at all â€” try live pdf_to_text
            try:
                cache_path = CACHE_DIR / fn
                pdf_bytes = cache_path.read_bytes()
                text, pf = pdf_to_text(pdf_bytes, cache_name=fn)
                content_score = score_attachment_text(text)
                total_score = title_score + content_score
                res.attachments_tried.append({
                    "title": att["title"],
                    "url": att["url"],
                    "text_chars": len(text),
                    "has_minstevann": "minstevannf" in text.lower(),
                    "title_score": title_score,
                    "content_score": content_score,
                    "total_score": total_score,
                })
                if text.strip() and total_score > best_attachment_score:
                    best_attachment_score = total_score
                    combined_text = text
                    pre_filtered = pf
                    res.chosen_pdf_url = att["url"]
                    res.chosen_pdf_title = att["title"]
            except Exception as e:
                res.attachments_tried.append({
                    "title": att["title"],
                    "url": att["url"],
                    "error": str(e),
                })

    if res.chosen_pdf_url is None and res.attachments_tried:
        first = res.attachments_tried[0]
        res.chosen_pdf_url = first.get("url")
        res.chosen_pdf_title = first.get("title")

    # If all PDFs need hybrid and we have nothing to work with
    if not combined_text.strip() or len(combined_text) < 200:
        if any_needs_hybrid:
            # Don't set llm_result â€” let hybrid phase handle it
            return res, None
        if not pdf_files:
            if res.llm_result is None:
                res.llm_result = {"funnet": False, "grunn": "ingen digitaliserte vedlegg"}
            return res, None
        res.llm_result = {"funnet": False, "grunn": "pdf ga ingen brukbar tekst ved parsing"}
        return res, None

    if pre_filtered:
        snippet = combined_text
        kind = "json_filtered"
    else:
        snippet, kind = find_relevant_window(combined_text, plant_name=navn)
    snippet = normalize_ocr_artefacts(snippet)
    res.snippet_chars = len(snippet)
    res.snippet_kind = kind
    res.snippet_text = snippet
    res.inventory_candidates = extract_inntak_inventory(
        combined_text,
        plant_name=navn,
    )

    try:
        res.llm_result = extract_with_llm(
            res.nveId, navn, snippet,
            model=model, host=host, use_cache=use_cache,
        )
    except OllamaError as e:
        print(f"    [retry] LLM error, retrying: {e}", flush=True)
        time.sleep(2)
        try:
            res.llm_result = extract_with_llm(
                res.nveId, navn, snippet,
                model=model, host=host, use_cache=False,
            )
        except OllamaError as e2:
            res.llm_result = {"funnet": False, "grunn": "llm error", "_error": str(e2)}
        res.error = f"OllamaError: {e}"

    assembled = None
    if res.llm_result and "claims" in res.llm_result:
        assembled = assemble_inntak_from_claims(
            res.llm_result,
            snippet=res.snippet_text,
            inventory=res.inventory_candidates,
            plant_name=navn,
        )
        res.llm_result = assembled
    elif res.llm_result:
        assembled = res.llm_result

    return res, assembled


def _start_hybrid_server() -> subprocess.Popen | None:
    """Spawn opendataloader-pdf-hybrid server. Returns Popen handle or None.

    Port and host are derived from `DEFAULT_HYBRID_URL` (env: HG_ODL_HYBRID_URL).
    """
    from urllib.parse import urlparse
    parsed = urlparse(DEFAULT_HYBRID_URL)
    port = str(parsed.port or 5002)
    hybrid_exe = shutil.which("opendataloader-pdf-hybrid")
    if hybrid_exe is None:
        print("  [hybrid] opendataloader-pdf-hybrid not found on PATH, skipping hybrid phase.", flush=True)
        return None
    try:
        proc = subprocess.Popen(
            [
                hybrid_exe,
                "--port", port,
                "--force-ocr",
                "--ocr-lang", "no,en",
            ],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
    except FileNotFoundError:
        print("  [hybrid] opendataloader-pdf-hybrid not found on PATH, skipping hybrid phase.", flush=True)
        return None

    import urllib.request
    import urllib.error
    health_url = DEFAULT_HYBRID_URL.rstrip("/") + "/health"
    if urlparse(health_url).scheme not in ("http", "https"):
        raise ValueError(f"Refusing non-http(s) URL: {health_url}")
    for _ in range(30):
        time.sleep(2)
        try:
            req = urllib.request.Request(health_url)
            with urllib.request.urlopen(req, timeout=5) as resp:
                if resp.status == 200:
                    print("  [hybrid] server ready.", flush=True)
                    return proc
        except (OSError, urllib.error.URLError):
            pass
    print("  [hybrid] server did not become healthy in 60s.", flush=True)
    _stop_hybrid_server(proc)
    return None


def _stop_hybrid_server(proc: subprocess.Popen) -> None:
    """Terminate the hybrid server process."""
    proc.terminate()
    try:
        proc.wait(timeout=10)
    except subprocess.TimeoutExpired:
        proc.kill()
        proc.wait(timeout=5)


def _hybrid_reparse_pdfs(pdf_paths: list[Path]) -> dict:
    """Re-parse PDFs using hybrid mode via the running hybrid server.

    Mirrors preparse_pdfs() but passes hybrid kwargs to convert().
    Writes updated .elements.json cache files.
    """
    from src.pdf_preparse import _json_cache_path, _configure_java, classify_elements
    import shutil

    _configure_java()
    import opendataloader_pdf

    if not pdf_paths:
        return {}

    results = {}

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
            hybrid="docling-fast",
            hybrid_mode="auto",
            hybrid_url=DEFAULT_HYBRID_URL,
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

            result = {
                "classification": classification,
                "is_digital": classification != "scanned",
                "filtered_text": filtered,
                "needs_hybrid": False,  # Already hybrid-processed
            }
            cache_path = _json_cache_path(orig_path)
            cache_path.write_text(json.dumps(result, ensure_ascii=False), encoding="utf-8")
            results[str(orig_path)] = result

    return results


def _preparse_station_pdfs(download_info: dict) -> None:
    new_pdfs = [
        CACHE_DIR / fn
        for fn in download_info["pdf_files"]
        if (CACHE_DIR / fn).exists() and not load_preparse(fn)
    ]
    if not new_pdfs:
        return

    print(f"preparse {len(new_pdfs)} PDF ... ", end="", flush=True)
    t0 = time.time()
    try:
        results = preparse_pdfs(new_pdfs)
    except Exception as e:
        print(f"skippet ({type(e).__name__}: {e})", flush=True)
        return

    dt = time.time() - t0
    good = sum(1 for r in results.values() if r["classification"] == "good")
    bad = sum(1 for r in results.values() if r["classification"] == "bad")
    scanned = sum(1 for r in results.values() if r["classification"] == "scanned")
    print(f"{dt:.1f}s ({good} good, {bad} bad, {scanned} scanned)", flush=True)


def _hybrid_retry(download_info: dict, model: str, host: str, use_cache: bool) -> tuple[NveidResult, dict | None]:
    pdf_paths = []
    for fn in download_info["pdf_files"]:
        parsed = load_preparse(fn)
        if parsed and parsed.get("needs_hybrid"):
            pdf_path = CACHE_DIR / fn
            if pdf_path.exists():
                pdf_paths.append(pdf_path)

    res: NveidResult = download_info["res"]
    if not pdf_paths:
        return res, res.llm_result

    print(f"hybrid {len(pdf_paths)} PDF ... ", end="", flush=True)
    proc = _start_hybrid_server()
    if proc is None:
        res.llm_result = {"funnet": False, "grunn": "hybrid server utilgjengelig"}
        return res, res.llm_result

    try:
        _hybrid_reparse_pdfs(pdf_paths)
        res.attachments_tried = []
        res.chosen_pdf_url = None
        res.chosen_pdf_title = None
        res.snippet_chars = 0
        res.snippet_kind = ""
        res.snippet_text = ""
        res.inventory_candidates = []
        res.llm_result = None
        res.error = None
        return _run_ollama_on_station(download_info, model=model, host=host, use_cache=use_cache)
    finally:
        _stop_hybrid_server(proc)


def run_station(nve_id: int, resolved_kdb_nr: int, navn: str, model: str, host: str, use_cache: bool) -> NveidResult:
    download_info = _download_station_pdfs(nve_id, resolved_kdb_nr, navn)
    _preparse_station_pdfs(download_info)

    result, assembled = _run_ollama_on_station(
        download_info,
        model=model,
        host=host,
        use_cache=use_cache,
    )
    if result.llm_result is None and assembled is None and not result.error:
        result, assembled = _hybrid_retry(download_info, model=model, host=host, use_cache=use_cache)

    if result.llm_result is None:
        result.llm_result = {
            "funnet": False,
            "grunn": "feil ved nedlasting" if result.error else "pdf ga ingen brukbar tekst ved parsing",
        }
    return result


def _status(result: NveidResult) -> str:
    llm = result.llm_result or {}
    return "funnet" if llm.get("funnet") else f"ikke funnet ({llm.get('grunn', '?')})"


def _run_station_safely(nve_id: int, kdb_nr: int, navn: str, model: str, host: str, use_cache: bool) -> NveidResult:
    try:
        return run_station(nve_id, kdb_nr, navn, model=model, host=host, use_cache=use_cache)
    except Exception as e:
        return NveidResult(
            nveId=nve_id,
            source_kdb_nr=kdb_nr,
            navn=navn,
            konsesjon_url="",
            llm_result={"funnet": False, "grunn": "pipeline error", "_error": str(e)},
            error=f"{type(e).__name__}: {e}",
        )


def _resolve_plants(nve_ids: list[int]) -> list[tuple[int, int, str]]:
    nve_lookup = fetch_plants_from_nve_ids(nve_ids)
    unresolved = [nve_id for nve_id in nve_ids if nve_id not in nve_lookup]
    if unresolved:
        raise RuntimeError(f"Could not resolve NVE ID(s): {', '.join(str(v) for v in unresolved)}")
    return [
        (nve_id, int(nve_lookup[nve_id]["kdbNr"]), str(nve_lookup[nve_id]["navn"]))
        for nve_id in nve_ids
    ]


def _parse_nve_ids(values: list[str]) -> list[int]:
    nve_ids = []
    for value in values:
        for part in value.split(","):
            part = part.strip()
            if part:
                nve_ids.append(int(part))
    return nve_ids


# ---------- Subcommand: plant ----------


def cmd_plant(args) -> None:
    sys.stdout.reconfigure(encoding="utf-8")

    nve_ids = _parse_nve_ids(args.nve_id)
    if not nve_ids:
        print("Error: specify at least one NVE ID.", file=sys.stderr)
        sys.exit(1)

    try:
        plants = _resolve_plants(nve_ids)
    except RuntimeError as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)

    print(f"Modell:      {args.model}")
    print(f"Ollama:      {args.host}")
    print(f"LLM-cache:   {'BYPASS' if args.no_cache else 'ON'}")
    print(f"NVEID:       {len(plants)}")
    print()

    db = load_minimumflow_db()
    all_results = []
    for nve_id, kdb_nr, navn in plants:
        if str(nve_id) in db and not args.force:
            print(f"[NVE {nve_id}] {navn} ... hoppet over (finnes allerede, bruk --force)")
            continue

        print(f"[NVE {nve_id}] {navn} ... ", end="", flush=True)
        t0 = time.time()
        r = _run_station_safely(nve_id, kdb_nr, navn, model=args.model, host=args.host, use_cache=not args.no_cache)
        dt = time.time() - t0

        db, _ = write_station_result(r, db=db, force=args.force)
        save_minimumflow_db(db)
        print(f"{dt:.1f}s  {_status(r)}")
        if r.error:
            print(f"  FEIL: {r.error}")
        all_results.append(r)

    report = format_report(all_results)
    print()
    print(report)


# ---------- Subcommand: batch ----------


def cmd_batch(args) -> None:
    sys.stdout.reconfigure(encoding="utf-8")

    db = load_minimumflow_db()
    used_nve_ids = set() if args.force else {int(nve_id) for nve_id in db.keys() if str(nve_id).isdigit()}
    seed = args.seed if args.seed is not None else 1
    selected = choose_batch(fetch_all_plants(), used_nve_ids, args.n, seed)
    if len(selected) < args.n:
        raise RuntimeError(f"Fant bare {len(selected)} ubrukte NVEID, trengte {args.n}.")

    total = len(selected)
    print(f"Batch  |  NVEID={total}  |  seed={seed}  |  cache={'ON' if args.use_cache else 'OFF'}")
    print()

    all_results = []
    for idx, plant in enumerate(selected, 1):
        nve_id = int(plant["nveId"])
        kdb_nr = int(plant["kdbNr"])
        navn = str(plant["navn"])
        print(f"[{idx}/{total}] [NVE {nve_id}] {navn} ... ", end="", flush=True)
        t0 = time.time()
        result = _run_station_safely(nve_id, kdb_nr, navn, model=args.model, host=args.host, use_cache=args.use_cache)
        dt = time.time() - t0

        db, _ = write_station_result(result, db=db, force=True)
        save_minimumflow_db(db)
        print(f"{dt:.1f}s  {_status(result)}", flush=True)
        if result.error:
            print(f"  FEIL: {result.error}")
        all_results.append(result)

    print()
    print(format_report(all_results))


# ---------- CLI ----------


class HelpFormatter(argparse.ArgumentDefaultsHelpFormatter, argparse.RawDescriptionHelpFormatter):
    pass


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Minstevann extraction pipeline",
        formatter_class=HelpFormatter,
        epilog=dedent("""\
        Examples:
          python tools/minstevann/run.py plant 1696
          python tools/minstevann/run.py plant 1696,2034 2450
          python tools/minstevann/run.py batch --n 10
          python tools/minstevann/run.py batch --n 25 --seed 42

        Tip:
          Put --help after a command for details, for example:
          python tools/minstevann/run.py batch --help
        """),
    )
    sub = parser.add_subparsers(dest="command")

    plant_p = sub.add_parser(
        "plant",
        help="Extract one or more NVEID values",
        description="Extract one or more stations by HydroGuide NVEID.",
        formatter_class=HelpFormatter,
        epilog=dedent("""\
        Examples:
          python tools/minstevann/run.py plant 1696
          python tools/minstevann/run.py plant 1696,2034 2450
        """),
    )
    plant_p.add_argument("nve_id", nargs="+", metavar="NVE_ID", help="NVE ID value(s), comma or space separated")
    plant_p.add_argument("--model", default=DEFAULT_MODEL, help="Ollama model to use")
    plant_p.add_argument("--host", default=DEFAULT_OLLAMA_HOST, help="Ollama host URL")
    plant_p.add_argument("--no-cache", action="store_true", help="Bypass the LLM cache for this run")
    plant_p.add_argument("--force", action="store_true", help="Rerun and overwrite existing minimumflow entry")

    batch_p = sub.add_parser(
        "batch",
        help="Run a batch of random NVEID values",
        description="Run a random NVEID batch. Use --n to choose how many stations to process.",
        formatter_class=HelpFormatter,
        epilog=dedent("""\
        Examples:
          python tools/minstevann/run.py batch --n 10
          python tools/minstevann/run.py batch --n 25 --seed 42
        """),
    )
    batch_p.add_argument("--n", type=int, default=10, help="Number of random NVEID values to process")
    batch_p.add_argument("--seed", type=int, default=None, help="Random seed")
    batch_p.add_argument("--model", default=DEFAULT_MODEL, help="Ollama model to use")
    batch_p.add_argument("--host", default=DEFAULT_OLLAMA_HOST, help="Ollama host URL")
    batch_p.add_argument("--use-cache", action="store_true", help="Use cached LLM responses if available")
    batch_p.add_argument("--force", action="store_true", help="Allow rerun and overwrite existing minimumflow entries")

    preparse_p = sub.add_parser(
        "preparse",
        help="Pre-parse cached PDFs to JSON (batch JVM job)",
        description="Run OpenDataLoader JSON extraction on all cached PDFs in parallel. "
                    "Results are cached alongside the PDFs. The main pipeline then skips JVM calls.",
        formatter_class=HelpFormatter,
    )
    preparse_p.add_argument("--workers", type=int, default=2, help="Parallel JVM threads")
    preparse_p.add_argument("--limit", type=int, default=None, help="Max PDFs to parse (for testing)")

    return parser


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()

    if args.command == "plant":
        cmd_plant(args)
    elif args.command == "batch":
        cmd_batch(args)
    elif args.command == "preparse":
        from src.pdf_preparse import preparse_pdfs, CACHE_DIR as _CACHE
        pdfs = sorted(p for p in _CACHE.glob("pdf_*.pdf*") if not p.name.endswith(".elements.json"))
        if args.limit:
            pdfs = pdfs[:args.limit]
        if not pdfs:
            print("No PDFs to parse.")
        else:
            results = preparse_pdfs(pdfs)
            good = sum(1 for r in results.values() if r["classification"] == "good")
            bad = sum(1 for r in results.values() if r["classification"] == "bad")
            scanned = sum(1 for r in results.values() if r["classification"] == "scanned")
            print(f"\n{len(results)} parsed: {good} good, {bad} bad, {scanned} scanned")
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
