from __future__ import annotations

import json
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[3]
DATA_PATH = ROOT / "backend" / "data" / "minimumflow.json"


def period(ls: Any, periode: Any, note: Any = None) -> dict:
    return {
        "ls": ls if isinstance(ls, (int, float)) and not isinstance(ls, bool) else None,
        "periode": periode if isinstance(periode, str) and periode.strip() else None,
        "note": note if isinstance(note, str) and note.strip() else None,
    }


def convert_item(item: Any) -> dict:
    if not isinstance(item, dict):
        return {"inntakFunksjon": None, "perioder": [period(None, None)]}

    if isinstance(item.get("perioder"), list) and item["perioder"]:
        periods = [
            period(p.get("ls"), p.get("periode"), p.get("note"))
            for p in item["perioder"]
            if isinstance(p, dict)
        ]
    else:
        periods = []
        if item.get("sommer_ls") is not None or item.get("sommer_periode") is not None:
            periods.append(period(item.get("sommer_ls"), item.get("sommer_periode")))
        if item.get("vinter_ls") is not None or item.get("vinter_periode") is not None:
            periods.append(period(item.get("vinter_ls"), item.get("vinter_periode")))

    return {
        "inntakFunksjon": item.get("inntakFunksjon") if isinstance(item.get("inntakFunksjon"), str) else None,
        "perioder": periods or [period(None, None)],
    }


def convert_station(entry: Any) -> dict:
    if not isinstance(entry, dict):
        return {"navn": "", "funnet": False, "inntak": [{"inntakFunksjon": None, "perioder": [period(None, None)]}]}
    inntak = entry.get("inntak")
    return {
        "navn": entry.get("navn") if isinstance(entry.get("navn"), str) else "",
        "funnet": entry.get("funnet") is True,
        "inntak": [convert_item(item) for item in inntak] if isinstance(inntak, list) and inntak else [
            {"inntakFunksjon": None, "perioder": [period(None, None)]}
        ],
    }


def main() -> None:
    data = json.loads(DATA_PATH.read_text(encoding="utf-8"))
    converted = {str(key): convert_station(value) for key, value in data.items()}
    DATA_PATH.write_text(json.dumps(converted, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
