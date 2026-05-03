from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

from src.models import MINIMUM_FLOW_DB_PATH


MONTHS = {
    "januar": "01",
    "jan": "01",
    "februar": "02",
    "feb": "02",
    "mars": "03",
    "mar": "03",
    "april": "04",
    "apr": "04",
    "mai": "05",
    "juni": "06",
    "jun": "06",
    "juli": "07",
    "jul": "07",
    "august": "08",
    "aug": "08",
    "september": "09",
    "sep": "09",
    "sept": "09",
    "oktober": "10",
    "okt": "10",
    "november": "11",
    "nov": "11",
    "desember": "12",
    "des": "12",
}


def normalize_period(text: Any) -> str | None:
    if not isinstance(text, str) or not text.strip():
        return None

    value = text.strip()
    lowered = value.lower()
    if lowered in ("hele året", "hele aret", "hele aaret"):
        return "hele året"

    match = re.match(r"^(\d{1,2})\.(\d{1,2})\s*-\s*(\d{1,2})\.(\d{1,2})$", value)
    if match:
        return (
            f"{int(match.group(1)):02d}.{int(match.group(2)):02d} - "
            f"{int(match.group(3)):02d}.{int(match.group(4)):02d}"
        )

    match = re.match(
        r"(?:I\s+tiden\s+)?(\d{1,2})\.?\s*([A-Za-zÆØÅæøå]+)\s*[-–—]\s*"
        r"(\d{1,2})\.?\s*([A-Za-zÆØÅæøå]+)",
        value,
        re.I,
    )
    if match:
        day_1, month_1, day_2, month_2 = (
            match.group(1),
            match.group(2).lower().rstrip("."),
            match.group(3),
            match.group(4).lower().rstrip("."),
        )
        if month_1 in MONTHS and month_2 in MONTHS:
            return f"{int(day_1):02d}.{MONTHS[month_1]} - {int(day_2):02d}.{MONTHS[month_2]}"

    return value


def empty_inntak() -> dict:
    return {
        "inntakFunksjon": None,
        "sommer_ls": None,
        "sommer_periode": None,
        "vinter_ls": None,
        "vinter_periode": None,
    }


def format_minimumflow_entry(result) -> dict:
    assembled = result.llm_result or {}
    inntak = []

    for item in assembled.get("inntak", []) or []:
        if not isinstance(item, dict):
            continue

        sommer_periode = normalize_period(item.get("sommer_periode"))
        vinter_periode = normalize_period(item.get("vinter_periode"))
        sommer_ls = item.get("sommer_ls")
        vinter_ls = item.get("vinter_ls")

        if sommer_periode == "hele året":
            vinter_ls = None
            vinter_periode = None

        inntak.append({
            "inntakFunksjon": item.get("inntakFunksjon"),
            "sommer_ls": sommer_ls,
            "sommer_periode": sommer_periode,
            "vinter_ls": vinter_ls,
            "vinter_periode": vinter_periode,
        })

    return {
        "navn": result.navn,
        "funnet": bool(assembled.get("funnet")),
        "inntak": inntak or [empty_inntak()],
    }


def load_minimumflow_db(path: Path = MINIMUM_FLOW_DB_PATH) -> dict:
    if path.exists():
        return json.loads(path.read_text(encoding="utf-8"))
    return {}


def save_minimumflow_db(db: dict, path: Path = MINIMUM_FLOW_DB_PATH) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(db, ensure_ascii=False, indent=2), encoding="utf-8")


def write_station_result(result, db: dict | None = None, force: bool = False) -> tuple[dict, bool]:
    target = db if db is not None else load_minimumflow_db()
    key = str(result.nveId)
    if key in target and not force:
        return target, False

    target[key] = format_minimumflow_entry(result)
    if db is None:
        save_minimumflow_db(target)
    return target, True
