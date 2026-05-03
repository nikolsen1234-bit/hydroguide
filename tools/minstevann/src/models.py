from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

UA = "Mozilla/5.0 (HydroGuide konsesjon-scraper)"
HERE = Path(__file__).parent.parent  # tools/minstevann/
_DATA_DIR = HERE / ".data"
CACHE_DIR = _DATA_DIR / "http"
LLM_CACHE_DIR = _DATA_DIR / "llm"
for _d in (CACHE_DIR, LLM_CACHE_DIR):
    _d.mkdir(parents=True, exist_ok=True)

MINIMUM_FLOW_DB_PATH = HERE.parent.parent / "backend" / "data" / "minimumflow.json"

KONSESJON_URL = "https://www.nve.no/konsesjon/konsesjonssaker/konsesjonssak?id={id}&type=V-1"
NVE_BASE = "https://www.nve.no"
NVE_ARCGIS_QUERY = (
    "https://gis3.nve.no/map/rest/services/Mapservices/VassdragsreguleringVannkraft"
    "/MapServer/1/query"
)

WORKSPACE_ROOT = HERE.parent.parent

DEFAULT_MODEL = "gemma4:e4b-it-q4_K_M"
DEFAULT_OLLAMA_HOST = os.environ.get("HG_OLLAMA_HOST", "http://localhost:11434")
DEFAULT_OLLAMA_TIMEOUT = int(os.environ.get("HG_OLLAMA_TIMEOUT", "90"))

MAX_TEXT_CHARS = 15000
CHUNK_THRESHOLD = 8000


@dataclass
class NveidResult:
    nveId: int
    source_kdb_nr: int
    navn: str
    konsesjon_url: str
    case_id: int | None = None
    fritekst_summary: str | None = None
    attachments_tried: list = field(default_factory=list)
    chosen_pdf_url: str | None = None
    chosen_pdf_title: str | None = None
    snippet_chars: int = 0
    snippet_kind: str = ""
    snippet_text: str = ""
    inventory_candidates: list[dict] = field(default_factory=list)
    llm_result: dict | None = None
    error: str | None = None
