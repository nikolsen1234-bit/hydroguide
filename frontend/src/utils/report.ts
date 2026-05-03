import type {
  AnnualTotals,
  BackupSourceName,
  CostComparisonItem,
  DerivedResults,
  MonthlyEnergyBalanceRow,
  PlantConfiguration,
  Recommendation
} from "../types";
import { formatNumber } from "./format";

const AMP_RE = /&/g;
const LT_RE = /</g;
const GT_RE = />/g;
const DQUOTE_RE = /"/g;
const SQUOTE_RE = /'/g;
const TRIM_QUOTES_RE = /^["']|["']$/g;
const FAGLEG_PREFIX_RE = /^Fagleg underbygging:\s*/i;
const WHITESPACE_RE = /\s+/g;
const SENTENCE_BOUNDARY_RE = /([.!?])\s+(?=[A-ZÆØÅ])/g;
const SEMICOLON_SPLIT_RE = /\s*;\s*/;
const FILENAME_SAFE_RE = /[^a-zA-Z0-9æøåÆØÅ _-]/g;

function esc(s: string): string {
  return s.replace(AMP_RE, "&amp;").replace(LT_RE, "&lt;").replace(GT_RE, "&gt;").replace(DQUOTE_RE, "&quot;").replace(SQUOTE_RE, "&#39;");
}

function todayFormatted(): string {
  return new Intl.DateTimeFormat("nb-NO", { dateStyle: "long" }).format(new Date());
}

function monthBarHeight(rows: MonthlyEnergyBalanceRow[]): string[] {
  const maxSolar = Math.max(...rows.map((r) => r.solarProductionKWh), 1);
  return rows.map((r) => `${Math.max(5, (r.solarProductionKWh / maxSolar) * 100)}%`);
}

function costRow(item: CostComparisonItem, isRecommended: boolean): string {
  const cls = isRecommended ? "font-medium text-[#181c22]" : "text-[#424750]";
  return `
    <tr class="border-t border-[#c2c6d1]">
      <td class="p-3 text-[#181c22]">${esc(item.source)}</td>
      <td class="p-3 ${cls} border-l border-[#c2c6d1]">${formatNumber(item.purchaseCost)} kr</td>
      <td class="p-3 ${cls} border-l border-[#c2c6d1]">${formatNumber(item.operatingCostPerYear)} kr</td>
      <td class="p-3 ${cls} border-l border-[#c2c6d1]">${formatNumber(item.annualMaintenance)} kr</td>
      <td class="p-3 ${cls} border-l border-[#c2c6d1]">${formatNumber(item.annualCo2)} kg</td>
      <td class="p-3 ${cls} border-l border-[#c2c6d1] font-semibold">${formatNumber(item.toc)} kr</td>
    </tr>`;
}

function joinSentences(items: string[]): string {
  return items.map((item) => esc(item.endsWith(".") ? item : `${item}.`)).join(" ");
}

function renderAiRecommendationText(text: string): string {
  const normalized = text
    .trim()
    .replace(TRIM_QUOTES_RE, "")
    .replace(FAGLEG_PREFIX_RE, "")
    .replace(WHITESPACE_RE, " ");

  if (!normalized) {
    return "";
  }

  const abbreviations: Array<[RegExp, string]> = [
    [/\bjf\./gi, "jf__DOT__"],
    [/\bkap\./gi, "kap__DOT__"],
    [/\bpkt\./gi, "pkt__DOT__"],
    [/\bnr\./gi, "nr__DOT__"],
    [/\bca\./gi, "ca__DOT__"],
    [/\bosv\./gi, "osv__DOT__"]
  ];

  let sanitized = normalized;

  abbreviations.forEach(([pattern, replacement]) => {
    sanitized = sanitized.replace(pattern, replacement);
  });

  const parts = sanitized.split(SENTENCE_BOUNDARY_RE);
  let paragraphs: string[] = [];

  for (let index = 0; index < parts.length; index += 2) {
    const paragraph = `${parts[index] || ""}${parts[index + 1] || ""}`.trim();
    if (paragraph) {
      paragraphs.push(paragraph);
    }
  }

  if (paragraphs.length <= 1 && sanitized.includes(";")) {
    paragraphs = sanitized
      .split(SEMICOLON_SPLIT_RE)
      .map((paragraph) => paragraph.trim())
      .filter(Boolean);
  }

  const restoreAbbreviations = (paragraph: string) => {
    let restored = paragraph;
    abbreviations.forEach(([, replacement]) => {
      restored = restored.split(replacement).join(replacement.replace("__DOT__", "."));
    });
    return restored;
  };

  return (paragraphs.length > 0 ? paragraphs : [sanitized])
    .map(
      (paragraph, index) =>
        `<p${index > 0 ? ` style="margin-top:0.5rem;"` : ""}>${index === 0 ? `<strong>Fagleg underbygging:</strong> ` : ""}${esc(restoreAbbreviations(paragraph))}</p>`
    )
    .join("");
}

export function buildAiReportPayload(
  config: PlantConfiguration,
  recommendation: Recommendation,
  derivedResults: DerivedResults,
  activeReserveSource: BackupSourceName,
  visibleAnnualTotals: AnnualTotals,
  visibleSecondarySourcePowerW: number
) {
  const reserveSourceLabel =
    derivedResults.systemRecommendation.secondarySource === "Ikkje berekna" ? "Ikkje berekna" : activeReserveSource;
  const reserveLogger =
    derivedResults.systemRecommendation.loggerSetup.toLowerCase().includes("backup") ||
    derivedResults.systemRecommendation.loggerSetup.toLowerCase().includes("2 loggarar")
      ? "Ja"
      : "Nei";
  const frostProtection =
    derivedResults.systemRecommendation.releaseArrangement.toLowerCase().includes("frostfritt rom")
      ? "Instrumentering og slipp i frostfritt rom"
      : "";
  const bypass = config.answers.q7BypassVedDriftsstans === "ja" ? "Ja, uavhengig av turbinedrift" : "";
  const plantTypeLabel =
    config.answers.q1Anleggstype === "nytt"
      ? "Nytt"
      : config.answers.q1Anleggstype === "eksisterande"
        ? "Eksisterande"
        : config.answers.q1Anleggstype === "ombygging"
          ? "Ombygging"
          : "";
  const flowValue =
    typeof config.answers.q2HogasteMinstevassforing === "number" ? config.answers.q2HogasteMinstevassforing : null;
  const flowVariation =
    config.answers.q3Slippkravvariasjon === "sesongkrav" || config.answers.q3Slippkravvariasjon === "tilsigsstyrt"
      ? "høg"
      : "låg";
  const hydrologyLabel = flowValue === null ? "" : `${flowValue} l/s med ${flowVariation} variasjon`;

  return {
    tilgangskodeHash: "",
    prosjekt: config.name || "Konfigurasjon",
    lokasjon: config.location || "",
    prosjektbeskrivelse: config.name ? `${config.name}${config.location ? ` i ${config.location}` : ""}.` : config.location || "",
    anleggstype: plantTypeLabel,
    hydrologi: hydrologyLabel,
    hovudloysing: recommendation.hovudloysing,
    slippmetode: derivedResults.systemRecommendation.releaseArrangement,
    primaermaaling: derivedResults.systemRecommendation.primaryMeasurement,
    kontrollmaaling: derivedResults.systemRecommendation.controlMeasurement,
    maleprinsipp: derivedResults.systemRecommendation.primaryMeasurement,
    maleutstyr: derivedResults.systemRecommendation.measurementEquipment,
    loggeroppsett: derivedResults.systemRecommendation.loggerSetup,
    reserveLogger,
    kommunikasjon: derivedResults.systemRecommendation.communication,
    alarmVarsling: "",
    reservekjelde: reserveSourceLabel,
    reserveEnergikjelde: reserveSourceLabel,
    primaerEnergikjelde: "Solcelleanlegg",
    reserveeffektW: visibleSecondarySourcePowerW,
    batteribankAh: derivedResults.systemRecommendation.batteryCapacityAh,
    autonomiDagar: derivedResults.systemRecommendation.batteryAutonomyDays,
    istilpassing: derivedResults.systemRecommendation.icingAdaptation,
    frostsikring: frostProtection,
    bypass,
    arsproduksjonSolKWh: visibleAnnualTotals.annualSolarProductionKWh,
    arslastKWh: visibleAnnualTotals.annualLoadDemandKWh,
    arsbalanseKWh: visibleAnnualTotals.annualEnergyBalanceKWh,
    grunngiving: recommendation.grunngiving,
    tilleggskrav: recommendation.tilleggskrav,
    driftskrav: derivedResults.systemRecommendation.operationsRequirements,
    slippmetodeVal: config.answers.q4Slippmetode,
    slippkravvariasjon: config.answers.q3Slippkravvariasjon,
    isSedimentTilstopping: config.answers.q5IsSedimentTilstopping,
    fiskepassasje: config.answers.q6Fiskepassasje,
    bypassVedDriftsstans: config.answers.q7BypassVedDriftsstans,
    maleprofil: config.answers.q8Maleprofil,
    allmentaKontroll: config.answers.q9AllmentaKontroll,
    include_recommendations: true,
    ai_on: true,
    rapportutdrag: [
      `Anbefalt hovudløysing: ${recommendation.hovudloysing}.`,
      `Slippordning: ${derivedResults.systemRecommendation.releaseArrangement}.`,
      `Måling i ordinær drift: ${derivedResults.systemRecommendation.primaryMeasurement}.`,
      `Kontrollmåling for verifikasjon: ${derivedResults.systemRecommendation.controlMeasurement}.`,
      `Kommunikasjon: ${derivedResults.systemRecommendation.communication}.`,
      `Loggeroppsett: ${derivedResults.systemRecommendation.loggerSetup}.`,
      `Reservekjelde: ${reserveSourceLabel}.`,
      `Reserveeffekt: ${visibleSecondarySourcePowerW} W.`,
      `Batteribank: ${derivedResults.systemRecommendation.batteryCapacityAh} Ah.`,
      `Autonomi: ${derivedResults.systemRecommendation.batteryAutonomyDays} dagar.`,
      `Årleg solproduksjon: ${visibleAnnualTotals.annualSolarProductionKWh} kWh.`,
      `Årleg last: ${visibleAnnualTotals.annualLoadDemandKWh} kWh.`,
      `Årleg energibalanse: ${visibleAnnualTotals.annualEnergyBalanceKWh} kWh.`
    ]
      .filter(Boolean)
      .join(" ")
  };
}

function buildReportHtml(
  config: PlantConfiguration,
  recommendation: Recommendation,
  aiRecommendationText: string | null,
  derivedResults: DerivedResults,
  activeReserveSource: BackupSourceName,
  visibleAnnualTotals: AnnualTotals,
  visibleMonthlyEnergyBalance: MonthlyEnergyBalanceRow[]
): string {
  const barHeights = monthBarHeight(visibleMonthlyEnergyBalance);
  const monthLabels = ["Jan", "Feb", "Mar", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Des"];
  const balancePositive = visibleAnnualTotals.annualEnergyBalanceKWh >= 0;
  const recommendedSource = derivedResults.systemRecommendation.secondarySource;
  const selectedRuntimeItem =
    derivedResults.costComparison.items.find((item) => item.source === activeReserveSource) ??
    derivedResults.costComparison.items[0] ??
    null;

  return `<!DOCTYPE html>
<html lang="no">
<head>
<meta charset="utf-8"/>
<meta content="width=device-width, initial-scale=1.0" name="viewport"/>
<title>HydroGuide \u2013 Rapport: ${esc(config.name || "Konfigurasjon")}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap');
  * { margin: 0; padding: 0; box-sizing: border-box; }
  @page { margin: 0; }
  body { background: #f1f3fc; display: flex; flex-direction: column; align-items: center; padding: 2rem 0; font-family: 'Inter', system-ui, sans-serif; color: #181c22; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .report-page { background: white; box-shadow: 0 4px 6px -1px rgba(0,0,0,.1); border-radius: 0.5rem; width: 210mm; min-height: 297mm; }
  .report-content { padding: 22px 28px; width: 100%; }
  @media print { body { background: transparent; padding: 0; } .report-page { box-shadow: none; border-radius: 0; width: 100%; min-height: auto; } .no-print { display: none !important; } }
  h1 { font-size: 1.25rem; font-weight: 700; }
  h2 { font-size: 0.85rem; font-weight: 600; color: #00305a; margin-bottom: 0.35rem; padding-bottom: 0.25rem; border-bottom: 1px solid #c2c6d1; }
  .meta { font-size: 0.7rem; color: #424750; }
  .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem 2rem; }
  .kv { display: flex; justify-content: space-between; border-bottom: 1px solid #e0e2eb; padding: 0.2rem 0; font-size: 0.75rem; }
  .kv-label { color: #424750; }
  .kv-value { font-weight: 500; }
  .metric-box { text-align: center; padding: 0.35rem; border: 1px solid #c2c6d1; border-radius: 0.375rem; }
  .metric-box.highlight { background: #00305a; color: white; }
  .metric-box .val { font-size: 1rem; font-weight: 700; }
  .metric-box .lbl { font-size: 0.65rem; color: #424750; margin-bottom: 0.1rem; }
  .metric-box.highlight .lbl { color: rgba(255,255,255,.7); }
  .chart-bar-wrap { display: flex; align-items: flex-end; justify-content: space-between; gap: 0.25rem; padding: 0 0.5rem; }
  .chart-bar-col { display: flex; flex-direction: column; align-items: center; gap: 0.2rem; width: 100%; }
  .chart-bar-col .bar-area { width: 100%; height: 3.5rem; display: flex; align-items: flex-end; }
  .chart-bar-col .bar { width: 100%; border-radius: 2px 2px 0 0; min-height: 3px; background: #00305a; }
  .chart-bar-col span { font-size: 0.6rem; color: #424750; }
  table { width: 100%; border-collapse: collapse; font-size: 0.75rem; text-align: left; }
  table th { background: #ebedf7; padding: 0.25rem 0.5rem; font-weight: 500; font-size: 0.65rem; }
  table td { padding: 0.25rem 0.5rem; }
  .section { margin-top: 0.75rem; }
  .footer { margin-top: 0.75rem; padding-top: 0.35rem; border-top: 1px solid #c2c6d1; text-align: center; font-size: 0.6rem; color: #727781; }
  .toolbar { position: sticky; top: 0; z-index: 10; display: flex; align-items: center; gap: 0.75rem; padding: 0.5rem 1rem; margin-bottom: 1rem; background: rgba(241,243,252,0.95); backdrop-filter: blur(4px); border-bottom: 1px solid #c2c6d1; }
  .toolbar button { font-family: inherit; font-size: 0.85rem; padding: 0.4rem 0.8rem; border-radius: 0.375rem; background: #00305a; color: white; border: 1px solid #00305a; cursor: pointer; }
  .toolbar button:hover { background: #004780; }
  .grunngiving { background: #f1f3fc; padding: 0.4rem 0.6rem; border-radius: 0.25rem; font-size: 0.7rem; color: #424750; line-height: 1.4; }
  .grunngiving p + p { margin-top: 0.5rem; }
</style>
</head>
<body>
<div class="toolbar no-print">
  <button onclick="window.print()">Skriv ut / Lagre PDF</button>
</div>
<div class="report-page">
<div class="report-content">
<header style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:1rem;border-bottom:1px solid #c2c6d1;padding-bottom:0.75rem;">
  <div>
    <h1>Analyse og anbefaling</h1>
    <p class="meta" style="margin-top:0.25rem;">${esc(recommendation.hovudloysing)}</p>
  </div>
  <div style="text-align:right;">
    <p class="meta">Dato: ${todayFormatted()}</p>
    <p class="meta">Prosjekt: ${esc(config.name || "-")}</p>
    ${config.location ? `<p class="meta">Lokasjon: ${esc(config.location)}</p>` : ""}
  </div>
</header>
<section>
  <h2>Systemkonfigurasjon</h2>
  <div class="grid-2">
    <div class="kv"><span class="kv-label">Slippordning</span><span class="kv-value">${esc(derivedResults.systemRecommendation.releaseArrangement)}</span></div>
    <div class="kv"><span class="kv-label">Prim\u00e6rm\u00e5ling</span><span class="kv-value">${esc(derivedResults.systemRecommendation.primaryMeasurement)}</span></div>
    <div class="kv"><span class="kv-label">Kontrollm\u00e5ling</span><span class="kv-value">${esc(derivedResults.systemRecommendation.controlMeasurement)}</span></div>
    <div class="kv"><span class="kv-label">Kommunikasjon</span><span class="kv-value">${esc(derivedResults.systemRecommendation.communication)}</span></div>
    <div class="kv"><span class="kv-label">Reservekjelde</span><span class="kv-value">${esc(activeReserveSource)}</span></div>
    <div class="kv"><span class="kv-label">Batteribank</span><span class="kv-value">${formatNumber(derivedResults.systemRecommendation.batteryCapacityAh)} Ah</span></div>
    <div class="kv"><span class="kv-label">Autonomi</span><span class="kv-value">${formatNumber(derivedResults.systemRecommendation.batteryAutonomyDays)} dagar</span></div>
    <div class="kv"><span class="kv-label">Loggeroppsett</span><span class="kv-value">${esc(derivedResults.systemRecommendation.loggerSetup)}</span></div>
    <div class="kv"><span class="kv-label">Istilpassing</span><span class="kv-value">${esc(derivedResults.systemRecommendation.icingAdaptation)}</span></div>
  </div>
</section>
<section class="section">
  <h2>Energibalanse</h2>
  <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:0.5rem;margin-bottom:0.6rem;">
    <div class="metric-box"><p class="lbl">Solproduksjon / \u00e5r</p><p class="val">${formatNumber(visibleAnnualTotals.annualSolarProductionKWh)}</p><p class="meta">kWh</p></div>
    <div class="metric-box"><p class="lbl">Last / \u00e5r</p><p class="val">${formatNumber(visibleAnnualTotals.annualLoadDemandKWh)}</p><p class="meta">kWh</p></div>
    <div class="metric-box ${balancePositive ? "highlight" : ""}"><p class="lbl">Energibalanse / \u00e5r</p><p class="val">${balancePositive ? "+" : ""}${formatNumber(visibleAnnualTotals.annualEnergyBalanceKWh)}</p><p class="meta">kWh</p></div>
  </div>
  <div style="border:1px solid #c2c6d1;border-radius:0.375rem;padding:0.5rem;">
    <div class="chart-bar-wrap">
      ${visibleMonthlyEnergyBalance
        .map(
          (row, index) => `
        <div class="chart-bar-col">
                      <span style="font-size:0.55rem;font-weight:500;">${formatNumber(row.solarProductionKWh, 1)}</span>
          <div class="bar-area"><div class="bar" style="height:${barHeights[index]};"></div></div>
          <span>${monthLabels[index]}</span>
        </div>`
        )
        .join("")}
    </div>
  </div>
</section>
${selectedRuntimeItem ? `
<section class="section">
  <h2>Reservekjelde: driftstid</h2>
  <div class="grid-2">
    <div class="kv"><span class="kv-label">Kjelde</span><span class="kv-value">${esc(selectedRuntimeItem.source)}</span></div>
    <div class="kv"><span class="kv-label">Total driftstid</span><span class="kv-value">${formatNumber(selectedRuntimeItem.totalRuntimeHours)} t</span></div>
    <div class="kv"><span class="kv-label">Teknisk levetid</span><span class="kv-value">${formatNumber(selectedRuntimeItem.technicalLifetimeHours)} t</span></div>
  </div>
</section>` : ""}
<section class="section">
  <h2>Kostnadssamanlikning</h2>
  <div style="overflow:hidden;border-radius:0.375rem;border:1px solid #c2c6d1;">
    <table>
      <thead><tr><th>Kjelde</th><th style="border-left:1px solid #c2c6d1;">Investering</th><th style="border-left:1px solid #c2c6d1;">Drivstoff/\u00e5r</th><th style="border-left:1px solid #c2c6d1;">Vedlikehald/\u00e5r</th><th style="border-left:1px solid #c2c6d1;">CO\u2082/\u00e5r</th><th style="border-left:1px solid #c2c6d1;">TOC</th></tr></thead>
      <tbody>${derivedResults.costComparison.items.map((item) => costRow(item, item.source === recommendedSource)).join("")}</tbody>
    </table>
  </div>
</section>
<section class="section">
  <h2>${aiRecommendationText ? "KI-underbygging" : "Grunngiving og tilleggskrav"}</h2>
  ${aiRecommendationText ? `<div class="grunngiving">${renderAiRecommendationText(aiRecommendationText)}</div>` : `<div class="grunngiving">
    ${recommendation.grunngiving.length > 0 ? `<p><strong>Grunngiving:</strong> ${joinSentences(recommendation.grunngiving)}</p>` : ""}
    ${recommendation.tilleggskrav.length > 0 ? `<p style="margin-top:0.5rem;"><strong>Tilleggskrav:</strong> ${joinSentences(recommendation.tilleggskrav)}</p>` : ""}
    ${derivedResults.systemRecommendation.operationsRequirements.length > 0 ? `<p style="margin-top:0.5rem;"><strong>Drift:</strong> ${joinSentences(derivedResults.systemRecommendation.operationsRequirements)}</p>` : ""}
  </div>`}
</section>
<footer class="footer">Generert av HydroGuide | ${todayFormatted()} | Simulering</footer>
</div></div>
</body></html>`;
}

export function openReportWindow(
  config: PlantConfiguration,
  recommendation: Recommendation,
  aiRecommendationText: string | null,
  derivedResults: DerivedResults,
  activeReserveSource: BackupSourceName,
  visibleAnnualTotals: AnnualTotals,
  visibleMonthlyEnergyBalance: MonthlyEnergyBalanceRow[]
): void {
  const html = buildReportHtml(
    config,
    recommendation,
    aiRecommendationText,
    derivedResults,
    activeReserveSource,
    visibleAnnualTotals,
    visibleMonthlyEnergyBalance
  );

  const win = window.open("", "_blank");
  if (win) {
    win.document.open();
    win.document.write(html);
    win.document.close();
  } else {
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${(config.name || "rapport").trim().replace(FILENAME_SAFE_RE, "")}.html`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
}
