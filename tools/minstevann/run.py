"""
Minstevann extraction pipeline - single entry point.

Usage:
    python tools/minstevann/run.py plant 1696
    python tools/minstevann/run.py plant 1696,2034 2450
    python tools/minstevann/run.py batch --n 10
    python tools/minstevann/run.py batch --resume
    python tools/minstevann/run.py export
"""
from __future__ import annotations

import argparse
import json
import random
import re
import subprocess
import sys
import tempfile
import time
from dataclasses import asdict
from datetime import datetime, timezone
from pathlib import Path
from textwrap import dedent

from src.models import (
    KraftverkResult, DEFAULT_MODEL, DEFAULT_OLLAMA_HOST,
    CACHE_DIR, KONSESJON_URL, NVE_BASE, RESULTS_DIR, MINIMUM_FLOW_DB_PATH,
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
from src.pdf_preparse import preparse_pdfs, load_preparse, append_hybrid_log, clear_hybrid_log, HYBRID_LOG_PATH


# ---------- Core per-plant orchestrator ----------


def process(nve_id: int, resolved_kdb_nr: int, navn: str, model: str, host: str, use_cache: bool) -> KraftverkResult:
    res = KraftverkResult(
        nveId=nve_id,
        kdbNr=resolved_kdb_nr,
        navn=navn,
        konsesjon_url="",
    )
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

        best_attachment_score = -10_000
        combined_text = ""
        for att in ranked[:4]:
            fn = f"pdf_{resolved_kdb_nr}_{att['url'].rsplit('/', 1)[-1]}.pdf"
            try:
                pdf_bytes = cached_get(att["url"], fn, as_bytes=True)
                if isinstance(pdf_bytes, str):
                    pdf_bytes = pdf_bytes.encode("utf-8")
                text, pre_filtered = pdf_to_text(pdf_bytes, cache_name=fn)
                title_score = rank_attachment(att["title"], plant_name=navn)
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

        if not ranked:
            res.llm_result = {"funnet": False, "grunn": "ingen digitaliserte vedlegg"}
            return res
        if not combined_text.strip() or len(combined_text) < 200:
            res.llm_result = {"funnet": False, "grunn": "pdf ga ingen brukbar tekst ved parsing"}
            return res

        if pre_filtered:
            snippet = combined_text
            kind = "json_filtered"
        else:
            snippet, kind = find_relevant_window(combined_text, plant_name=navn)
        from src.pdf import normalize_ocr_artefacts as _norm
        snippet = _norm(snippet)
        res.snippet_chars = len(snippet)
        res.snippet_kind = kind
        res.snippet_text = snippet
        res.inventory_candidates = extract_inntak_inventory(
            combined_text,
            plant_name=navn,
        )

        try:
            res.llm_result = extract_with_llm(
                nve_id, navn, snippet,
                model=model, host=host, use_cache=use_cache,
            )
        except OllamaError as e:
            print(f"    [retry] LLM error, retrying: {e}", flush=True)
            time.sleep(2)
            try:
                res.llm_result = extract_with_llm(
                    nve_id, navn, snippet,
                    model=model, host=host, use_cache=False,
                )
            except OllamaError as e2:
                res.llm_result = {"funnet": False, "grunn": "llm error", "_error": str(e2)}
            res.error = f"OllamaError: {e}"
    except Exception as e:
        res.error = f"{type(e).__name__}: {e}"
    return res


# ---------- Batch helpers ----------

PROGRESS_PATH = RESULTS_DIR / "progress.json"


def now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def load_progress() -> dict:
    if PROGRESS_PATH.exists():
        return json.loads(PROGRESS_PATH.read_text(encoding="utf-8"))
    return {
        "_meta": {
            "created_at": now_iso(),
            "parser": "opendataloader-pdf",
            "model": DEFAULT_MODEL,
        },
        "runs": {},
        "used_nve_ids": [],
    }


def save_progress(progress: dict) -> None:
    PROGRESS_PATH.write_text(
        json.dumps(progress, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def choose_batch(plants: list[dict], used_nve_ids: set[int], n: int, seed: int) -> list[dict]:
    candidates = [plant for plant in plants if plant["nveId"] not in used_nve_ids]
    rng = random.Random(seed)
    rng.shuffle(candidates)
    return candidates[:n]


CHUNK_SIZE = 25


def _download_station_pdfs(nve_id: int, resolved_kdb_nr: int, navn: str) -> dict:
    """Download NVE konsesjonssak HTML + PDF attachments for one station.

    Returns {"res": KraftverkResult, "pdf_files": [cache_name_strings],
             "ranked_atts": [attachment_dicts]}.
    """
    res = KraftverkResult(
        nveId=nve_id,
        kdbNr=resolved_kdb_nr,
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
) -> tuple[KraftverkResult, dict | None]:
    """Run Ollama extraction on a downloaded station.

    Reads preparse cache for each PDF, picks the best attachment,
    runs snippet windowing if not pre_filtered, calls Ollama.
    Skips PDFs marked needs_hybrid.
    Returns (KraftverkResult, assembled_dict_or_None).
    """
    from src.pdf import normalize_ocr_artefacts

    res: KraftverkResult = download_info["res"]
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
            # Digital PDF but not classified 'good' — use filtered_text if available
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
            # No preparse data at all — try live pdf_to_text
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
            # Don't set llm_result — let hybrid phase handle it
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
    try:
        proc = subprocess.Popen(
            [
                "opendataloader-pdf-hybrid",
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


def serialize_result(result: KraftverkResult, assembled_result: dict | None) -> dict:
    payload = asdict(result)
    payload["assembled_result"] = assembled_result
    return payload


def deserialize_result(payload: dict) -> KraftverkResult:
    return KraftverkResult(
        nveId=payload["nveId"],
        kdbNr=payload["kdbNr"],
        navn=payload["navn"],
        konsesjon_url=payload["konsesjon_url"],
        case_id=payload.get("case_id"),
        fritekst_summary=payload.get("fritekst_summary"),
        attachments_tried=payload.get("attachments_tried") or [],
        chosen_pdf_url=payload.get("chosen_pdf_url"),
        chosen_pdf_title=payload.get("chosen_pdf_title"),
        snippet_chars=payload.get("snippet_chars") or 0,
        snippet_kind=payload.get("snippet_kind") or "",
        snippet_text=payload.get("snippet_text") or "",
        llm_result=payload.get("assembled_result") or payload.get("llm_result"),
        error=payload.get("error"),
    )


# ---------- Subcommand: plant ----------


def cmd_plant(args) -> None:
    sys.stdout.reconfigure(encoding="utf-8")

    nve_ids = []
    for x in args.nve_id:
        for part in x.split(","):
            part = part.strip()
            if part:
                nve_ids.append(int(part))

    if not nve_ids:
        print("Error: specify at least one NVE ID.", file=sys.stderr)
        sys.exit(1)

    nve_lookup = fetch_plants_from_nve_ids(nve_ids)
    unresolved = [nve_id for nve_id in nve_ids if nve_id not in nve_lookup]
    if unresolved:
        print(f"Error: could not resolve NVE ID(s): {', '.join(str(v) for v in unresolved)}", file=sys.stderr)
        sys.exit(1)

    plants = []
    for nve_id in nve_ids:
        info = nve_lookup.get(nve_id)
        plants.append((nve_id, info["kdbNr"], info["navn"]))

    print(f"Modell:      {args.model}")
    print(f"Ollama:      {args.host}")
    print(f"LLM-cache:   {'BYPASS' if args.no_cache else 'ON'}")
    print(f"Kraftverk:   {len(plants)}")
    print()

    all_results = []
    for nve_id, resolved_kdb_nr, navn in plants:
        print(f"[NVE {nve_id}] {navn} ... ", end="", flush=True)
        t0 = time.time()
        r = process(nve_id, resolved_kdb_nr, navn, model=args.model, host=args.host, use_cache=not args.no_cache)
        dt = time.time() - t0
        if r.llm_result and "claims" in r.llm_result:
            r.llm_result = assemble_inntak_from_claims(
                r.llm_result,
                snippet=r.snippet_text,
                inventory=r.inventory_candidates,
                plant_name=navn,
            )
        llm = r.llm_result or {}
        status = "funnet" if llm.get("funnet") else f"ikke funnet ({llm.get('grunn', '?')})"
        print(f"{dt:.1f}s  {status}")
        if r.error:
            print(f"  FEIL: {r.error}")
        all_results.append(r)

    report = format_report(all_results)
    print()
    print(report)


# ---------- Subcommand: batch ----------


def cmd_batch(args) -> None:
    sys.stdout.reconfigure(encoding="utf-8")

    progress = load_progress()
    existing_runs = {
        int(run_id)
        for run_id in progress.get("runs", {}).keys()
        if str(run_id).isdigit()
    }
    run_number = args.run or (max(existing_runs, default=0) + 1)
    run_key = f"{run_number:03d}"
    seed = args.seed if args.seed is not None else run_number

    run_path = RESULTS_DIR / f"run_{run_key}.json"

    if run_key in progress.get("runs", {}) and not args.resume:
        raise RuntimeError(f"Run {run_key} finnes allerede i progress.json")

    used_nve_ids = {int(nve_id) for nve_id in progress.get("used_nve_ids", [])}
    if args.resume and run_path.exists():
        run_data = json.loads(run_path.read_text(encoding="utf-8"))
        selected = run_data.get("selection", [])
        if not selected:
            raise RuntimeError(f"Run {run_key} mangler selection i {run_path}")
        seed = int(run_data.get("seed", seed))
    else:
        plants = fetch_all_plants()
        selected = choose_batch(plants, used_nve_ids, args.n, seed)
        if len(selected) < args.n:
            raise RuntimeError(f"Fant bare {len(selected)} ubrukte kraftverk, trengte {args.n}.")
        run_data = {
            "run": run_number,
            "seed": seed,
            "model": args.model,
            "parser": "opendataloader-pdf-v2",
            "use_cache": bool(args.use_cache),
            "started_at": now_iso(),
            "selection": selected,
            "stations": [],
        }

    # Clear hybrid log for a fresh run
    clear_hybrid_log()

    all_results: list[KraftverkResult] = [
        deserialize_result(station)
        for station in run_data.get("stations", [])
    ]
    processed_nve_ids = {int(station["nveId"]) for station in run_data.get("stations", [])}
    total = len(selected)
    print(f"Run {run_key}  |  stations={total}  |  seed={seed}  |  cache={'ON' if args.use_cache else 'OFF'}")
    if processed_nve_ids:
        print(f"Resuming: {len(processed_nve_ids)} allerede skrevet")
    print()

    # Track stations that need hybrid retry (no llm_result after cycle pass)
    hybrid_retry_infos: list[dict] = []

    # ---- Cycle-based pipeline: process stations in chunks ----
    for chunk_start in range(0, total, CHUNK_SIZE):
        chunk = selected[chunk_start:chunk_start + CHUNK_SIZE]
        chunk_num = chunk_start // CHUNK_SIZE + 1
        chunk_total = (total + CHUNK_SIZE - 1) // CHUNK_SIZE
        print(f"--- Cycle {chunk_num}/{chunk_total} ({len(chunk)} stations) ---", flush=True)

        # Phase 1: Download all stations in chunk
        download_infos: list[dict] = []
        for plant in chunk:
            nve_id = int(plant["nveId"])
            resolved_kdb_nr = int(plant["kdbNr"])
            navn = str(plant["navn"])
            idx = chunk_start + len(download_infos) + 1

            if nve_id in processed_nve_ids:
                print(f"[{idx}/{total}] [NVE {nve_id}] {navn} ... hoppet over (allerede skrevet)")
                download_infos.append(None)
                continue

            print(f"[{idx}/{total}] [NVE {nve_id}] {navn} downloading ... ", end="", flush=True)
            t0 = time.time()
            info = _download_station_pdfs(nve_id, resolved_kdb_nr, navn)
            dt = time.time() - t0
            print(f"{dt:.1f}s  ({len(info['pdf_files'])} PDFs)", flush=True)
            download_infos.append(info)

        # Phase 2: Preparse all new PDFs in this chunk
        new_pdfs: list[Path] = []
        for info in download_infos:
            if info is None:
                continue
            for fn in info["pdf_files"]:
                pdf_path = CACHE_DIR / fn
                if pdf_path.exists() and not load_preparse(fn):
                    new_pdfs.append(pdf_path)

        if new_pdfs:
            print(f"  Preparsing {len(new_pdfs)} PDFs ...", end="", flush=True)
            t0 = time.time()
            preparse_results = preparse_pdfs(new_pdfs)
            dt = time.time() - t0
            hybrid_entries = []
            for path_str, result in preparse_results.items():
                if result.get("needs_hybrid"):
                    hybrid_entries.append({"file": Path(path_str).name, "reason": result["classification"]})
            if hybrid_entries:
                append_hybrid_log(hybrid_entries)
            good = sum(1 for r in preparse_results.values() if r["classification"] == "good")
            bad = sum(1 for r in preparse_results.values() if r["classification"] == "bad")
            scanned = sum(1 for r in preparse_results.values() if r["classification"] == "scanned")
            print(f" {dt:.1f}s  ({good} good, {bad} bad, {scanned} scanned)", flush=True)

        # Phase 3: Run Ollama on each station (skipping hybrid-needed PDFs)
        for i, (plant, info) in enumerate(zip(chunk, download_infos)):
            nve_id = int(plant["nveId"])
            navn = str(plant["navn"])
            idx = chunk_start + i + 1

            if info is None:
                continue  # Already processed (resume)

            print(f"[{idx}/{total}] [NVE {nve_id}] {navn} Ollama ... ", end="", flush=True)
            t0 = time.time()
            result, assembled = _run_ollama_on_station(
                info, model=args.model, host=args.host, use_cache=args.use_cache,
            )
            dt = time.time() - t0

            if result.llm_result is None and assembled is None:
                if result.error:
                    # Download failed — don't retry via hybrid
                    result.llm_result = {"funnet": False, "grunn": "feil ved nedlasting"}
                    assembled = result.llm_result
                else:
                    # Station needs hybrid phase
                    print(f"{dt:.1f}s  needs hybrid", flush=True)
                    hybrid_retry_infos.append(info)
                    continue

            status = "funnet" if (assembled or {}).get("funnet") else f"ikke funnet ({(assembled or {}).get('grunn', '?')})"
            print(f"{dt:.1f}s  {status}", flush=True)
            if result.error:
                print(f"  FEIL: {result.error}")

            all_results.append(result)
            processed_nve_ids.add(nve_id)
            run_data["stations"].append(serialize_result(result, assembled))
            run_path.write_text(json.dumps(run_data, ensure_ascii=False, indent=2), encoding="utf-8")

        # Cooldown between cycles
        if chunk_start + CHUNK_SIZE < total:
            print("  Cooldown 5s ...", flush=True)
            time.sleep(5)

    # ---- Hybrid phase: re-process bad/scanned PDFs ----
    if hybrid_retry_infos and HYBRID_LOG_PATH.exists():
        hybrid_log = json.loads(HYBRID_LOG_PATH.read_text(encoding="utf-8"))
        if hybrid_log:
            print(f"\n--- Hybrid phase: {len(hybrid_log)} PDFs to re-process ---", flush=True)
            proc = _start_hybrid_server()
            if proc is not None:
                try:
                    # Collect all PDFs that need hybrid
                    hybrid_pdf_paths = []
                    for entry in hybrid_log:
                        pdf_path = CACHE_DIR / entry["file"]
                        if pdf_path.exists():
                            hybrid_pdf_paths.append(pdf_path)

                    if hybrid_pdf_paths:
                        print(f"  Hybrid-reparsing {len(hybrid_pdf_paths)} PDFs ...", end="", flush=True)
                        t0 = time.time()
                        _hybrid_reparse_pdfs(hybrid_pdf_paths)
                        dt = time.time() - t0
                        print(f" {dt:.1f}s", flush=True)

                    # Re-run Ollama on stations that needed hybrid
                    for info in hybrid_retry_infos:
                        res = info["res"]
                        nve_id = res.nveId
                        navn = res.navn

                        if nve_id in processed_nve_ids:
                            continue

                        print(f"  [hybrid] [NVE {nve_id}] {navn} Ollama ... ", end="", flush=True)
                        # Reset attachments_tried so _run_ollama picks up new preparse data
                        info["res"].attachments_tried = []
                        info["res"].llm_result = None
                        info["res"].error = None
                        t0 = time.time()
                        result, assembled = _run_ollama_on_station(
                            info, model=args.model, host=args.host, use_cache=args.use_cache,
                        )
                        dt = time.time() - t0

                        if result.llm_result is None and assembled is None:
                            assembled = {"funnet": False, "grunn": "pdf ga ingen brukbar tekst ved hybrid parsing"}
                            result.llm_result = assembled

                        status = "funnet" if (assembled or {}).get("funnet") else f"ikke funnet ({(assembled or {}).get('grunn', '?')})"
                        print(f"{dt:.1f}s  {status}", flush=True)
                        if result.error:
                            print(f"  FEIL: {result.error}")

                        all_results.append(result)
                        processed_nve_ids.add(nve_id)
                        run_data["stations"].append(serialize_result(result, assembled or result.llm_result))
                        run_path.write_text(json.dumps(run_data, ensure_ascii=False, indent=2), encoding="utf-8")
                finally:
                    _stop_hybrid_server(proc)
            else:
                # No hybrid server available — write results as-is
                for info in hybrid_retry_infos:
                    res = info["res"]
                    if res.nveId in processed_nve_ids:
                        continue
                    res.llm_result = {"funnet": False, "grunn": "hybrid server utilgjengelig"}
                    all_results.append(res)
                    processed_nve_ids.add(res.nveId)
                    run_data["stations"].append(serialize_result(res, res.llm_result))
                    run_path.write_text(json.dumps(run_data, ensure_ascii=False, indent=2), encoding="utf-8")

    run_data["completed_at"] = now_iso()
    run_data["report"] = format_report(all_results)
    run_path.write_text(json.dumps(run_data, ensure_ascii=False, indent=2), encoding="utf-8")

    progress.setdefault("runs", {})[run_key] = {
        "run": run_number,
        "seed": seed,
        "n": total,
        "path": str(run_path),
        "stations": [{"nveId": int(plant["nveId"]), "kdbNr": int(plant["kdbNr"]), "navn": plant["navn"]} for plant in selected],
        "created_at": run_data["started_at"],
        "completed_at": run_data["completed_at"],
    }
    progress["used_nve_ids"] = sorted(used_nve_ids | {int(plant["nveId"]) for plant in selected})
    progress["_meta"]["last_updated"] = now_iso()
    save_progress(progress)

    print()
    print(f"Skrev {run_path}")


# ---------- Subcommand: export ----------


def _load_existing_db() -> dict:
    if MINIMUM_FLOW_DB_PATH.exists():
        return json.loads(MINIMUM_FLOW_DB_PATH.read_text(encoding="utf-8"))
    return {}


def _save_db(db: dict) -> None:
    MINIMUM_FLOW_DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    MINIMUM_FLOW_DB_PATH.write_text(
        json.dumps(db, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def cmd_export(args) -> None:
    months = {
        "januar": "01", "jan": "01", "februar": "02", "feb": "02",
        "mars": "03", "mar": "03", "april": "04", "apr": "04",
        "mai": "05", "juni": "06", "jun": "06", "juli": "07", "jul": "07",
        "august": "08", "aug": "08", "september": "09", "sep": "09", "sept": "09",
        "oktober": "10", "okt": "10", "november": "11", "nov": "11",
        "desember": "12", "des": "12",
    }

    def norm_periode(text):
        if not text or not isinstance(text, str) or not text.strip():
            return None
        t = text.strip()
        low = t.lower()
        if low in ("hele året", "hele aret", "hele aaret"):
            return "hele året"
        m = re.match(r"^(\d{1,2})\.(\d{1,2})\s*-\s*(\d{1,2})\.(\d{1,2})$", t)
        if m:
            return f"{int(m.group(1)):02d}.{int(m.group(2)):02d} - {int(m.group(3)):02d}.{int(m.group(4)):02d}"
        m = re.match(
            r"(?:I\s+tiden\s+)?(\d{1,2})\.?\s*([a-zæøå]+)\s*[-–—]\s*(\d{1,2})\.?\s*([a-zæøå]+)",
            t, re.I,
        )
        if m:
            d1, m1, d2, m2 = m.group(1), m.group(2).lower().rstrip("."), m.group(3), m.group(4).lower().rstrip(".")
            if m1 in months and m2 in months:
                return f"{int(d1):02d}.{months[m1]} - {int(d2):02d}.{months[m2]}"
        return t

    db = _load_existing_db()
    updated = 0
    progress = load_progress()
    for run_key, run_meta in progress.get("runs", {}).items():
        run_path = Path(run_meta["path"])
        if not run_path.exists():
            continue
        run_data = json.loads(run_path.read_text(encoding="utf-8"))
        for station in run_data.get("stations", []):
            nve_id = str(station["nveId"])
            assembled = station.get("assembled_result") or station.get("llm_result")
            if not assembled:
                continue
            raw_inntak = assembled.get("inntak", [])
            inntak_out = []
            for item in raw_inntak:
                if not isinstance(item, dict):
                    continue
                periode_s = norm_periode(item.get("sommer_periode"))
                periode_v = norm_periode(item.get("vinter_periode"))
                sommer_ls = item.get("sommer_ls")
                vinter_ls = item.get("vinter_ls")
                if periode_s == "hele året":
                    vinter_ls = None
                    periode_v = None
                inntak_out.append({
                    "inntakFunksjon": item.get("inntakFunksjon"),
                    "sommer_ls": sommer_ls,
                    "sommer_periode": periode_s,
                    "vinter_ls": vinter_ls,
                    "vinter_periode": periode_v,
                })
            if not inntak_out:
                inntak_out.append({
                    "inntakFunksjon": None,
                    "sommer_ls": None,
                    "sommer_periode": None,
                    "vinter_ls": None,
                    "vinter_periode": None,
                })
            db[nve_id] = {
                "navn": station["navn"],
                "funnet": bool(assembled.get("funnet")),
                "inntak": inntak_out,
            }
            updated += 1
    _save_db(db)
    print(f"Updated {updated} entries in {MINIMUM_FLOW_DB_PATH} ({len(db)} total)")


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
          python tools/minstevann/run.py batch --resume
          python tools/minstevann/run.py export

        Tip:
          Put --help after a command for details, for example:
          python tools/minstevann/run.py batch --help
        """),
    )
    sub = parser.add_subparsers(dest="command")

    plant_p = sub.add_parser(
        "plant",
        help="Extract one or more plants",
        description="Extract one or more plants by NVE ID.",
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

    batch_p = sub.add_parser(
        "batch",
        help="Run a batch of random plants",
        description="Run a random batch. Use --n to choose how many plants to process.",
        formatter_class=HelpFormatter,
        epilog=dedent("""\
        Examples:
          python tools/minstevann/run.py batch --n 10
          python tools/minstevann/run.py batch --n 25 --seed 42
          python tools/minstevann/run.py batch --run 3 --n 10
          python tools/minstevann/run.py batch --resume
        """),
    )
    batch_p.add_argument("--run", type=int, default=None, help="Explicit run number; omitted means next available run")
    batch_p.add_argument("--n", type=int, default=10, help="Number of random plants to process")
    batch_p.add_argument("--seed", type=int, default=None, help="Random seed; omitted means the run number")
    batch_p.add_argument("--model", default=DEFAULT_MODEL, help="Ollama model to use")
    batch_p.add_argument("--host", default=DEFAULT_OLLAMA_HOST, help="Ollama host URL")
    batch_p.add_argument("--use-cache", action="store_true", help="Use cached LLM responses if available")
    batch_p.add_argument("--resume", action="store_true", help="Resume an interrupted run file")

    sub.add_parser(
        "export",
        help="Export results to backend/data/minimumflow.json",
        description="Export completed batch results to backend/data/minimumflow.json.",
        formatter_class=HelpFormatter,
    )

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
    elif args.command == "export":
        cmd_export(args)
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
