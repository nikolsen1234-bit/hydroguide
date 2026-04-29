from __future__ import annotations

from src.assembly import format_ls


def format_report(results: list) -> str:
    def _format_bucket(inntak: dict, bucket: str) -> list[str]:
        details = inntak.get(f"{bucket}_delperioder") or []
        if details:
            if len(details) == 1:
                d = details[0]
                label = f"{format_ls(d.get('ls'))}"
                if d.get("periode"):
                    label += f" ({d['periode']})"
                return [label]
            return [
                f"{format_ls(d.get('ls'))} ({d.get('periode') or 'ukjent periode'})"
                for d in details
            ]

        ls_val = inntak.get(f"{bucket}_ls")
        period = inntak.get(f"{bucket}_periode")
        if ls_val is None and not period:
            legacy = inntak.get(f"minstevannforing_{bucket}")
            return [legacy] if legacy else ["-"]
        label = format_ls(ls_val) if ls_val is not None else "-"
        if period:
            label += f" ({period})"
        return [label]

    lines = []
    lines.append("=" * 78)
    lines.append("MINSTEVANNFORING-EKSTRAKSJON - resultater")
    lines.append("=" * 78)
    lines.append("")

    funnet_count = sum(1 for r in results if r.llm_result and r.llm_result.get("funnet"))
    lines.append(f"Totalt: {len(results)} kraftverk")
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
                if isinstance(innt, dict) and (
                    innt.get("navn")
                    or innt.get("minstevannforing_sommer")
                    or innt.get("minstevannforing_vinter")
                    or innt.get("sommer_ls") is not None
                    or innt.get("vinter_ls") is not None
                    or innt.get("sommer_delperioder")
                    or innt.get("vinter_delperioder")
                )
            ]
            if not real_inntak:
                lines.append("  (funnet=true men ingen inntak-data returnert)")
            for i, innt in enumerate(real_inntak, 1):
                lines.append("")
                inntak_navn = innt.get("navn") or f"Inntak {i}"
                inntak_type = innt.get("inntakstype") or innt.get("inntakFunksjon") or "?"
                lines.append(f"  Inntak {i}: {inntak_navn}  ({inntak_type})")
                sommer_lines = _format_bucket(innt, "sommer")
                vinter_lines = _format_bucket(innt, "vinter")
                lines.append(f"    Minstevannforing sommer: {sommer_lines[0]}")
                for extra in sommer_lines[1:]:
                    lines.append(f"                              {extra}")
                lines.append(f"    Minstevannforing vinter: {vinter_lines[0]}")
                for extra in vinter_lines[1:]:
                    lines.append(f"                              {extra}")
                andre = innt.get("andre_krav")
                if andre:
                    lines.append(f"    Andre krav:              {andre}")
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
