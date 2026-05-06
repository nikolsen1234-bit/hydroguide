from __future__ import annotations

from src.assembly import format_ls


def format_report(results: list) -> str:
    def _is_real_period(period: dict) -> bool:
        return any(period.get(key) is not None for key in ("ls", "periode", "note"))

    def _format_period(period: dict) -> str:
        ls_val = period.get("ls")
        periode = period.get("periode")
        note = period.get("note")
        label = format_ls(ls_val) if ls_val is not None else "-"
        if periode:
            label += f" ({periode})"
        if note:
            label = f"{label} - {note}" if label != "-" else str(note)
        return label

    def _real_periods(inntak: dict) -> list[dict]:
        return [
            period for period in (inntak.get("perioder") or [])
            if isinstance(period, dict) and _is_real_period(period)
        ]

    lines = []
    lines.append("=" * 78)
    lines.append("MINSTEVANNFORING-EKSTRAKSJON - resultater")
    lines.append("=" * 78)
    lines.append("")

    funnet_count = sum(1 for r in results if r.llm_result and r.llm_result.get("funnet"))
    lines.append(f"Totalt: {len(results)} NVEID")
    lines.append(f"Funnet: {funnet_count}")
    lines.append(f"Ikke funnet / feil: {len(results) - funnet_count}")
    lines.append("")
    lines.append("-" * 78)
    lines.append("")

    for r in results:
        llm = r.llm_result or {}
        status = "FUNNET" if llm.get("funnet") else "IKKE FUNNET"
        lines.append(f"[NVE {r.nveId}] {r.navn} - {status}")
        lines.append(f"  Konsesjonssak:  {r.konsesjon_url}")
        if r.chosen_pdf_url:
            lines.append(f"  Kilde-PDF:      {r.chosen_pdf_title}")
            lines.append(f"                  {r.chosen_pdf_url}")
        if r.snippet_kind:
            lines.append(f"  Snippet:        {r.snippet_kind} ({r.snippet_chars} tegn)")
        if r.error:
            lines.append(f"  FEIL:           {r.error}")

        if llm.get("funnet"):
            inntak_list = llm.get("inntak", []) or []
            real_inntak = [
                innt for innt in inntak_list
                if isinstance(innt, dict) and _real_periods(innt)
            ]
            if not real_inntak:
                lines.append("  (funnet=true men ingen inntak-data returnert)")
            for i, innt in enumerate(real_inntak, 1):
                lines.append("")
                inntak_navn = innt.get("navn") or f"Inntak {i}"
                inntak_type = innt.get("inntakstype") or innt.get("inntakFunksjon") or "?"
                lines.append(f"  Inntak {i}: {inntak_navn}  ({inntak_type})")
                period_text = "; ".join(_format_period(period) for period in _real_periods(innt))
                lines.append(f"    Minstevannforing: {period_text}")
        else:
            grunn = llm.get("grunn", "ukjent")
            lines.append(f"  Grunn:          {grunn}")
            raw = llm.get("_raw")
            if raw:
                lines.append("  Raa LLM-output:")
                for line in str(raw).splitlines()[:20]:
                    lines.append(f"    {line}")

        lines.append("")

    return "\n".join(lines)
