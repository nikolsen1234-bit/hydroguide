import type { DerivedResults, PlantConfiguration } from "../types";

const AMP_RE = /&/g;
const LT_RE = /</g;
const GT_RE = />/g;
const DQUOTE_RE = /"/g;
const SQUOTE_RE = /'/g;
const FILENAME_SAFE_RE = /[^a-zA-Z0-9æøåÆØÅ _-]/g;
const DOC_ID = "HG-E85DE351";

type ComponentListLine = {
  component: string;
  quantity: number;
  unitPriceInclVat: number;
  totalExclVat: number;
  totalInclVat: number;
  url: string | null;
  website: string | null;
};

const HYDROGUIDE_COMPONENTS: ComponentListLine[] = [
  {
    component: "Victron LiFePO4 12,8V 300Ah",
    quantity: 2,
    unitPriceInclVat: 20495,
    totalExclVat: 32792,
    totalInclVat: 40990,
    url: "https://skanbatt.no/product/6867368/victron-lifepo4-battery-12-8v-200ah-smart",
    website: "skanbatt.no"
  },
  {
    component: "Victron BMS",
    quantity: 1,
    unitPriceInclVat: 1259,
    totalExclVat: 1007.2,
    totalInclVat: 1259,
    url: "https://skanbatt.no/product/11440660/victron-smallbms-ng",
    website: "skanbatt.no"
  },
  {
    component: "VICTRON Lynx Distributor",
    quantity: 1,
    unitPriceInclVat: 2989,
    totalExclVat: 2391.2,
    totalInclVat: 2989,
    url: "https://skanbatt.no/product/8797037/victron-lynx-distributor-m10",
    website: "skanbatt.no"
  },
  {
    component: "VICTRON Orion TR DC-DC 12>24V 10A",
    quantity: 1,
    unitPriceInclVat: 1849,
    totalExclVat: 1479.2,
    totalInclVat: 1849,
    url: "https://skanbatt.no/product/1633804/victron-orion-tr-omformer-dc-dc-12-24v-5a-galvanisk-isolert",
    website: "skanbatt.no"
  },
  {
    component: "Victron Cerbo GX - MK2",
    quantity: 1,
    unitPriceInclVat: 3489,
    totalExclVat: 2791.2,
    totalInclVat: 3489,
    url: "https://skanbatt.no/product/9401120/victron-cerbo-gx-mk2",
    website: "skanbatt.no"
  },
  {
    component: "VICTRON SmartSolar MPPT 250/100-TR VE.Can",
    quantity: 1,
    unitPriceInclVat: 9890,
    totalExclVat: 7912,
    totalInclVat: 9890,
    url: "https://skanbatt.no/product/424458/victron-blue-solar-mppt-75-15-u-blatann",
    website: "skanbatt.no"
  },
  {
    component: "Trina Solar 425W",
    quantity: 2,
    unitPriceInclVat: 1079,
    totalExclVat: 1726.4,
    totalInclVat: 2158,
    url: "https://www.elektroimportoren.no/trina-solar-de09r-08-425-w-solcellepanel/6607207/Product.html",
    website: "elektroimportoren.no"
  },
  {
    component: "Efoy Pro 1800",
    quantity: 1,
    unitPriceInclVat: 88000,
    totalExclVat: 70400,
    totalInclVat: 88000,
    url: "https://www.awilco.dk/product/fuel-cells/methanol-fuel-cells/efoy-pro-fuel-cells/efoy-fuel-cell-pro-1800-op-set-12-24v-dc-125w/",
    website: "awilco.dk"
  },
  {
    component: "Efoy Fuel Manager FM4",
    quantity: 1,
    unitPriceInclVat: 21900,
    totalExclVat: 17520,
    totalInclVat: 21900,
    url: "https://www.awilco.dk/product/fuel-cells/methanol-fuel/accessories-for-methanol-cartridges/efoy-fm4-set/",
    website: "awilco.dk"
  },
  {
    component: "Efoy 28L Methanol",
    quantity: 6,
    unitPriceInclVat: 2771.25,
    totalExclVat: 13302,
    totalInclVat: 16627.5,
    url: "https://www.awilco.dk/product/fuel-cells/methanol-fuel/efoy-methanol/efoy-methanol-energy-cartridge-28l/",
    website: "awilco.dk"
  },
  {
    component: "Efoy M28 Nozzle Adapter",
    quantity: 4,
    unitPriceInclVat: 3125,
    totalExclVat: 10000,
    totalInclVat: 12500,
    url: "https://www.awilco.dk/product/fuel-cells/methanol-fuel/accessories-for-methanol-cartridges/efoy-m28-adapter-for-pro-series/",
    website: "awilco.dk"
  },
  {
    component: "Teltonika RUT956",
    quantity: 1,
    unitPriceInclVat: 3000,
    totalExclVat: 2400,
    totalInclVat: 3000,
    url: "https://www.avxperten.no/4g-router/teltonika-rut956-300-mbps-lte-router-wifi-4.asp?srsltid=AfmBOoqXmJb4LtiWF-xvGEtO_FWXygsNg8qNvgp9h6CWp8XlW-RhW8Ac",
    website: "avxperten.no"
  },
  {
    component: "Siemens Sitrans FMS5020",
    quantity: 1,
    unitPriceInclVat: 26196,
    totalExclVat: 26196,
    totalInclVat: 32745,
    url: null,
    website: null
  },
  {
    component: "Dataloggar (2 stk + backup)",
    quantity: 1,
    unitPriceInclVat: 20000,
    totalExclVat: 20000,
    totalInclVat: 25000,
    url: null,
    website: null
  },
  {
    component: "Kabel kit standard for trekkrør",
    quantity: 8,
    unitPriceInclVat: 127.84,
    totalExclVat: 818.18,
    totalInclVat: 1022.72,
    url: null,
    website: null
  }
];

function esc(value: string): string {
  return value.replace(AMP_RE, "&amp;").replace(LT_RE, "&lt;").replace(GT_RE, "&gt;").replace(DQUOTE_RE, "&quot;").replace(SQUOTE_RE, "&#39;");
}

function money(value: number): string {
  return `kr ${value.toLocaleString("nb-NO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function plainMoney(value: number): string {
  return value.toLocaleString("nb-NO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function sum(values: number[]): number {
  return values.reduce((acc, value) => acc + value, 0);
}

function renderLink(line: ComponentListLine): string {
  if (!line.url || !line.website) return `<td class="link-cell empty" data-label="Nettside"></td>`;

  return `<td class="link-cell" data-label="Nettside"><a href="${esc(line.url)}" target="_blank" rel="noreferrer">${esc(line.website)}</a></td>`;
}

function renderLine(line: ComponentListLine): string {
  return `<tr>
        <td class="prod-cell" data-label="Komponent">${esc(line.component)}</td>
        <td class="qty-cell" data-label="Antall">${line.quantity}</td>
        <td class="price-cell" data-label="Stykkpris">${money(line.unitPriceInclVat)}</td>
        <td class="price-cell" data-label="Pris ekskl. mva">${money(line.totalExclVat)}</td>
        <td class="price-cell" data-label="Pris inkl. mva">${money(line.totalInclVat)}</td>
        ${renderLink(line)}
      </tr>`;
}

function buildComponentListHtml(config: PlantConfiguration): string {
  const projectName = config.name.trim() || "HydroGuide";
  const totalExclVat = sum(HYDROGUIDE_COMPONENTS.map((line) => line.totalExclVat));
  const totalInclVat = sum(HYDROGUIDE_COMPONENTS.map((line) => line.totalInclVat));
  const generated = new Intl.DateTimeFormat("nb-NO", { day: "2-digit", month: "long", year: "numeric" }).format(new Date());
  const rowsJson = JSON.stringify(HYDROGUIDE_COMPONENTS).replace(/</g, "\\u003c");

  return `<!DOCTYPE html>
<html lang="nb">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>HydroGuide · Komponentliste: ${esc(projectName)}</title>
<style>
  :root{
    --slate-50:#f8fafc;--slate-200:#e2e8f0;--slate-300:#cbd5e1;--slate-500:#64748b;--slate-700:#334155;--slate-950:#020617;
    --brand:#2563eb;--ink:var(--slate-950);--ink-2:var(--slate-700);--ink-3:var(--slate-500);
    --hairline:var(--slate-200);--font-mono:"JetBrains Mono","SF Mono",ui-monospace,Menlo,Consolas,monospace;
    --page-w:297mm;--page-h:420mm;--page-pad-x:18mm;--page-pad-y:12mm;
  }
  *{box-sizing:border-box;margin:0;padding:0}
  html{font-size:16px;background:#eef2f7}
  body{font-family:"Manrope",system-ui,-apple-system,"Segoe UI",sans-serif;color:var(--ink);line-height:1.45;padding:24px 0 64px;-webkit-print-color-adjust:exact;print-color-adjust:exact;font-feature-settings:"tnum";}
  .toolbar{position:sticky;top:12px;z-index:50;width:var(--page-w);max-width:calc(100% - 32px);margin:0 auto 18px;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 14px;background:rgba(255,255,255,.94);border:1px solid var(--hairline);box-shadow:0 1px 2px rgba(15,23,42,.08);font-size:13px}
  .toolbar .brand{font-family:var(--font-mono);font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--ink-2)}
  .toolbar-actions{display:flex;align-items:center;justify-content:flex-end;gap:8px;flex-wrap:wrap}
  .toolbar button{font:inherit;font-weight:700;padding:8px 14px;cursor:pointer;border:1px solid var(--brand);background:var(--brand);color:#fff}
  .page{position:relative;width:var(--page-w);min-height:var(--page-h);margin:0 auto 18px;background:#fff;box-shadow:0 12px 32px -12px rgba(15,23,42,.16);overflow:hidden;padding:var(--page-pad-y) var(--page-pad-x);display:flex;flex-direction:column}
  .ds-head{border-top:2px solid var(--ink);padding-top:4px}
  .ds-head-row{display:flex;align-items:flex-end;justify-content:space-between;gap:24px;padding-bottom:5px;border-bottom:1px solid var(--ink)}
  h1{font-size:24px;font-weight:700;letter-spacing:-.01em;line-height:1;color:var(--ink)}
  .right{display:flex;flex-direction:column;align-items:flex-end;gap:3px;font-family:var(--font-mono);font-size:12px;color:var(--ink-3);letter-spacing:.06em;text-align:right}
  .docid{font-size:13px;font-weight:700;color:var(--ink)}
  table.component-list{width:100%;border-collapse:collapse;font-size:14px;font-variant-numeric:tabular-nums;table-layout:fixed;border:1px solid var(--ink)}
  table.component-list caption{position:absolute;left:-9999px}
  table.component-list col.c-prod{width:70mm}
  table.component-list col.c-units{width:16mm}
  table.component-list col.c-unit-price{width:36mm}
  table.component-list col.c-tot-ex{width:40mm}
  table.component-list col.c-tot-inc{width:40mm}
  table.component-list col.c-link{width:59mm}
  table.component-list th,table.component-list td{border:1px solid var(--hairline);padding:7px 5px;vertical-align:middle;line-height:1.24;overflow:hidden}
  table.component-list thead th{text-align:left;font-family:var(--font-mono);font-size:14px;font-weight:900;letter-spacing:.02em;text-transform:uppercase;color:var(--ink);border-bottom:2px solid var(--ink);background:var(--slate-50);white-space:nowrap;overflow:hidden;text-overflow:clip}
  table.component-list thead th.qty-head{text-align:center}
  table.component-list thead th.num-head{text-align:right}
  table.component-list tbody td{font-size:13.8px;font-weight:600;color:var(--ink)}
  table.component-list tbody td[contenteditable="true"]{outline:0}
  table.component-list tbody td[contenteditable="true"]:focus{box-shadow:inset 0 0 0 1.5px var(--brand);background:#fff}
  .prod-cell{color:var(--ink);font-weight:800;letter-spacing:0;font-size:13.2px;text-align:left}
  .qty-cell{text-align:center;font-family:var(--font-mono);font-weight:700;color:var(--ink);white-space:nowrap}
  .price-cell{text-align:right;font-family:var(--font-mono);color:var(--ink);font-size:12.2px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:clip}
  .link-cell{text-align:center;white-space:normal;overflow-wrap:anywhere;word-break:break-word}
  .link-cell a{display:block;max-width:100%;color:var(--ink);text-decoration:underline;font-family:var(--font-mono);font-size:12.8px;font-weight:800;line-height:1.2;white-space:normal;overflow-wrap:anywhere;word-break:break-word}
  .link-cell.empty{color:var(--slate-300);font-family:var(--font-mono);font-size:12.4px;font-weight:600}
  table.component-list tfoot td,table.component-list tfoot th{border-top:2px solid var(--ink);background:#fff;vertical-align:middle}
  table.component-list tfoot .sum-cell{text-align:right;font-family:var(--font-mono)}
  table.component-list tfoot th{text-align:right;font-family:var(--font-mono);font-size:12.4px;font-weight:800;text-transform:uppercase;color:var(--ink)}
  table.component-list tfoot .sum-value{display:block;font-size:14.5px;font-weight:800;color:var(--ink);line-height:1.2}
  .ds-foot{margin-top:auto;padding-top:5px;border-top:1px solid var(--hairline);display:flex;justify-content:space-between;align-items:baseline;font-family:var(--font-mono);font-size:10.5px;color:var(--ink-3);letter-spacing:.08em}
  .pageno{font-weight:700;color:var(--ink)}
  @page{size:A3 portrait;margin:0}
  @media print{html,body{background:#fff}body{padding:0}.toolbar{display:none!important}.page{width:297mm;min-height:420mm;height:420mm;box-shadow:none;margin:0;page-break-after:auto;break-after:auto}}
</style>
</head>
<body>
<div class="toolbar">
  <div class="brand">HydroGuide · Komponentliste</div>
  <div class="toolbar-actions">
    <button type="button" id="btn-add">Legg til rad</button>
    <button type="button" id="btn-xls">Last ned Excel</button>
    <button type="button" id="btn-csv">Last ned CSV</button>
    <button type="button" id="btn-print">Last ned PDF</button>
  </div>
</div>
<section class="page">
  <div class="ds-head">
    <div class="ds-head-row">
      <div><h1>Komponentliste</h1></div>
      <div class="right"><span class="docid">${DOC_ID}</span><span>${esc(generated)}</span></div>
    </div>
  </div>
  <table class="component-list" id="komponentliste" data-export-table="component-list">
    <caption>Komponentliste for HydroGuide konfigurasjon</caption>
    <colgroup><col class="c-prod"><col class="c-units"><col class="c-unit-price"><col class="c-tot-ex"><col class="c-tot-inc"><col class="c-link"></colgroup>
    <thead>
      <tr>
        <th scope="col">Komponent</th>
        <th scope="col" class="qty-head">Antall</th>
        <th scope="col" class="num-head">Stykkpris</th>
        <th scope="col" class="num-head">Pris Ekskl. mva</th>
        <th scope="col" class="num-head">Pris Inkl. mva</th>
        <th scope="col">Nettside</th>
      </tr>
    </thead>
    <tbody id="komp-body">
      ${HYDROGUIDE_COMPONENTS.map(renderLine).join("\n")}
    </tbody>
    <tfoot>
      <tr>
        <th scope="row" colspan="3">Sum</th>
        <td class="sum-cell ex-vat"><span class="sum-value" id="sum-eks">${plainMoney(totalExclVat)}</span></td>
        <td class="sum-cell"><span class="sum-value" id="sum-ink">${plainMoney(totalInclVat)}</span></td>
        <td></td>
      </tr>
    </tfoot>
  </table>
  <div class="ds-foot"><span>${DOC_ID} · Hovedprosjekt · hydroguide.no · 1 / 1</span><span class="pageno">1 / 1</span></div>
</section>
<script>
'use strict';
const initialRows = ${rowsJson};
const body = document.getElementById('komp-body');
const headers = ['Komponent','Antall','Stykkpris','Pris ekskl. mva','Pris inkl. mva','Nettside'];
function parseMoney(text) {
  const cleaned = String(text || '').replace(/kr/g, '').replace(/\\s/g, '').replace(/\\./g, '').replace(',', '.');
  const n = Number.parseFloat(cleaned);
  return Number.isFinite(n) ? n : 0;
}
function formatMoney(n) {
  return n.toLocaleString('nb-NO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function readRows() {
  return [...body.querySelectorAll('tr')].map(tr => {
    const cells = tr.querySelectorAll('td');
    const linkCell = cells[5];
    const link = linkCell?.querySelector('a')?.href || linkCell?.textContent.trim() || '';
    return {
      component: cells[0]?.textContent.trim() || '',
      quantity: Number.parseFloat((cells[1]?.textContent || '').replace(',', '.')) || 0,
      unitPriceInclVat: parseMoney(cells[2]?.textContent),
      totalExclVat: parseMoney(cells[3]?.textContent),
      totalInclVat: parseMoney(cells[4]?.textContent),
      link
    };
  });
}
function recalc() {
  const rows = readRows();
  const sumEks = rows.reduce((sum, row) => sum + row.totalExclVat, 0);
  const sumInk = rows.reduce((sum, row) => sum + row.totalInclVat, 0);
  document.getElementById('sum-eks').textContent = formatMoney(sumEks);
  document.getElementById('sum-ink').textContent = formatMoney(sumInk);
}
function addRow() {
  const tr = document.createElement('tr');
  tr.innerHTML = '<td class="prod-cell" data-label="Komponent" contenteditable="true"></td><td class="qty-cell" data-label="Antall" contenteditable="true"></td><td class="price-cell" data-label="Stykkpris" contenteditable="true">kr 0,00</td><td class="price-cell" data-label="Pris ekskl. mva" contenteditable="true">kr 0,00</td><td class="price-cell" data-label="Pris inkl. mva" contenteditable="true">kr 0,00</td><td class="link-cell empty" data-label="Nettside" contenteditable="true"></td>';
  tr.addEventListener('input', recalc);
  body.appendChild(tr);
  recalc();
}
function buildExportTable() {
  const doc = document.implementation.createHTMLDocument('Komponentliste');
  const meta = doc.createElement('meta');
  meta.setAttribute('charset', 'utf-8');
  doc.head.appendChild(meta);
  doc.documentElement.setAttribute('xmlns:o', 'urn:schemas-microsoft-com:office:office');
  doc.documentElement.setAttribute('xmlns:x', 'urn:schemas-microsoft-com:office:excel');
  const tbl = doc.createElement('table');
  tbl.setAttribute('border', '1');
  const thead = doc.createElement('thead');
  const headTr = doc.createElement('tr');
  headers.forEach(h => { const th = doc.createElement('th'); th.textContent = h; headTr.appendChild(th); });
  thead.appendChild(headTr);
  tbl.appendChild(thead);
  const tbody = doc.createElement('tbody');
  readRows().forEach(row => {
    const tr = doc.createElement('tr');
    [row.component,row.quantity,row.unitPriceInclVat,row.totalExclVat,row.totalInclVat,row.link].forEach((value, index) => {
      const td = doc.createElement('td');
      if (index > 0 && index < 5) td.setAttribute('x:num', '');
      td.textContent = String(value ?? '');
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
  tbl.appendChild(tbody);
  doc.body.appendChild(tbl);
  return '<!DOCTYPE html>' + doc.documentElement.outerHTML;
}
function exportXls() { downloadBlob(buildExportTable(), 'Komponentliste.xls', 'application/vnd.ms-excel'); }
function exportCsv() {
  const esc = value => /[";\\n]/.test(String(value ?? '')) ? '"' + String(value ?? '').replace(/"/g, '""') + '"' : String(value ?? '');
  const lines = [headers.join(';')];
  readRows().forEach(row => lines.push([row.component,row.quantity,row.unitPriceInclVat,row.totalExclVat,row.totalInclVat,row.link].map(esc).join(';')));
  downloadBlob('\\ufeff' + lines.join('\\r\\n'), 'Komponentliste.csv', 'text/csv;charset=utf-8');
}
function downloadBlob(content, filename, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 0);
}
function assertInitialRowsLoaded() {
  if (body.querySelectorAll('tr').length !== initialRows.length) {
    throw new Error('Komponentlisten lastet ikke alle radene.');
  }
}
body.addEventListener('input', recalc);
document.getElementById('btn-add').addEventListener('click', addRow);
document.getElementById('btn-xls').addEventListener('click', exportXls);
document.getElementById('btn-csv').addEventListener('click', exportCsv);
document.getElementById('btn-print').addEventListener('click', () => window.print());
assertInitialRowsLoaded();
recalc();
</script>
</body>
</html>`;
}

export function openComponentListWindow(config: PlantConfiguration, _derivedResults: DerivedResults): void {
  const html = buildComponentListHtml(config);
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
  anchor.download = `${(config.name || "komponentliste").trim().replace(FILENAME_SAFE_RE, "") || "komponentliste"}.html`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
