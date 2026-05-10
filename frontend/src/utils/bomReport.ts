import type { DerivedResults, EquipmentBudgetRow, EquipmentRow, PlantConfiguration } from "../types";
import { formatNumber } from "./format";

const AMP_RE = /&/g;
const LT_RE = /</g;
const GT_RE = />/g;
const DQUOTE_RE = /"/g;
const SQUOTE_RE = /'/g;
const FILENAME_SAFE_RE = /[^a-zA-Z0-9a-zA-Z0-9æøåÆØÅ _-]/g;
const VAT_RATE = 0.25;

type BomLine = {
  id: string;
  product: string;
  quantity: number;
  unitPriceInclVat: number | null;
  totalInclVat: number | null;
  totalExclVat: number | null;
  url: string | null;
  description: string;
};

function esc(value: string): string {
  return value.replace(AMP_RE, "&amp;").replace(LT_RE, "&lt;").replace(GT_RE, "&gt;").replace(DQUOTE_RE, "&quot;").replace(SQUOTE_RE, "&#39;");
}

function toNumber(value: number | ""): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function currency(value: number | null): string {
  return value === null ? "—" : `kr ${formatNumber(value, 2)}`;
}

function reportDocId(config: PlantConfiguration, date: Date): string {
  const idHash = (config.id || "").replace(/[^a-zA-Z0-9]/g, "").slice(-4).toUpperCase().padStart(4, "0");
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `HG-${yyyy}-${mm}${dd}${idHash ? `-${idHash}` : ""}`;
}

function isUrl(value: string): boolean {
  return /^https?:\/\//i.test(value.trim());
}

function buildDescription(sourceRow: EquipmentRow, budgetRow: EquipmentBudgetRow | undefined): string {
  const comment = sourceRow.comment.trim();
  if (comment) return comment;

  const supplier = sourceRow.supplier.trim();
  if (supplier && !isUrl(supplier)) return supplier;

  if (budgetRow) {
    return `${formatNumber(budgetRow.powerW, 2)} W · ${formatNumber(budgetRow.runtimeHoursPerDay, 2)} t/d`;
  }

  return "";
}

function buildBomLines(config: PlantConfiguration, derivedResults: DerivedResults): BomLine[] {
  const budgetById = new Map(derivedResults.equipmentBudgetRows.map((row) => [row.id, row]));

  return config.equipmentRows
    .map((sourceRow) => {
      const budgetRow = budgetById.get(sourceRow.id);
      return { sourceRow, budgetRow };
    })
    .filter(({ budgetRow }) => budgetRow?.active)
    .map(({ sourceRow, budgetRow }) => {
      const quantity = 1;
      const unitPriceInclVat = toNumber(sourceRow.purchaseCost);
      const totalInclVat = unitPriceInclVat === null ? null : unitPriceInclVat * quantity;
      const totalExclVat = totalInclVat === null ? null : totalInclVat / (1 + VAT_RATE);
      const supplier = sourceRow.supplier.trim();

      return {
        id: sourceRow.id,
        product: sourceRow.name.trim() || "Uten navn",
        quantity,
        unitPriceInclVat,
        totalInclVat,
        totalExclVat,
        url: isUrl(supplier) ? supplier : null,
        description: buildDescription(sourceRow, budgetRow)
      };
    });
}

function sum(values: Array<number | null>): number {
  return values.reduce<number>((acc, value) => acc + (value ?? 0), 0);
}

function renderLink(url: string | null): string {
  if (!url) return `<td class="link-cell empty">—</td>`;
  return `<td class="link-cell"><a href="${esc(url)}" target="_blank" rel="noreferrer" aria-label="Åpne leverandør">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17 17 7M9 7h8v8"/></svg>
  </a></td>`;
}

function renderLine(line: BomLine): string {
  return `<tr>
    <td class="prod-cell">${esc(line.product)}</td>
    <td class="qty-cell">${formatNumber(line.quantity, 0)}</td>
    <td class="price-cell">${currency(line.unitPriceInclVat)}</td>
    <td class="price-cell">${currency(line.totalInclVat)}</td>
    <td class="price-cell">${currency(line.totalExclVat)}</td>
    ${renderLink(line.url)}
    <td class="desc-cell">${esc(line.description || "—")}</td>
  </tr>`;
}

function buildBomReportHtml(config: PlantConfiguration, derivedResults: DerivedResults): string {
  const now = new Date();
  const docId = reportDocId(config, now);
  const projectName = config.name.trim() || "Konfigurasjon";
  const lines = buildBomLines(config, derivedResults);
  const totalInclVat = sum(lines.map((line) => line.totalInclVat));
  const totalExclVat = sum(lines.map((line) => line.totalExclVat));
  const generated = new Intl.DateTimeFormat("nb-NO", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(now);
  const rowHtml = lines.length
    ? lines.map(renderLine).join("\n")
    : `<tr><td class="empty-row" colspan="7">Ingen aktive komponenter i komponentlisten.</td></tr>`;

  return `<!DOCTYPE html>
<html lang="nb">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>HydroGuide · BOM: ${esc(projectName)}</title>
<style>
  :root{
    --slate-50:#f8fafc;--slate-200:#e2e8f0;--slate-300:#cbd5e1;--slate-500:#64748b;--slate-700:#334155;--slate-950:#020617;
    --brand:#2563eb;--brand-700:#1d4ed8;--ink:var(--slate-950);--ink-2:var(--slate-700);--ink-3:var(--slate-500);
    --hairline:var(--slate-200);--hairline-2:var(--slate-300);--font-mono:"JetBrains Mono","SF Mono",ui-monospace,Menlo,Consolas,monospace;
    --page-w:297mm;--page-h:420mm;--page-pad-x:18mm;--page-pad-y:12mm;
  }
  *{box-sizing:border-box;margin:0;padding:0}
  html{font-size:14px;background:#eef2f7}
  body{font-family:"Manrope",system-ui,-apple-system,"Segoe UI",sans-serif;color:var(--ink);line-height:1.45;padding:24px 0 64px;-webkit-print-color-adjust:exact;print-color-adjust:exact;font-feature-settings:"tnum";}
  .toolbar{position:sticky;top:12px;z-index:50;width:var(--page-w);max-width:calc(100% - 32px);margin:0 auto 18px;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 14px;background:rgba(255,255,255,.94);border:1px solid var(--hairline);box-shadow:0 1px 2px rgba(15,23,42,.08);font-size:12px;}
  .toolbar .brand{font-family:var(--font-mono);font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--ink-2)}
  .toolbar button{font:inherit;font-weight:700;padding:8px 14px;cursor:pointer;border:1px solid var(--brand);background:var(--brand);color:#fff}
  .page{position:relative;width:var(--page-w);min-height:var(--page-h);margin:0 auto 18px;background:#fff;box-shadow:0 12px 32px -12px rgba(15,23,42,.16);overflow:hidden;padding:var(--page-pad-y) var(--page-pad-x);display:flex;flex-direction:column}
  .ds-head{border-top:2px solid var(--ink);padding-top:4px}
  .ds-head-row{display:flex;align-items:flex-end;justify-content:space-between;gap:24px;padding-bottom:5px;border-bottom:1px solid var(--ink)}
  .kicker{display:block;font-family:var(--font-mono);font-size:9px;font-weight:700;letter-spacing:.18em;text-transform:uppercase;color:var(--ink-3);margin-bottom:4px}
  h1{font-size:18px;font-weight:700;letter-spacing:-.01em;line-height:1;color:var(--ink)}
  .right{display:flex;flex-direction:column;align-items:flex-end;gap:3px;font-family:var(--font-mono);font-size:10px;color:var(--ink-3);letter-spacing:.06em;text-align:right}
  .docid{font-size:11px;font-weight:700;color:var(--ink)}
  table.bom{width:100%;border-collapse:collapse;font-size:12.6px;font-variant-numeric:tabular-nums;table-layout:fixed;border-top:1px solid var(--ink);border-bottom:1px solid var(--ink)}
  table.bom col.c-prod{width:auto}
  table.bom col.c-units{width:13mm}
  table.bom col.c-unit-price{width:31mm}
  table.bom col.c-tot-inc{width:31mm}
  table.bom col.c-tot-ex{width:31mm}
  table.bom col.c-link{width:9mm}
  table.bom col.c-desc{width:52mm}
  table.bom thead th{text-align:left;padding:7px 10px 6px;font-family:var(--font-mono);font-size:9.5px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--ink);border-bottom:1px solid var(--ink);background:var(--slate-50);vertical-align:middle;white-space:nowrap;border-right:1px solid var(--hairline)}
  table.bom thead th:first-child{padding-left:0}
  table.bom thead th:last-child{padding-right:0;border-right:0}
  table.bom tbody tr.cat td{padding:7px 0 6px;border-bottom:1px solid var(--hairline);border-top:1px solid var(--hairline-2);background:#edf3fb}
  .cat-inner{display:flex;align-items:baseline;gap:12px;padding:0 12px;border-left:3px solid var(--brand)}
  .cat-num{font-family:var(--font-mono);font-size:9.5px;font-weight:700;letter-spacing:.16em;color:var(--brand-700)}
  .cat-name{font-size:11.5px;font-weight:700;color:var(--ink);text-transform:uppercase;letter-spacing:.10em}
  table.bom tbody td{padding:7px 10px;border-bottom:1px solid var(--hairline);color:var(--ink-2);vertical-align:middle;line-height:1.25;border-right:1px solid var(--hairline)}
  table.bom tbody td:first-child{padding-left:0}
  table.bom tbody td:last-child{padding-right:0;border-right:0}
  .prod-cell{color:var(--ink);font-weight:700;letter-spacing:0;font-size:12.9px}
  .qty-cell{text-align:center;padding-left:0!important;padding-right:0!important;font-family:var(--font-mono);font-weight:700;color:var(--ink);white-space:nowrap}
  .price-cell{text-align:right;font-family:var(--font-mono);color:var(--ink);font-size:12.5px;font-weight:700;white-space:nowrap}
  .desc-cell{font-size:12.4px;font-weight:500;color:var(--ink-2);line-height:1.25;text-align:left}
  .link-cell{text-align:center}
  .link-cell a{display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;border:1px solid var(--hairline);color:var(--ink-3);text-decoration:none}
  .link-cell a svg{width:10px;height:10px}
  .link-cell.empty{color:var(--slate-300);font-family:var(--font-mono);font-size:12px;font-weight:600}
  .empty-row{padding:18px 0!important;text-align:center;color:var(--ink-3);font-family:var(--font-mono);font-size:11px}
  .ds-ribbon{display:grid;grid-template-columns:repeat(2,1fr);border-top:2px solid var(--ink);border-bottom:1px solid var(--hairline);margin-top:8px}
  .ds-ribbon .cell{padding:5px 12px;border-left:1px solid var(--hairline);display:flex;flex-direction:column;gap:2px}
  .ds-ribbon .cell:first-child{border-left:0;padding-left:0}
  .ds-ribbon .lbl{font-family:var(--font-mono);font-size:9px;font-weight:700;letter-spacing:.18em;text-transform:uppercase;color:var(--ink-3)}
  .ds-ribbon .val{font-family:var(--font-mono);font-size:15px;font-weight:700;color:var(--ink);line-height:1}
  .ds-ribbon .brand .val{color:var(--brand-700)}
  .ds-foot{margin-top:auto;padding-top:5px;border-top:1px solid var(--hairline);display:flex;justify-content:space-between;align-items:baseline;font-family:var(--font-mono);font-size:9px;color:var(--ink-3);letter-spacing:.08em}
  .pageno{font-weight:700;color:var(--ink)}
  @page{size:A3 portrait;margin:0}
  @media print{html,body{background:#fff}body{padding:0}.toolbar{display:none}.page{width:297mm;min-height:420mm;height:420mm;box-shadow:none;margin:0;page-break-after:auto;break-after:auto}}
</style>
</head>
<body>
<div class="toolbar"><div class="brand">HydroGuide · BOM</div><button onclick="window.print()">Last ned PDF</button></div>
<section class="page">
  <div class="ds-head">
    <div class="ds-head-row">
      <div><span class="kicker">Bestillingsliste</span><h1>${esc(projectName)}</h1></div>
      <div class="right"><span class="docid">${esc(docId)}</span><span>Versjon 1 · Utkast</span><span>Generert ${esc(generated)}</span></div>
    </div>
  </div>
  <table class="bom">
    <colgroup><col class="c-prod"/><col class="c-units"/><col class="c-unit-price"/><col class="c-tot-inc"/><col class="c-tot-ex"/><col class="c-link"/><col class="c-desc"/></colgroup>
    <thead><tr><th>Produkt</th><th class="qty-head">Antall</th><th>Stykkpris</th><th>Sum Inkl. mva</th><th>Sum Ekskl. mva</th><th></th><th>Beskrivelse</th></tr></thead>
    <tbody>
      <tr class="cat"><td colspan="7"><div class="cat-inner"><span class="cat-num">A</span><span class="cat-name">Komponentliste</span></div></td></tr>
      ${rowHtml}
    </tbody>
  </table>
  <div class="ds-ribbon">
    <div class="cell"><span class="lbl">Sum · kr inkl. mva</span><span class="val">${formatNumber(totalInclVat, 0)}</span></div>
    <div class="cell brand"><span class="lbl">Sum · kr ekskl. mva</span><span class="val">${formatNumber(totalExclVat, 0)}</span></div>
  </div>
  <div class="ds-foot"><span>${esc(docId)} · hydroguide.no/bestilling · A3 · 1 / 1</span><span class="pageno">1 / 1</span></div>
</section>
</body>
</html>`;
}

export function openBomReportWindow(config: PlantConfiguration, derivedResults: DerivedResults): void {
  const html = buildBomReportHtml(config, derivedResults);
  const win = window.open("", "_blank");

  if (win) {
    win.document.open();
    win.document.write(html);
    win.document.close();
    return;
  }

  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${(config.name || "bom-rapport").trim().replace(FILENAME_SAFE_RE, "") || "bom-rapport"}.html`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
