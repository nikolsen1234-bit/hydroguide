import json
import unittest
from types import SimpleNamespace
from unittest.mock import patch

from src.assembly import assemble_inntak_from_claims
from src.models import NveidResult
from src.snippet import extract_inntak_inventory, _sanitize_inventory_name
from src.minimumflow_db import format_minimumflow_entry, normalize_period
from src.llm import call_lm_studio
from src.report import format_report
import run as pipeline


BOTNEN_TEXT = """
1. Vannslipping
Det skal slippes en minstevannføring på minimum 5 l/s fra overføring A og B hele året.
Fra hovedinntaket skal det slippes 30 l/s i perioden 01.05-30.09 og 10 l/s resten av året.
Det er ikke gitt tillatelse til bygging av overføring C.
"""


SHARED_BEKK_TEXT = """
Vannslipping
Det skal slippes en minstevannføring forbi inntaken til Nystøylbekken og Fjellstøylbekken på 5 l/s hele året.
Dersom tilsiget er mindre enn kravet til minstevannføring skal hele tilsiget slippes forbi.
"""


AURLAND_TEXT = """
Manøvreringsreglement

A. Reguleringsmagasiner.
Kongshellervatn  1425 1438 1415 23,0
Øljuvatn  1421 1438 1400 38,0
Nyhellervatn  1364 1377 1364 13,0

B. Overføringer:
Avløpet fra Langedøla ved kote 1346 (66,3 km2) overføres til driftstunnelen for Aurland III.
Avløpet fra Veslegrøna ved Holmavatn (6,1 km2) føres over til StoreLiavatn i Langedøla.

Langedølagisen minstevassføring på 0,3 m3/sek. i tiden 1.juli-1.september.
For øvrig kan vannslippingen foregå etter Oslo Lysverkers behov.
"""


NULL_INVENTORY_TEXT = """
B. Overføringer:
Avløpet fra Veslegrøna ved Holmavatn (6,1 km2) føres over til StoreLiavatn i Langedøla.
"""


NOISY_OVERFORING_TEXT = """
B. Overføringer:
Fordeler og ulemper ved tiltaket.
Tabellen under viser feltareal ved inntaket.
De tillatte reguleringsgrenser markeres ved faste og tydelige vannstandsmerker.
"""


EMDALSELVA_TEXT = """
Det skal slippes minstevannføring forbi inntaket i Emdalselva på 0,35 m3/s i perioden fra 1. mai til 30. september.
Resten av året skal det slippes 0,05 m3/s.
"""


GENERIC_INNTAK_TEXT = """
Vannslipping
I tiden 1.5.-30.9. skal det slippes en minstevannføring på 500 l/s forbi inntaket.
Resten av året skal det slippes 100 l/s.
"""


DALE_TEXT = """
Det fastsettes en minstevannføring på 3,0 m3/s i Daleselva målt nedenfor utløpet fra Dalekraftverk.
"""


MADLAND_TEXT = """
I tiden 01.06 —30.09 skal det slippes en vannføring i Husåna fra Kvitlavatn på minst 55 l/s.
I Fossbekken skal det i perioden 01.06 —30.09 slippes en vannføring fra inntaksdammen på 35 l/s.
"""


def by_name(items: list[dict]) -> dict[str, dict]:
    return {item["navn"]: item for item in items if item.get("navn")}


def periods_for(item: dict) -> list[tuple[float | None, str | None]]:
    return [(period.get("ls"), period.get("periode")) for period in item.get("perioder", [])]


class FakeHttpResponse:
    def __init__(self, payload: dict):
        self.payload = payload

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False

    def read(self):
        return json.dumps(self.payload).encode("utf-8")


class LMStudioClientTests(unittest.TestCase):
    def test_call_lm_studio_uses_chat_completions_json_schema(self):
        captured = {}

        def fake_urlopen(req, timeout):
            captured["url"] = req.full_url
            captured["timeout"] = timeout
            captured["payload"] = json.loads(req.data.decode("utf-8"))
            return FakeHttpResponse({
                "choices": [
                    {
                        "message": {
                            "content": json.dumps({
                                "funnet": False,
                                "claims": [],
                                "tilleggs_krav": None,
                            })
                        }
                    }
                ]
            })

        with patch("src.llm.urlopen", fake_urlopen):
            raw = call_lm_studio(
                "prompt",
                model="gemma-4-e4b-it",
                host="http://127.0.0.1:1234",
                timeout=7,
            )

        self.assertEqual(captured["url"], "http://127.0.0.1:1234/v1/chat/completions")
        self.assertEqual(captured["timeout"], 7)
        self.assertEqual(captured["payload"]["model"], "gemma-4-e4b-it")
        self.assertEqual(captured["payload"]["temperature"], 0.1)
        self.assertEqual(captured["payload"]["top_p"], 0.95)
        self.assertEqual(captured["payload"]["top_k"], 64)
        self.assertEqual(captured["payload"]["max_tokens"], 2000)
        self.assertEqual(captured["payload"]["stream"], False)
        self.assertIn("messages", captured["payload"])
        self.assertEqual(captured["payload"]["response_format"]["type"], "json_schema")
        self.assertEqual(raw["response"], '{"funnet": false, "claims": [], "tilleggs_krav": null}')


class ExtractBackendRegressions(unittest.TestCase):
    maxDiff = None

    def test_botnen_shared_claim_is_split_and_mapped(self):
        llm = {
            "funnet": True,
            "claims": [
                {
                    "inntak_navn": "overføring A og B",
                    "tall": 5,
                    "enhet": "l/s",
                    "periode_sitat": "hele året",
                    "full_sitat": "Det skal slippes en minstevannføring på minimum 5 l/s fra overføring A og B hele året.",
                },
                {
                    "inntak_navn": "hovedinntaket",
                    "tall": 30,
                    "enhet": "l/s",
                    "periode_sitat": "01.05-30.09",
                    "full_sitat": "Fra hovedinntaket skal det slippes 30 l/s i perioden 01.05-30.09.",
                },
                {
                    "inntak_navn": "hovedinntaket",
                    "tall": 10,
                    "enhet": "l/s",
                    "periode_sitat": "resten av året",
                    "full_sitat": "Fra hovedinntaket skal det slippes 30 l/s i perioden 01.05-30.09 og 10 l/s resten av året.",
                },
            ],
            "tilleggs_krav": None,
        }
        inventory = extract_inntak_inventory(BOTNEN_TEXT, plant_name="Botnen")
        assembled = assemble_inntak_from_claims(
            llm,
            snippet=BOTNEN_TEXT,
            inventory=inventory,
            plant_name="Botnen",
        )

        names = by_name(assembled["inntak"])
        self.assertEqual(set(names), {"overføring A", "overføring B", "hovedinntaket"})
        self.assertEqual(periods_for(names["overføring A"]), [(5.0, "hele året")])
        self.assertEqual(periods_for(names["overføring B"]), [(5.0, "hele året")])
        self.assertIn((30.0, "01.05 - 30.09"), periods_for(names["hovedinntaket"]))
        self.assertIn((10.0, None), periods_for(names["hovedinntaket"]))

    def test_shared_bekk_claim_is_split(self):
        llm = {
            "funnet": True,
            "claims": [
                {
                    "inntak_navn": "Nystøylbekken og Fjellstøylbekken",
                    "tall": 5,
                    "enhet": "l/s",
                    "periode_sitat": "hele året",
                    "full_sitat": "Det skal slippes en minstevannføring forbi inntaken til Nystøylbekken og Fjellstøylbekken på 5 l/s hele året.",
                }
            ],
            "tilleggs_krav": None,
        }
        inventory = extract_inntak_inventory(
            SHARED_BEKK_TEXT,
            plant_name="Shared Bekkverk",
            claims=llm["claims"],
        )
        assembled = assemble_inntak_from_claims(
            llm,
            snippet=SHARED_BEKK_TEXT,
            inventory=inventory,
            plant_name="Shared Bekkverk",
        )

        names = by_name(assembled["inntak"])
        self.assertEqual(set(names), {"Nystøylbekken", "Fjellstøylbekken"})
        self.assertEqual(periods_for(names["Nystøylbekken"]), [(5.0, "hele året")])
        self.assertEqual(periods_for(names["Fjellstøylbekken"]), [(5.0, "hele året")])

    def test_voldsetelva_distributed_claims_stay_separate(self):
        llm = {
            "funnet": True,
            "claims": [
                {
                    "inntak_navn": "Rørtjønnelva",
                    "tall": 45,
                    "enhet": "l/s",
                    "periode_sitat": "hele året",
                    "full_sitat": "Det skal slippes 45 l/s hele året i Rørtjønnelva.",
                },
                {
                    "inntak_navn": "Nesvasselva",
                    "tall": 125,
                    "enhet": "l/s",
                    "periode_sitat": "hele året",
                    "full_sitat": "Det skal slippes 125 l/s hele året i Nesvasselva.",
                },
            ],
            "tilleggs_krav": None,
        }
        inventory = extract_inntak_inventory(
            "Det skal slippes 45 l/s hele året i Rørtjønnelva. Det skal slippes 125 l/s hele året i Nesvasselva.",
            plant_name="Voldsetelva",
            claims=llm["claims"],
        )
        assembled = assemble_inntak_from_claims(
            llm,
            snippet="Det skal slippes 45 l/s hele året i Rørtjønnelva. Det skal slippes 125 l/s hele året i Nesvasselva.",
            inventory=inventory,
            plant_name="Voldsetelva",
        )

        names = by_name(assembled["inntak"])
        self.assertEqual(periods_for(names["Rørtjønnelva"]), [(45.0, "hele året")])
        self.assertEqual(periods_for(names["Nesvasselva"]), [(125.0, "hele året")])

    def test_aurland_maps_claim_to_langedola_and_keeps_other_inventory(self):
        llm = {
            "funnet": True,
            "claims": [
                {
                    "inntak_navn": "Aurland",
                    "tall": 0.3,
                    "enhet": "m3/s",
                    "periode_sitat": "1.juli-1.september",
                    "full_sitat": "Langedølagisen minstevassføring på 0,3 m3/sek. i tiden 1.juli-1.september.",
                }
            ],
            "tilleggs_krav": None,
        }
        inventory = extract_inntak_inventory(AURLAND_TEXT, plant_name="Aurland 2 L")
        assembled = assemble_inntak_from_claims(
            llm,
            snippet=AURLAND_TEXT,
            inventory=inventory,
            plant_name="Aurland 2 L",
        )

        names = by_name(assembled["inntak"])
        self.assertIn("Langedøla", names)
        self.assertNotIn("Aurland", names)
        self.assertEqual(periods_for(names["Langedøla"]), [(300.0, "01.07 - 01.09")])
        self.assertIn("Kongshellervatn", names)
        self.assertEqual(periods_for(names["Kongshellervatn"]), [(None, None)])

    def test_facility_style_plant_name_filters_generic_prefix_but_keeps_real_single_name(self):
        self.assertIsNone(_sanitize_inventory_name("Aurland", plant_name="Aurland 2 L"))
        self.assertEqual(_sanitize_inventory_name("Laksen", plant_name="Laksen"), "Laksen")
        self.assertIsNone(_sanitize_inventory_name("Ho", plant_name="Krossdalselvi"))

    def test_dale_prefers_elv_over_kraftverk_label(self):
        llm = {
            "funnet": True,
            "claims": [
                {
                    "inntak_navn": "Daleselva",
                    "tall": 3.0,
                    "enhet": "m3/s",
                    "periode_sitat": "nedenfor utløpet",
                    "full_sitat": "Det fastsettes en minstevannføring på 3,0 m3/s i Daleselva målt nedenfor utløpet fra Dalekraftverk.",
                }
            ],
            "tilleggs_krav": None,
        }
        inventory = extract_inntak_inventory(DALE_TEXT, plant_name="Dale II", claims=llm["claims"])
        assembled = assemble_inntak_from_claims(
            llm,
            snippet=DALE_TEXT,
            inventory=inventory,
            plant_name="Dale II",
        )

        names = by_name(assembled["inntak"])
        self.assertIn("Daleselva", names)
        self.assertNotIn("Dalekraftverk", names)
        self.assertEqual(periods_for(names["Daleselva"]), [(3000.0, None)])

    def test_madland_contextual_names_beat_source_labels(self):
        llm = {
            "funnet": True,
            "claims": [
                {
                    "inntak_navn": "Kvitlavatn",
                    "tall": 55,
                    "enhet": "l/s",
                    "periode_sitat": "01.06 —30.09",
                    "full_sitat": "I tiden 01.06 —30.09 skal det slippes en vannføring i Husåna fra Kvitlavatn på minst 55 l/s.",
                },
                {
                    "inntak_navn": "IFossbekken",
                    "tall": 35,
                    "enhet": "l/s",
                    "periode_sitat": "01.06 —30.09",
                    "full_sitat": "I Fossbekken skal det i perioden 01.06 —30.09 slippes en vannføring fra inntaksdammen på 35 l/s.",
                },
            ],
            "tilleggs_krav": None,
        }
        inventory = extract_inntak_inventory(MADLAND_TEXT, plant_name="Madland", claims=llm["claims"])
        assembled = assemble_inntak_from_claims(
            llm,
            snippet=MADLAND_TEXT,
            inventory=inventory,
            plant_name="Madland",
        )

        names = by_name(assembled["inntak"])
        self.assertEqual(set(names), {"Husåna", "Fossbekken"})
        self.assertEqual(periods_for(names["Husåna"]), [(55.0, "01.06 - 30.09")])
        self.assertEqual(periods_for(names["Fossbekken"]), [(35.0, "01.06 - 30.09")])

    def test_multi_period_claims_keep_all_subperiods(self):
        llm = {
            "funnet": True,
            "claims": [
                {"inntak_navn": "hovedinntaket", "tall": 10, "enhet": "l/s", "periode_sitat": "01.05-31.05", "full_sitat": "Fra hovedinntaket skal det slippes 10 l/s i perioden 01.05-31.05."},
                {"inntak_navn": "hovedinntaket", "tall": 20, "enhet": "l/s", "periode_sitat": "01.06-31.08", "full_sitat": "Fra hovedinntaket skal det slippes 20 l/s i perioden 01.06-31.08."},
                {"inntak_navn": "hovedinntaket", "tall": 15, "enhet": "l/s", "periode_sitat": "01.09-30.09", "full_sitat": "Fra hovedinntaket skal det slippes 15 l/s i perioden 01.09-30.09."},
                {"inntak_navn": "hovedinntaket", "tall": 5, "enhet": "l/s", "periode_sitat": "01.10-30.04", "full_sitat": "Fra hovedinntaket skal det slippes 5 l/s i perioden 01.10-30.04."},
            ],
            "tilleggs_krav": None,
        }
        assembled = assemble_inntak_from_claims(
            llm,
            snippet=" ".join(claim["full_sitat"] for claim in llm["claims"]),
            inventory=[{"navn": "hovedinntaket", "inntakFunksjon": "inntak"}],
            plant_name="Flerperiodeverk",
        )

        item = by_name(assembled["inntak"])["hovedinntaket"]
        self.assertEqual(
            periods_for(item),
            [
                (10.0, "01.05 - 31.05"),
                (20.0, "01.06 - 31.08"),
                (15.0, "01.09 - 30.09"),
                (5.0, "01.10 - 30.04"),
            ],
        )

    def test_leikanger_realistic_multi_intake_case(self):
        llm = {
            "funnet": True,
            "claims": [
                {
                    "inntak_navn": "Grindselvi",
                    "tall": 164,
                    "enhet": "l/s",
                    "periode_sitat": "1. mai - 30. september",
                    "full_sitat": "Det skal slippes minstevannføring fra inntaket i Grindselvi på 164 l/s i perioden 1. mai - 30. september",
                },
                {
                    "inntak_navn": "Grindselvi",
                    "tall": 82,
                    "enhet": "l/s",
                    "periode_sitat": "1. oktober - 30. april",
                    "full_sitat": "Det skal slippes minstevannføring fra inntaket i Grindselvi på 164 l/s i perioden 1. mai - 30. september og 82 l/s i perioden 1. oktober - 30. april.",
                },
                {
                    "inntak_navn": "Henjaelvi",
                    "tall": 254,
                    "enhet": "l/s",
                    "periode_sitat": "1. mai - 31. mai",
                    "full_sitat": "Fra inntaket i Henjaelvi skal det slippes 254 l/s i perioden 1. mai - 31. mai",
                },
                {
                    "inntak_navn": "Henjaelvi",
                    "tall": 754,
                    "enhet": "l/s",
                    "periode_sitat": "1. juni - 15. august",
                    "full_sitat": "Fra inntaket i Henjaelvi skal det slippes 254 l/s i perioden 1. mai - 31. mai, 754 l/s i perioden 1. juni - 15. august, 254 l/s i perioden 16. august - 30. september, og 127 l/s i perioden 1. oktober - 30. april.",
                },
                {
                    "inntak_navn": "Henjaelvi",
                    "tall": 254,
                    "enhet": "l/s",
                    "periode_sitat": "16. august - 30. september",
                    "full_sitat": "Fra inntaket i Henjaelvi skal det slippes 254 l/s i perioden 1. mai - 31. mai, 754 l/s i perioden 1. juni - 15. august, 254 l/s i perioden 16. august - 30. september, og 127 l/s i perioden 1. oktober - 30. april.",
                },
                {
                    "inntak_navn": "Henjaelvi",
                    "tall": 127,
                    "enhet": "l/s",
                    "periode_sitat": "1. oktober - 30. april",
                    "full_sitat": "Fra inntaket i Henjaelvi skal det slippes 254 l/s i perioden 1. mai - 31. mai, 754 l/s i perioden 1. juni - 15. august, 254 l/s i perioden 16. august - 30. september, og 127 l/s i perioden 1. oktober - 30. april.",
                },
            ],
            "tilleggs_krav": "Ved ekstra vannuttak til drikkevannsforsyning må det slippes ekstra minstevannføring fra Trastadalsvatn/inntaket i Traståna.",
        }
        assembled = assemble_inntak_from_claims(
            llm,
            snippet=" ".join(claim["full_sitat"] for claim in llm["claims"]),
            inventory=[],
            plant_name="Leikanger kraftverk",
        )

        names = by_name(assembled["inntak"])
        self.assertEqual(
            periods_for(names["Grindselvi"]),
            [(164.0, "01.05 - 30.09"), (82.0, "01.10 - 30.04")],
        )
        self.assertEqual(
            periods_for(names["Henjaelvi"]),
            [
                (254.0, "01.05 - 31.05"),
                (754.0, "01.06 - 15.08"),
                (254.0, "16.08 - 30.09"),
                (127.0, "01.10 - 30.04"),
            ],
        )

    def test_laksen_old_dam_formulation(self):
        llm = {
            "funnet": True,
            "claims": [
                {
                    "inntak_navn": "Laksen",
                    "tall": 150,
                    "enhet": "l/s",
                    "periode_sitat": "1. juni — 15. oktober",
                    "full_sitat": "Minstevannføringer skal opprettholdes forbi dammen i Laksen: 1.juni —15. oktober 150 lls",
                },
                {
                    "inntak_navn": "Laksen",
                    "tall": 50,
                    "enhet": "l/s",
                    "periode_sitat": "16. oktober — 31. mai",
                    "full_sitat": "Minstevannføringer skal opprettholdes forbi dammen i Laksen: 16. oktober —31. mai 50 l/s",
                },
            ],
            "tilleggs_krav": None,
        }
        assembled = assemble_inntak_from_claims(
            llm,
            snippet=" ".join(claim["full_sitat"] for claim in llm["claims"]),
            inventory=[{"navn": "Laksen", "inntakFunksjon": None}],
            plant_name="Laksen",
        )

        item = by_name(assembled["inntak"])["Laksen"]
        self.assertEqual(
            periods_for(item),
            [(150.0, "01.06 - 15.10"), (50.0, "16.10 - 31.05")],
        )

    def test_funnet_false_preserves_inventory_with_nulls(self):
        inventory = extract_inntak_inventory(NULL_INVENTORY_TEXT, plant_name="Nullverk")
        assembled = assemble_inntak_from_claims(
            {"funnet": False, "grunn": "ingen eksplisitt minstevannføring", "claims": []},
            snippet=NULL_INVENTORY_TEXT,
            inventory=inventory,
            plant_name="Nullverk",
        )

        names = by_name(assembled["inntak"])
        self.assertIn("Veslegrøna", names)
        self.assertEqual(periods_for(names["Veslegrøna"]), [(None, None)])

    def test_funnet_false_without_inventory_still_returns_blank_shape(self):
        assembled = assemble_inntak_from_claims(
            {"funnet": False, "grunn": "ingen eksplisitt minstevannføring", "claims": []},
            snippet="Ingen eksplisitt minstevannføring nevnt.",
            inventory=[],
            plant_name="Tomverk",
        )

        self.assertNotIn("confidence", assembled)
        self.assertEqual(
            assembled["inntak"],
            [
                {
                    "navn": None,
                    "inntakFunksjon": None,
                    "perioder": [
                        {"ls": None, "periode": None, "note": None}
                    ],
                }
            ],
        )

    def test_overforing_section_does_not_promote_prose_lines_to_inventory(self):
        inventory = extract_inntak_inventory(NOISY_OVERFORING_TEXT, plant_name="Støyverk")
        self.assertEqual(inventory, [])

    def test_forbi_inntaket_name_stops_before_value(self):
        llm = {
            "funnet": True,
            "claims": [
                {
                    "inntak_navn": "Emdalselva",
                    "tall": 0.35,
                    "enhet": "m3/s",
                    "periode_sitat": "fra 1. mai til 30. september",
                    "full_sitat": "Det skal slippes minstevannføring forbi inntaket i Emdalselva på 0,35 m3/s i perioden fra 1. mai til 30. september.",
                },
                {
                    "inntak_navn": "Emdalselva",
                    "tall": 0.05,
                    "enhet": "m3/s",
                    "periode_sitat": "Resten av året",
                    "full_sitat": "Resten av året skal det slippes 0,05 m3/s.",
                },
            ],
            "tilleggs_krav": None,
        }
        inventory = extract_inntak_inventory(
            EMDALSELVA_TEXT,
            plant_name="Emdalselva",
            claims=llm["claims"],
        )
        assembled = assemble_inntak_from_claims(
            llm,
            snippet=EMDALSELVA_TEXT,
            inventory=inventory,
            plant_name="Emdalselva",
        )

        names = by_name(assembled["inntak"])
        self.assertIn("Emdalselva", names)
        self.assertNotIn("Emdalselva på 0", names)
        self.assertIn((350.0, "01.05 - 30.09"), periods_for(names["Emdalselva"]))
        self.assertIn((50.0, None), periods_for(names["Emdalselva"]))

    def test_generic_inntak_claim_does_not_create_fake_inventory_names(self):
        llm = {
            "funnet": True,
            "claims": [
                {
                    "inntak_navn": "Krossdalselvi",
                    "tall": 500,
                    "enhet": "l/s",
                    "periode_sitat": "1.5.-30.9.",
                    "full_sitat": "Vannslipping I tiden 1.5.-30.9. skal det slippes en minstevannføring på 500 l/s forbi inntaket.",
                },
                {
                    "inntak_navn": "Krossdalselvi",
                    "tall": 100,
                    "enhet": "l/s",
                    "periode_sitat": "Resten av året",
                    "full_sitat": "Resten av året skal det slippes 100 l/s.",
                },
            ],
            "tilleggs_krav": "Dersom tilsiget er mindre enn kravet til minstevannføring skal hele tilsiget slippes forbi.",
        }
        inventory = extract_inntak_inventory(
            GENERIC_INNTAK_TEXT,
            plant_name="Krossdalselvi",
            claims=llm["claims"],
        )
        assembled = assemble_inntak_from_claims(
            llm,
            snippet=GENERIC_INNTAK_TEXT,
            inventory=inventory,
            plant_name="Krossdalselvi",
        )

        self.assertEqual(inventory, [{"navn": "Krossdalselvi", "inntakFunksjon": None}])
        names = by_name(assembled["inntak"])
        self.assertEqual(set(names), {"Krossdalselvi"})
        self.assertIn((500.0, "01.05 - 30.09"), periods_for(names["Krossdalselvi"]))
        self.assertIn((100.0, None), periods_for(names["Krossdalselvi"]))

    def test_same_value_period_group_expands_from_full_sitat(self):
        llm = {
            "funnet": True,
            "claims": [
                {
                    "inntak_navn": "Bergselvi",
                    "tall": 200,
                    "enhet": "l/s",
                    "periode_sitat": "1.5-31.5.",
                    "full_sitat": (
                        "I periodene 1.5-31.5. og 1.9-30.9. skal det slippes "
                        "200 l/s, og 1.6-31.8 skal det slippes 300 l/s."
                    ),
                },
                {
                    "inntak_navn": "Bergselvi",
                    "tall": 300,
                    "enhet": "l/s",
                    "periode_sitat": "1.6-31.8",
                    "full_sitat": (
                        "I periodene 1.5-31.5. og 1.9-30.9. skal det slippes "
                        "200 l/s, og 1.6-31.8 skal det slippes 300 l/s."
                    ),
                },
            ],
        }

        assembled = assemble_inntak_from_claims(
            llm,
            snippet=llm["claims"][0]["full_sitat"],
            inventory=[],
            plant_name="Bergselvi",
        )

        names = by_name(assembled["inntak"])
        self.assertIn((200.0, "01.05 - 31.05"), periods_for(names["Bergselvi"]))
        self.assertIn((200.0, "01.09 - 30.09"), periods_for(names["Bergselvi"]))
        self.assertIn((300.0, "01.06 - 31.08"), periods_for(names["Bergselvi"]))

    def test_compact_numeric_period_without_dash_is_normalized(self):
        assembled = assemble_inntak_from_claims(
            {
                "funnet": True,
                "claims": [
                    {
                        "inntak_navn": "Litl-Hynna",
                        "tall": 50,
                        "enhet": "l/s",
                        "periode_sitat": "01.10.30.04.",
                        "full_sitat": "I tiden 01.10.30.04. skal det slippes 50 l/s.",
                    }
                ],
            },
            snippet="I tiden 01.10.30.04. skal det slippes 50 l/s.",
            inventory=[],
            plant_name="Hynna",
        )

        names = by_name(assembled["inntak"])
        self.assertEqual(periods_for(names["Litl-Hynna"]), [(50.0, "01.10 - 30.04")])

    def test_generic_kraftverket_claim_becomes_null_name(self):
        assembled = assemble_inntak_from_claims(
            {
                "funnet": True,
                "claims": [
                    {
                        "inntak_navn": "kraftverket",
                        "tall": 10,
                        "enhet": "m3/s",
                        "periode_sitat": "1. juni -31. august",
                        "full_sitat": "Konsesjonæren tilpliktes i perioden 1. juni -31. august å slippe en minstevassføring på 10 m31s i en prøveperiode på 5 år.",
                    },
                    {
                        "inntak_navn": "kraftverket",
                        "tall": 0.5,
                        "enhet": "m3/s",
                        "periode_sitat": "1. september til 31. mai",
                        "full_sitat": "I perioden 1. september til 31. mai tilpliktes konsesjonæren å slippe en minstevassføring på 0,5 m3/s.",
                    },
                ],
                "tilleggs_krav": None,
            },
            snippet="I perioden 1. september til 31. mai tilpliktes konsesjonæren å slippe en minstevassføring på 0,5 m3/s.",
            inventory=[],
            plant_name="Pikerfoss",
        )

        self.assertIsNone(assembled["inntak"][0]["navn"])
        self.assertEqual(
            periods_for(assembled["inntak"][0]),
            [(10000.0, "01.06 - 31.08"), (500.0, "01.09 - 31.05")],
        )

    def test_inntil_average_claim_is_rejected(self):
        assembled = assemble_inntak_from_claims(
            {
                "funnet": True,
                "claims": [
                    {
                        "inntak_navn": None,
                        "tall": 1,
                        "enhet": "m3/s",
                        "periode_sitat": "i gjennomsnitt",
                        "full_sitat": "Konsesjonæren plikter å slippe en vannføring forbi dammen inntil 1 m3/s i gjennomsnitt.",
                    }
                ],
                "tilleggs_krav": None,
            },
            snippet="Konsesjonæren plikter å slippe en vannføring forbi dammen inntil 1 m3/s i gjennomsnitt.",
            inventory=[],
            plant_name="Ugyldigcase",
        )

        self.assertFalse(assembled["funnet"])
        self.assertNotIn("confidence", assembled)
        self.assertEqual(
            assembled["inntak"],
            [
                {
                    "navn": None,
                    "inntakFunksjon": None,
                    "perioder": [
                        {"ls": None, "periode": None, "note": None}
                    ],
                }
            ],
        )

    def test_formatter_never_outputs_seasonal_fields(self):
        result = NveidResult(
            nveId=1696,
            source_kdb_nr=123,
            navn="Testverk",
            konsesjon_url="https://example.test/konsesjon",
            llm_result={
                "funnet": True,
                "inntak": [
                    {
                        "inntakFunksjon": "hovedinntak",
                        "perioder": [
                            {"ls": 30, "periode": "01.05 - 30.09", "note": None}
                        ],
                    }
                ],
            },
        )

        entry = format_minimumflow_entry(result)
        item = entry["inntak"][0]
        self.assertEqual(set(item), {"inntakFunksjon", "perioder"})

    def test_formatter_outputs_empty_public_shape_for_failed_station(self):
        result = NveidResult(
            nveId=1696,
            source_kdb_nr=123,
            navn="Testverk",
            konsesjon_url="https://example.test/konsesjon",
            llm_result={"funnet": False, "grunn": "feil ved nedlasting"},
        )

        self.assertEqual(
            format_minimumflow_entry(result),
            {
                "navn": "Testverk",
                "funnet": False,
                "inntak": [
                    {
                        "inntakFunksjon": None,
                        "perioder": [
                            {"ls": None, "periode": None, "note": None}
                        ],
                    }
                ],
            },
        )

    def test_report_renders_period_based_inntak(self):
        result = NveidResult(
            nveId=1696,
            source_kdb_nr=123,
            navn="Testverk",
            konsesjon_url="https://example.test/konsesjon",
            llm_result={
                "funnet": True,
                "inntak": [
                    {
                        "inntakFunksjon": "hovedinntak",
                        "perioder": [
                            {"ls": 120, "periode": "01.05 - 30.09", "note": None},
                            {"ls": 40, "periode": "01.10 - 30.04", "note": None},
                        ],
                    }
                ],
            },
        )

        report = format_report([result])

        self.assertIn("Minstevannforing: 120 l/s (01.05 - 30.09); 40 l/s (01.10 - 30.04)", report)
        self.assertNotIn("ingen inntak-data returnert", report)


from src.pdf_preparse import classify_elements, RELEVANCE_RE, CONTENT_TYPES


class TestPreparsClassification(unittest.TestCase):
    def test_scanned_pdf_elements(self):
        elements = [{"type": "image", "content": ""}]
        cls, text = classify_elements(elements)
        self.assertEqual(cls, "scanned")
        self.assertEqual(text, "")

    def test_digital_good(self):
        elements = [
            {"type": "heading", "content": "Vilkår"},
            {"type": "paragraph", "content": "Det skal slippes en minstevannføring på 100 l/s."},
            {"type": "paragraph", "content": "I perioden 1. mai til 30. september."},
        ]
        cls, text = classify_elements(elements)
        self.assertEqual(cls, "good")
        self.assertIn("minstevannføring", text)
        self.assertIn("100 l/s", text)

    def test_digital_no_relevance(self):
        elements = [
            {"type": "paragraph", "content": "Dette er en generell beskrivelse av kraftverket."},
            {"type": "paragraph", "content": "Nedbørfeltet er 50 km2."},
        ]
        cls, text = classify_elements(elements)
        self.assertEqual(cls, "bad")

    def test_digital_low_text(self):
        elements = [
            {"type": "paragraph", "content": "Kort."},
        ]
        cls, text = classify_elements(elements)
        self.assertEqual(cls, "bad")

    def test_empty_elements(self):
        cls, text = classify_elements([])
        self.assertEqual(cls, "scanned")
        self.assertEqual(text, "")


class TestResultFirstPipeline(unittest.TestCase):
    def test_formatter_uses_nveid_public_shape_without_kdbnr(self):
        result = NveidResult(
            nveId=1696,
            source_kdb_nr=123,
            navn="Testverk",
            konsesjon_url="https://example.test/konsesjon",
            llm_result={
                "funnet": True,
                "inntak": [
                    {
                        "inntakFunksjon": "hovedinntak",
                        "perioder": [
                            {"ls": 120, "periode": "1. mai - 30. september", "note": None},
                            {"ls": 40, "periode": "1. oktober - 30. april", "note": None},
                        ],
                    }
                ],
            },
        )

        self.assertEqual(
            format_minimumflow_entry(result),
            {
                "navn": "Testverk",
                "funnet": True,
                "inntak": [
                    {
                        "inntakFunksjon": "hovedinntak",
                        "perioder": [
                            {"ls": 120, "periode": "01.05 - 30.09", "note": None},
                            {"ls": 40, "periode": "01.10 - 30.04", "note": None},
                        ],
                    }
                ],
            },
        )

    def test_normalize_period_accepts_numeric_and_month_names(self):
        self.assertEqual(normalize_period("01.05-30.09"), "01.05 - 30.09")
        self.assertEqual(normalize_period("01.10.30.04."), "01.10 - 30.04")
        self.assertEqual(normalize_period("1. mai - 30. september"), "01.05 - 30.09")
        self.assertEqual(normalize_period("1. september til 31. mai"), "01.09 - 31.05")
        self.assertEqual(normalize_period("15.05til 15.09"), "15.05 - 15.09")
        self.assertEqual(normalize_period("sommersesongen (1/5-30/9"), "01.05 - 30.09")
        self.assertEqual(normalize_period("hele året"), "hele året")
        self.assertEqual(normalize_period("hele året, antatt"), "hele året")
        self.assertIsNone(normalize_period("01.10.30.04. råtekst"))

    def test_batch_writes_public_minimumflow_entries_directly(self):
        result = NveidResult(
            nveId=1696,
            source_kdb_nr=123,
            navn="Testverk",
            konsesjon_url="https://example.test/konsesjon",
            llm_result={
                "funnet": True,
                "inntak": [
                    {
                        "inntakFunksjon": "hovedinntak",
                        "perioder": [
                            {"ls": 120, "periode": "1. mai - 30. september", "note": None},
                            {"ls": 40, "periode": "1. oktober - 30. april", "note": None},
                        ],
                    }
                ],
            },
        )
        saved = {}

        args = SimpleNamespace(
            n=1,
            seed=7,
            model="test-model",
            host="http://lmstudio.test",
            use_cache=True,
            force=False,
        )

        with (
            patch.object(pipeline, "fetch_all_plants", return_value=[
                {"nveId": 1696, "kdbNr": 123, "navn": "Testverk"}
            ]),
            patch.object(pipeline, "load_minimumflow_db", return_value={}),
            patch.object(pipeline, "save_minimumflow_db", side_effect=lambda db: saved.update(db)),
            patch.object(pipeline, "run_station", return_value=result),
            patch.object(pipeline, "format_report", return_value="rapport"),
        ):
            pipeline.cmd_batch(args)

        self.assertEqual(
            saved["1696"],
            {
                "navn": "Testverk",
                "funnet": True,
                "inntak": [
                    {
                        "inntakFunksjon": "hovedinntak",
                        "perioder": [
                            {"ls": 120, "periode": "01.05 - 30.09", "note": None},
                            {"ls": 40, "periode": "01.10 - 30.04", "note": None},
                        ],
                    }
                ],
            },
        )

    def test_plant_writes_public_minimumflow_entry_directly(self):
        result = NveidResult(
            nveId=1696,
            source_kdb_nr=123,
            navn="Testverk",
            konsesjon_url="https://example.test/konsesjon",
            llm_result={"funnet": False, "grunn": "ingen digitaliserte vedlegg"},
        )
        saved = {}
        args = SimpleNamespace(
            nve_id=["1696"],
            model="test-model",
            host="http://lmstudio.test",
            no_cache=False,
            force=False,
        )

        with (
            patch.object(pipeline, "fetch_plants_from_nve_ids", return_value={
                1696: {"nveId": 1696, "kdbNr": 123, "navn": "Testverk"}
            }),
            patch.object(pipeline, "load_minimumflow_db", return_value={}),
            patch.object(pipeline, "save_minimumflow_db", side_effect=lambda db: saved.update(db)),
            patch.object(pipeline, "run_station", return_value=result) as run_station,
            patch.object(pipeline, "format_report", return_value="rapport"),
        ):
            pipeline.cmd_plant(args)

        run_station.assert_called_once()
        self.assertEqual(saved["1696"]["funnet"], False)
        self.assertEqual(saved["1696"]["inntak"][0]["inntakFunksjon"], None)
        self.assertEqual(
            saved["1696"]["inntak"][0]["perioder"],
            [{"ls": None, "periode": None, "note": None}],
        )

    def test_existing_entry_is_skipped_without_force(self):
        saved = {}
        args = SimpleNamespace(
            nve_id=["1696"],
            model="test-model",
            host="http://lmstudio.test",
            no_cache=False,
            force=False,
        )

        with (
            patch.object(pipeline, "fetch_plants_from_nve_ids", return_value={
                1696: {"nveId": 1696, "kdbNr": 123, "navn": "Testverk"}
            }),
            patch.object(pipeline, "load_minimumflow_db", return_value={
                "1696": {"navn": "Old", "funnet": False, "inntak": []}
            }),
            patch.object(pipeline, "save_minimumflow_db", side_effect=lambda db: saved.update(db)),
            patch.object(pipeline, "run_station") as run_station,
        ):
            pipeline.cmd_plant(args)

        run_station.assert_not_called()
        self.assertEqual(saved, {})

    def test_force_overwrites_existing_entry(self):
        result = NveidResult(
            nveId=1696,
            source_kdb_nr=123,
            navn="Testverk",
            konsesjon_url="https://example.test/konsesjon",
            llm_result={"funnet": True, "inntak": []},
        )
        saved = {}
        args = SimpleNamespace(
            nve_id=["1696"],
            model="test-model",
            host="http://lmstudio.test",
            no_cache=False,
            force=True,
        )

        with (
            patch.object(pipeline, "fetch_plants_from_nve_ids", return_value={
                1696: {"nveId": 1696, "kdbNr": 123, "navn": "Testverk"}
            }),
            patch.object(pipeline, "load_minimumflow_db", return_value={
                "1696": {"navn": "Old", "funnet": False, "inntak": []}
            }),
            patch.object(pipeline, "save_minimumflow_db", side_effect=lambda db: saved.update(db)),
            patch.object(pipeline, "run_station", return_value=result) as run_station,
            patch.object(pipeline, "format_report", return_value="rapport"),
        ):
            pipeline.cmd_plant(args)

        run_station.assert_called_once()
        self.assertEqual(saved["1696"]["navn"], "Testverk")
        self.assertEqual(saved["1696"]["funnet"], True)

    def test_parser_removes_export_and_batch_resume(self):
        parser = pipeline.build_parser()
        help_text = parser.format_help()
        self.assertNotIn("export", help_text)
        with self.assertRaises(SystemExit):
            parser.parse_args(["batch", "--resume"])


if __name__ == "__main__":
    unittest.main()
