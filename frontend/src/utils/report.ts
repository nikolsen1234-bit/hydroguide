import type {
  AnnualTotals,
  BackupSourceName,
  CostComparisonItem,
  DerivedResults,
  MonthlyEnergyBalanceRow,
  PlantConfiguration,
  RadioLinkConfiguration,
  Recommendation
} from "../types";
import {
  buildSourceAnchoredReportSummary,
  calculateHydroGuideDecision,
  hydroGuideCriteria,
  nveSourceRegister,
  visibleHydroGuideCards
} from "../hydroguide/sourceAnchoredDecision";
import { formatNumber } from "./format";
import type { RadioLinkAnalysis } from "./radioLink";
// @ts-ignore Shared browser-safe trace guard also runs as the Node hook script.
import { stampTraceId, TRACE_PLACEHOLDER } from "../../../backend/scripts/check-trace-id.mjs";

const AMP_RE = /&/g;
const LT_RE = /</g;
const GT_RE = />/g;
const DQUOTE_RE = /"/g;
const SQUOTE_RE = /'/g;
const FILENAME_SAFE_RE = /[^a-zA-Z0-9æøåÆØÅ _-]/g;
const TRIM_QUOTES_RE = /^["']|["']$/g;
const WHITESPACE_RE = /\s+/g;
const SENTENCE_BOUNDARY_RE = /([.!?])\s+(?=[A-ZÆØÅ])/g;
const UNIVERSAL_OBLIGATION_ID_RE = /^nve_/i;

export type AiReportFields = {
  recommendationNote?: string;
  measurementNote?: string;
  energyNote?: string;
  evidenceNote?: string;
};

export type AiReportContent = string | AiReportFields;

type RadioData = {
  distance: string;
  loss: string;
  rainLoss: string;
  frequency: string;
  kFactor: string;
  rainFactor: string;
  fresnelFactor: string;
  polarization: string;
};

function esc(value: string): string {
  return value
    .replace(AMP_RE, "&amp;")
    .replace(LT_RE, "&lt;")
    .replace(GT_RE, "&gt;")
    .replace(DQUOTE_RE, "&quot;")
    .replace(SQUOTE_RE, "&#39;");
}

function blank(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "&nbsp;";
  const text = String(value).trim();
  return text ? esc(text) : "&nbsp;";
}

function text(value: string | null | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function num(value: unknown, digits = 0): string {
  return finite(value) ? formatNumber(value, digits) : "";
}

function localizeBackupSource(source: BackupSourceName | "NotComputed" | string | undefined): string {
  if (source === "FuelCell") return "Brenselcelle";
  if (source === "DieselGenerator") return "Dieselaggregat";
  return "";
}

function visibleText(value: string | undefined): string {
  const next = text(value);
  return next.toLowerCase() === ["ikke", "beregnet"].join(" ") ? "" : next;
}

function reportDate(date: Date): string {
  return new Intl.DateTimeFormat("nb-NO", { day: "numeric", month: "long", year: "numeric" }).format(date);
}

function normalizeAiReportFields(content: AiReportContent | null): AiReportFields | null {
  if (!content || typeof content === "string") return null;
  const fields = {
    recommendationNote: text(content.recommendationNote),
    measurementNote: text(content.measurementNote),
    energyNote: text(content.energyNote),
    evidenceNote: text(content.evidenceNote)
  };
  return Object.values(fields).some(Boolean) ? fields : null;
}

function renderFreeText(content: AiReportContent | null): string {
  const fields = normalizeAiReportFields(content);
  const raw = typeof content === "string" ? content : fields?.evidenceNote || fields?.recommendationNote || "";
  const normalized = raw
    .trim()
    .replace(TRIM_QUOTES_RE, "")
    .replace(WHITESPACE_RE, " ");

  if (!normalized) return "";

  const parts = normalized.split(SENTENCE_BOUNDARY_RE).reduce<string[]>((acc, part, index, source) => {
    if (index % 2 === 0) {
      const paragraph = `${part || ""}${source[index + 1] || ""}`.trim();
      if (paragraph) acc.push(paragraph);
    }
    return acc;
  }, []);

  return (parts.length ? parts : [normalized])
    .map((paragraph, index) => `<p${index > 0 ? ` style="margin-top:0.5rem;"` : ""}>${esc(paragraph)}</p>`)
    .join("");
}

function renderSourceBackedEvidence(recommendation: Recommendation): string {
  const rows = [
    ["Valgt metode", recommendation.methodName || recommendation.mainSolution],
    ["Status", recommendation.decisionStatus || recommendation.status],
    ["Oppfylte kriterier", recommendation.criteriaSatisfied?.join(", ") || ""],
    ["Ikke oppfylt", recommendation.criteriaNotSatisfied?.join(", ") || ""],
    ["Manglende dokumentasjon", recommendation.missingDocumentation?.join(", ") || ""],
    ["Kilder", recommendation.sourceRefs?.join(", ") || recommendation.nveAnchors?.join(", ") || ""],
    ["Systemkrav", recommendation.silentNveRequirements?.join("; ") || ""]
  ].filter(([, value]) => value);

  if (!rows.length) return "";

  return rows
    .map(([label, value]) => `<p><b>${esc(label)}:</b> ${esc(value)}</p>`)
    .join("");
}

function dedupe(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function isFactValue(value: unknown): boolean {
  if (Array.isArray(value)) return value.length > 0;
  return value !== "" && value !== "not_documented_yet" && value !== null && value !== undefined;
}

function buildAnswerFacts(config: PlantConfiguration) {
  const answers = config.answers ?? {};
  const visibleCriterionIds = new Set(
    visibleHydroGuideCards(answers).flatMap((card) => card.criterionIds)
  );

  return hydroGuideCriteria
    .filter((criterion) => visibleCriterionIds.has(criterion.id))
    .filter((criterion) => !UNIVERSAL_OBLIGATION_ID_RE.test(criterion.id))
    .map((criterion) => {
      const value = answers[criterion.id];
      if (!isFactValue(value)) return null;
      const selectedOptions = (criterion.options ?? []).filter((option) =>
        Array.isArray(value) ? value.includes(option.id) : option.id === value
      );
      const optionRefs = selectedOptions.flatMap((option) => option.sourceRefs);
      return {
        id: criterion.id,
        label: criterion.title,
        value,
        valueLabels: selectedOptions.map((option) => option.label),
        sourceRefs: dedupe([...criterion.sourceRefs, ...optionRefs]),
        sourceInterpretation: criterion.sourceInterpretation,
        sourceScope: criterion.sourceScope,
        semanticMeaning: selectedOptions.map((option) => option.semanticMeaning).filter(Boolean).join(" ")
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));
}

function buildSourceChunks(sourceRefs: ReturnType<typeof buildSourceAnchoredReportSummary>["sourceReferences"]) {
  return sourceRefs.map((source) => ({
    id: source.id,
    sourceRefs: [source.id],
    documentTitle: source.documentTitle,
    section: source.section,
    sectionTitle: source.sectionTitle,
    use: source.use,
    text: source.shortParaphrase,
    normativeUse: nveSourceRegister[source.id as keyof typeof nveSourceRegister]?.normativeUse ?? ""
  }));
}

function projectTitle(config: PlantConfiguration): string {
  return text(config.name);
}

function reportDocId(config: PlantConfiguration): string {
  const raw = text(config.id).toUpperCase().replace(/-/g, "");
  if (!raw) return "";
  return "HG-" + raw.slice(-8);
}

function isRadioAnalysis(value: unknown): value is RadioLinkAnalysis {
  return Boolean(
    value &&
      typeof value === "object" &&
      "terrainDistanceKm" in value &&
      "freeSpaceLossDb" in value &&
      "rainAttenuationDb" in value
  );
}

function polarizationLabel(value: RadioLinkConfiguration["polarization"] | undefined): string {
  if (value === "horizontal") return "Horisontal";
  if (value === "vertical") return "Vertikal";
  return "";
}

function radioRows(config: PlantConfiguration): RadioData {
  const analysis = isRadioAnalysis(config.cachedRadioAnalysis) ? config.cachedRadioAnalysis : null;
  const radio = config.radioLink;
  const frequency = finite(analysis?.frequencyMHz ?? radio.frequencyMHz)
    ? `${num(analysis?.frequencyMHz ?? radio.frequencyMHz, 1)} MHz`
    : "";
  const rainFactor = finite(analysis?.rainFactor ?? radio.rainFactor)
    ? `${num(analysis?.rainFactor ?? radio.rainFactor, 0)} mm/h`
    : "";
  const fresnel = finite(analysis?.fresnelFactor ?? radio.fresnelFactor)
    ? `${num((analysis?.fresnelFactor ?? radio.fresnelFactor) * 100, 0)}%`
    : "";

  return {
    distance: analysis ? `${num(analysis.terrainDistanceKm, 2)} km` : "",
    loss: analysis ? `${num(analysis.freeSpaceLossDb, 2)} dB` : "",
    rainLoss: analysis ? `${num(analysis.rainAttenuationDb, 1)} dB` : "",
    frequency,
    kFactor: analysis?.kFactor || radio.kFactor ? `k=${analysis?.kFactor ?? radio.kFactor}` : "",
    rainFactor,
    fresnelFactor: fresnel,
    polarization: polarizationLabel(analysis?.polarization ?? radio.polarization)
  };
}

function simplifyPath(values: number[], axisMax: number): string {
  if (values.length < 2 || axisMax <= 0) return "";
  const n = values.length;
  // Midpoint sampling: place each sample in the centre of its 1/n band,
  // matching the variant-6-A fasit terrain rendering.
  const points = values.map((value, index) => {
    const x = ((index + 0.5) / n) * 516;
    const y = 286 - (Math.max(0, Math.min(axisMax, value)) / axisMax) * 286;
    return [x, y] as [number, number];
  });
  // Catmull-Rom-to-Bezier smoothing with degenerate endpoint controls:
  // first/last segments use the segment endpoint itself as the missing
  // control, matching the variant-6-A fasit's "C p1 p1 ..." opening segment.
  let d = `M ${points[0][0]} ${points[0][1]}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p1 = points[i];
    const p2 = points[i + 1];
    const p0 = i > 0 ? points[i - 1] : p1;
    const p3 = i + 2 < points.length ? points[i + 2] : p2;
    const c1x = i > 0 ? p1[0] + (p2[0] - p0[0]) / 6 : p1[0];
    const c1y = i > 0 ? p1[1] + (p2[1] - p0[1]) / 6 : p1[1];
    const c2x = i + 2 < points.length ? p2[0] - (p3[0] - p1[0]) / 6 : p2[0];
    const c2y = i + 2 < points.length ? p2[1] - (p3[1] - p1[1]) / 6 : p2[1];
    d += ` C ${c1x} ${c1y} ${c2x} ${c2y} ${p2[0]} ${p2[1]}`;
  }
  return d;
}

function renderRadioGraph(config: PlantConfiguration) {
  const analysis = isRadioAnalysis(config.cachedRadioAnalysis) ? config.cachedRadioAnalysis : null;
  const series = analysis?.series;
  const allValues = series ? [...series.terrain, ...series.lineOfSight, ...series.fresnelLower, ...series.fresnelUpper] : [];
  const axisMax = allValues.length ? Math.max(100, Math.ceil((Math.max(...allValues) * 1.25) / 100) * 100) : 0;
  const yTicks = axisMax > 0 ? [axisMax, axisMax * 0.8, axisMax * 0.6, axisMax * 0.4, axisMax * 0.2, 0] : ["", "", "", "", "", ""];
  const yPositions = [14.8, 44.8, 74.8, 104.8, 134.8, 164.8];
  // Shifted -20 viewBox-units left (no scaling) so the radio plot aligns
  // horizontally with the Energibalanse stack (first label "0" sits under JAN).
  const xPositions = [30.06, 95.99, 161.92, 227.84, 293.77, 359.7, 425.63, 491.55, 557.48, 623.41, 695.85];
  const xPercents = ["3.9553%", "12.6303%", "21.3053%", "29.9789%", "38.6539%", "47.3289%", "56.0039%", "64.6776%", "73.3526%", "82.0276%", "91.5592%"];
  const distanceKm = analysis?.terrainDistanceKm ?? 0;
  const xLabels = distanceKm > 0 ? xPositions.map((_, index) => {
    if (index === 0) return "0";
    const v = (distanceKm * index) / (xPositions.length - 1);
    // Match fasit format: dot separator, max 2 decimals, trailing 0 stripped
    return v.toFixed(2).replace(/0$/, "").replace(/\.$/, "");
  }) : xPositions.map(() => "");
  const terrainPath = series ? simplifyPath(series.terrain, axisMax) : "";
  const losPath = series ? simplifyPath(series.lineOfSight, axisMax) : "";
  const fresnelLowerPath = series ? simplifyPath(series.fresnelLower, axisMax) : "";
  const fresnelUpperPath = series ? simplifyPath(series.fresnelUpper, axisMax) : "";

  return {
    yAxis: `<div class="radio-yax" aria-hidden="true">
        ${yTicks.map((tick, index) => `<span class="n" style="top:${yPositions[index]}px">${typeof tick === "number" ? esc(num(tick, 0)) : "&nbsp;"}</span>`).join("\n        ")}
        <span class="unit">Meter</span>
      </div>`,
    xAxis: `<div class="radio-xax" aria-hidden="true">
        ${xPercents.map((left, index) => `<span class="n" style="left:${left}">${blank(xLabels[index])}</span>`).join("\n        ")}
        <span class="unit" style="left:47.76%">Kilometer</span>
      </div>`,
    svg: `<svg viewBox="0 0 760 200" preserveAspectRatio="none" role="img" aria-label="Terrengprofil fra Linkplanlegger">
        <defs><clipPath id="radioActualPlotClip"><rect x="0" y="0" width="516" height="286"></rect></clipPath></defs>
        <rect width="760" height="200" fill="#fff"></rect>
        <g class="radio-svg-y-axis" font-family="Manrope" font-size="7.8" font-weight="800" fill="#000000" letter-spacing=".06em">
          ${yTicks.map((tick, index) => `<text x="34" y="${yPositions[index].toFixed(2)}" text-anchor="end">${typeof tick === "number" ? esc(num(tick, 0)) : ""}</text>`).join("\n          ")}
          <text x="7" y="88" text-anchor="middle" transform="rotate(-90 7 88)">Meter</text>
        </g>
        <g class="radio-svg-x-axis" font-family="Manrope" font-size="7.8" font-weight="800" fill="#000000" letter-spacing=".06em">
          ${xPositions.map((x, index) => `<line x1="${x.toFixed(2)}" y1="162.00" x2="${x.toFixed(2)}" y2="166.00" stroke="#000000" stroke-width="1" shape-rendering="crispEdges" vector-effect="non-scaling-stroke"></line>
          <text x="${x.toFixed(2)}" y="177.00" text-anchor="middle">${esc(xLabels[index])}</text>`).join("\n          ")}
          <text x="370.00" y="187" text-anchor="middle">Kilometer</text>
        </g>
        <g clip-path="url(#radioActualPlotClip)" transform="translate(28 12) scale(1.32558140 0.52447552)">
          ${terrainPath ? `<path d="${terrainPath}" fill="none" stroke="black" stroke-width="1.45" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"></path>` : ""}
          ${losPath ? `<path d="${losPath}" fill="none" stroke="green" stroke-width="1.45" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"></path>` : ""}
          ${fresnelLowerPath ? `<path d="${fresnelLowerPath}" fill="none" stroke="red" stroke-width="1.45" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"></path>` : ""}
          ${fresnelUpperPath ? `<path d="${fresnelUpperPath}" fill="none" stroke="orange" stroke-width="1.45" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"></path>` : ""}
        </g>
        <g class="radio-svg-legend" font-family="Manrope, Arial, sans-serif" font-size="8.5" font-weight="800" fill="#000000">
          <line x1="140" y1="190" x2="158" y2="190" stroke="black" stroke-width="2.0" stroke-linecap="round"></line><text x="164" y="193" text-anchor="start">høyde</text>
          <line x1="234" y1="190" x2="252" y2="190" stroke="green" stroke-width="2.0" stroke-linecap="round"></line><text x="258" y="193" text-anchor="start">siktlinje</text>
          <line x1="486" y1="190" x2="504" y2="190" stroke="red" stroke-width="2.0" stroke-linecap="round"></line><text x="510" y="193" text-anchor="start">fresnel nedre</text>
          <line x1="624" y1="190" x2="642" y2="190" stroke="orange" stroke-width="2.0" stroke-linecap="round"></line><text x="648" y="193" text-anchor="start">fresnel øvre</text>
        </g>
      </svg>`
  };
}

function renderEnergyStack(rows: MonthlyEnergyBalanceRow[]) {
  const monthLabels = ["Jan", "Feb", "Mar", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Des"];
  const visibleRows = Array.from({ length: 12 }, (_, index) => rows[index]);
  const max = Math.max(
    1,
    ...visibleRows.map((row) => row ? Math.max(row.solarProductionKWh, row.loadDemandKWh, Math.max(0, row.loadDemandKWh - row.solarProductionKWh)) : 0)
  );
  const niceMax = Math.max(20, Math.ceil((max * 1.2) / 20) * 20);
  const ticks = [niceMax, niceMax * 0.75, niceMax * 0.5, niceMax * 0.25, 0];
  const bars = visibleRows
    .map((row) => {
      const solar = row?.solarProductionKWh ?? 0;
      const load = row?.loadDemandKWh ?? 0;
      const reserve = Math.max(0, load - solar);
      const h = (value: number) => (niceMax > 0 ? Math.max(0, (value / niceMax) * 100) : 0).toFixed(2);
      return `<div class="col"><div class="seg s1" style="height:${h(solar)}%"></div><div class="seg s2" style="height:${h(load)}%"></div>${reserve > 0 ? `<div class="seg s3" style="height:${h(reserve)}%"></div>` : ""}</div>`;
    })
    .join("");

  return {
    yAxis: ticks.map((tick) => `<span>${esc(num(tick, 0))}</span>`).join(""),
    bars,
    labels: monthLabels.map((label) => `<span>${label}</span>`).join("")
  };
}

function costRow(item: CostComparisonItem, powerW: number | null, recommended: boolean): string {
  const cls = item.source === "FuelCell" ? "bc" : "ds";
  return `<tr class="${cls}${recommended ? " rec" : ""}">
    <td class="rowhead">${blank(localizeBackupSource(item.source))}</td>
    <td>${powerW === null ? "&nbsp;" : `${num(powerW, 0)}<small>W</small>`}</td>
    <td>${num(item.technicalLifetimeHours, 0)}<small>t</small></td>
    <td>${num(item.totalRuntimeHours / Math.max(item.evaluationHorizonYears, 1), 0)}<small>t/år</small></td>
    <td>${num(item.annualFuelConsumption, 0)}<small>L/år</small></td>
    <td>${num(item.annualCo2, 0)}<small>kg/år</small></td>
    <td>${num(item.purchaseCost, 0)}<small>kr</small></td>
    <td>${num((finite(item.operatingCostPerYear) ? item.operatingCostPerYear : 0) + (finite(item.annualMaintenance) ? item.annualMaintenance : 0), 0)}<small>kr</small></td>
    <td>${num((finite(item.purchaseCost) ? item.purchaseCost : 0) + ((finite(item.operatingCostPerYear) ? item.operatingCostPerYear : 0) + (finite(item.annualMaintenance) ? item.annualMaintenance : 0)) * (finite(item.evaluationHorizonYears) ? item.evaluationHorizonYears : 1), 0)}<small>kr</small></td>
  </tr>`;
}

export function buildAiReportPayload(
  config: PlantConfiguration,
  recommendation: Recommendation,
  derivedResults: DerivedResults,
  activeReserveSource: BackupSourceName,
  visibleAnnualTotals: AnnualTotals,
  visibleSecondarySourcePowerW: number
) {
  const decision = calculateHydroGuideDecision(config.answers);
  const summary = buildSourceAnchoredReportSummary(decision);
  const answerFacts = buildAnswerFacts(config);

  return {
    project: {
      name: config.name,
      location: config.location,
      mode: config.engineMode
    },
    recommendation: {
      mainSolution: recommendation.mainSolution,
      justification: recommendation.justification,
      status: recommendation.status,
      decisionStatus: recommendation.decisionStatus,
      sourceRefs: recommendation.sourceRefs,
      criteriaSatisfied: recommendation.criteriaSatisfied,
      criteriaNotSatisfied: recommendation.criteriaNotSatisfied,
      missingDocumentation: recommendation.missingDocumentation,
      systemAssumptions: recommendation.silentNveRequirements
    },
    deterministicSelection: {
      methodCode: decision.methodId,
      methodName: decision.methodLabel,
      decisionStatus: decision.status,
      sourceRefs: decision.sourceRefs,
      explanation: decision.explanation,
      explanationSourceRefs: decision.explanationSourceRefs,
      satisfiedCriteria: summary.satisfiedCriteria,
      failedCriteria: summary.failedCriteria,
      missingSiteCriteria: summary.missingSiteCriteria,
      missingDocumentation: summary.missingDocumentation,
      warnings: decision.warnings
    },
    answerFacts,
    implicitObligations: summary.implicitObligations.map((item) => ({
      id: item.id,
      title: item.title,
      obligationText: item.obligationText,
      sourceRefs: item.sourceRefs,
      sourceInterpretation: item.sourceInterpretation,
      userAnswered: false
    })),
    sourceChunks: buildSourceChunks(summary.sourceReferences),
    aiConstraints: [
      "Use deterministicSelection as the fixed recommendation result.",
      "Use answerFacts only as user-provided visible method or site criteria.",
      "Do not treat implicitObligations as user answers.",
      "Do not use legacy q-number answer identifiers.",
      "Do not claim regulatory approval; describe only source anchoring and remaining documentation."
    ],
    energy: {
      annualSolarProductionKWh: visibleAnnualTotals.annualSolarProductionKWh,
      annualLoadDemandKWh: visibleAnnualTotals.annualLoadDemandKWh,
      annualEnergyBalanceKWh: visibleAnnualTotals.annualEnergyBalanceKWh,
      secondarySource: activeReserveSource,
      secondarySourcePowerW: visibleSecondarySourcePowerW
    },
    system: derivedResults.systemRecommendation,
    costs: derivedResults.costComparison
  };
}

function buildReportHtml(
  config: PlantConfiguration,
  recommendation: Recommendation,
  aiRecommendationText: AiReportContent | null,
  derivedResults: DerivedResults,
  activeReserveSource: BackupSourceName,
  visibleAnnualTotals: AnnualTotals,
  visibleMonthlyEnergyBalance: MonthlyEnergyBalanceRow[]
): string {
  const now = new Date();
  const title = projectTitle(config);
  const reportId = reportDocId(config);
  const docId = TRACE_PLACEHOLDER;
  const sys = derivedResults.systemRecommendation;
  const backupLabel = localizeBackupSource(activeReserveSource || sys.secondarySource);
  const backupPowerW = finite(sys.secondarySourcePowerW) ? sys.secondarySourcePowerW : null;
  const panelPower = finite(config.solar.panelPowerWp) ? config.solar.panelPowerWp : null;
  const panelCount = finite(config.solar.panelCount) ? config.solar.panelCount : null;
  const batteryAh = finite(sys.batteryCapacityAh) ? sys.batteryCapacityAh : null;
  const batteryVoltage = finite(config.battery.nominalVoltage) ? config.battery.nominalVoltage : 12.8;
  const batteryDoD = finite(config.battery.maxDepthOfDischarge) ? config.battery.maxDepthOfDischarge : 0.8;
  const batteryUsableKWh = batteryAh ? (batteryAh * batteryVoltage * batteryDoD) / 1000 : null;
  const autonomy = finite(sys.batteryAutonomyDays) && sys.batteryAutonomyDays > 0 ? `${num(sys.batteryAutonomyDays, Number.isInteger(sys.batteryAutonomyDays) ? 0 : 1)} døgn` : "";
  const packageTitle =
    visibleText(recommendation.mainSolution) ||
    [panelCount && panelPower ? "Solcellepanel" : "", batteryAh ? "batteribank" : "", backupLabel ? backupLabel.toLowerCase() : ""]
      .filter(Boolean)
      .join(", ")
      .replace(/, ([^,]*)$/, " og $1");
  const annualFuelCellKWh = visibleMonthlyEnergyBalance.reduce((sum, row) => {
    if (!row) return sum;
    const solar = finite(row.solarProductionKWh) ? row.solarProductionKWh : 0;
    const load = finite(row.loadDemandKWh) ? row.loadDemandKWh : 0;
    return sum + Math.max(0, load - solar);
  }, 0);
  const secondaryKWh: number | null = annualFuelCellKWh > 0 ? annualFuelCellKWh : null;
  const energy = renderEnergyStack(visibleMonthlyEnergyBalance);
  const costs = derivedResults.costComparison.alternatives;
  const radio = radioRows(config);
  const radioGraph = renderRadioGraph(config);
  const freeText = renderFreeText(aiRecommendationText);
  void renderSourceBackedEvidence;
  const lead = normalizeAiReportFields(aiRecommendationText)?.recommendationNote || text(recommendation.justification[0]);
  const fuelCell = costs.find((item) => item.source === "FuelCell");
  const diesel = costs.find((item) => item.source === "DieselGenerator");
  const comparisonRows = [
    fuelCell ? costRow(fuelCell, activeReserveSource === "FuelCell" ? backupPowerW : (finite(config.fuelCell.powerW) ? config.fuelCell.powerW : null), activeReserveSource === "FuelCell") : "",
    diesel ? costRow(diesel, activeReserveSource === "DieselGenerator" ? backupPowerW : (finite(config.diesel.powerW) ? config.diesel.powerW : null), activeReserveSource === "DieselGenerator") : ""
  ].join("");

  return `<!DOCTYPE html><html lang="nb"><head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>HydroGuide · ${esc(title)}</title>
  <link id="gfont-Manrope" rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Manrope:wght@300;400;500;600;700&amp;display=swap">
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&amp;display=swap">
  <style>
    :root{--ink:#020617;--ink-2:#1e293b;--ink-3:#475569;--muted:#64748b;--line:#e2e8f0;--line-soft:#eef2f7;--brand:#2563eb;--brand-dk:#1d4ed8;--brand-soft:#eef6ff;--brand-100:#dbeafe;--brand-200:#bfdbfe;--brand-300:#93c5fd;--emerald:#047857;--amber:#b45309;--rose:#be123c;--page-w:794px;--page-h:1123px}
    *{box-sizing:border-box}html,body{margin:0;background:#eef2f7;font-family:"Manrope",system-ui,-apple-system,"Segoe UI",sans-serif;color:var(--ink);-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;text-rendering:geometricPrecision}body{padding:24px 0 48px;font-size:11.2px;line-height:1.45}
    .page{position:relative;width:794px;height:1123px;margin:0 auto;background:#fff;padding:45px;overflow:hidden;display:flex;flex-direction:column;box-shadow:0 18px 42px -22px rgba(15,23,42,.35)}
    .top{display:flex;justify-content:space-between;align-items:center;padding-bottom:7px;border-bottom:1px solid var(--line)}
    .brand{display:flex;align-items:center;gap:10px}.brand img{height:22px;width:auto;display:block}.report-logo{width:181px;height:auto;position:absolute;top:0;left:40px;pointer-events:none}
    .crumb{font-size:8.5px;letter-spacing:.18em;text-transform:uppercase;color:var(--muted);font-weight:700}
    .report-title{position:absolute;left:45px;top:49px;font-size:24px;font-weight:700;letter-spacing:-.01em;line-height:1;color:#020617;margin:0;white-space:nowrap;pointer-events:none}
    .report-meta{display:flex;flex-direction:column;align-items:flex-end;gap:0;line-height:1.05;font-family:"JetBrains Mono","SF Mono",ui-monospace,Menlo,Consolas,monospace;font-size:9.5px;font-weight:400;letter-spacing:.06em;color:#64748b;text-align:right}
    .report-meta .doc-id{font-size:10.3px;font-weight:700;color:#020617}
    section{margin:0}.page-section{margin-top:14px}.page>.v6-mid{margin-top:14px}.page>.reasons-3{margin-top:14px;display:block}
    .page>section:not(:first-of-type):not(.reasons-3){position:relative}.page>section:not(:first-of-type):not(.reasons-3)::after{content:"";position:absolute;left:0;right:0;top:-7px;height:1px;background:var(--line);pointer-events:none}
    .page>.reasons-3,.page>.v6-mid,.page>.page-section,.page>section.card-shell.page-section{margin-top:10px !important}
    .reasons-3{display:block;padding-top:8px;border-top:1px solid var(--line)}
    .page>section:not(:first-of-type):not(.reasons-3)::after{top:-5px !important}
    .up-card{display:grid;grid-template-columns:minmax(0,1.35fr) 1fr;gap:18px;border:0;background:transparent;position:relative;padding:0 0 0 14px;font-variant-numeric:tabular-nums}
    .up-card::before{content:"";position:absolute;left:0;top:4px;bottom:4px;width:3px;background:var(--brand-dk)}
    .up-main{padding-left:10px;min-width:0;display:flex;flex-direction:column}
    .up-eyebrow{display:flex;align-items:center;gap:8px;font-size:10px;letter-spacing:.22em;text-transform:uppercase;color:var(--brand-dk);font-weight:850;margin-bottom:7px}
    .ft-eyebrow{display:inline-flex;align-items:center;gap:8px;font-size:10px;letter-spacing:.22em;text-transform:uppercase;color:var(--brand-dk);font-weight:850;margin-bottom:6px}
    .up-eyebrow::before,.ft-eyebrow::before{content:"";width:20px;height:1px;background:var(--brand-dk)}
    .up-main h3{margin:0 0 6px;font-size:17px;line-height:1.08;letter-spacing:-.03em;font-weight:850;color:var(--ink);max-width:18em}
    .up-main p{margin:0;font-size:10.5px;line-height:1.45;color:var(--ink-2);font-weight:500;max-width:40em}
    .up-tech{border-left:1px solid var(--line);padding-left:14px;display:flex;flex-direction:column;font-variant-numeric:tabular-nums}
    .up-row{display:flex;align-items:flex-start;gap:8px;padding:1px 0 7px;border-bottom:1px solid var(--line);line-height:1.2}
    .up-row:first-child{padding-top:1px}
    .up-row:last-child{border-bottom:0;padding-bottom:1px}
    .up-row::before{content:"";flex:1 1 auto;order:2;align-self:end;margin-bottom:3px;border-bottom:0;min-width:18px}
    .up-row .k{order:1;flex:0 0 auto;font-size:11.5px;letter-spacing:normal;text-transform:none;color:var(--ink);font-weight:800;line-height:1.25}
    .up-row .v{order:3;flex:0 0 auto;text-align:right;color:var(--ink);font-weight:800;font-size:12px;letter-spacing:-.015em;line-height:1;display:flex;flex-direction:column;align-items:flex-end;gap:1px;white-space:nowrap}
    .up-row .v small{font-size:8.5px;color:var(--muted);font-weight:700;margin-left:2px;letter-spacing:0}
    .up-row .v .sub{font-size:inherit;color:var(--ink);font-weight:inherit;letter-spacing:-.005em;line-height:1;margin:2px 0 0}
    .freetext-box{position:relative;width:100%;min-height:170px;background:transparent;border:0;padding:0 0 0 14px;display:flex;flex-direction:column}
    .freetext-box::before,.card-shell::before{content:"";position:absolute;left:0;top:4px;bottom:4px;width:3px;background:var(--brand-dk)}
    .freetext-box .ft-title{margin:0 0 10px;font-size:17px;line-height:1.08;letter-spacing:-.03em;font-weight:850;color:var(--ink)}
    .freetext-box .ft-body{flex:1 1 auto;min-height:110px;font-size:12px;font-weight:700;color:var(--ink)}
    .freetext-box .ft-body p{margin:0;line-height:1.42}
    .card-shell{position:relative;width:100%;padding:0 0 0 14px}
    .v6-mid{display:grid;grid-template-columns:1fr;gap:12px;margin-top:10px;align-items:stretch}.v6-mid>section{display:flex;flex-direction:column}
    .v6-eb2{position:relative;border:0;background:transparent;padding:0 0 0 14px;display:flex;flex-direction:column;gap:8px;flex:1 1 auto;font-variant-numeric:tabular-nums;width:703px}
    .v6-eb2::before{content:"";position:absolute;left:0;top:4px;bottom:4px;width:3px;background:var(--brand-dk)}
    .v6-stack{position:relative;display:grid;grid-template-columns:repeat(12,1fr);gap:5px;height:130px;align-items:end;padding:6px 4px 0 26px;background-image:repeating-linear-gradient(to right,#cbd5e1 0 5px,transparent 5px 10px),repeating-linear-gradient(to right,#cbd5e1 0 5px,transparent 5px 10px),repeating-linear-gradient(to right,#cbd5e1 0 5px,transparent 5px 10px),repeating-linear-gradient(to right,#cbd5e1 0 5px,transparent 5px 10px),repeating-linear-gradient(to right,#cbd5e1 0 5px,transparent 5px 10px);background-size:calc(100% - 34px) 1px;background-repeat:no-repeat;background-position:34px 6px,34px 37px,34px 68px,34px 99px,34px 100%}
    .v6-stack::before{content:"";position:absolute;left:26px;right:0;bottom:0;border-bottom:1px solid var(--ink-2)}
    .v6-stack .yax{position:absolute;left:0;top:0;bottom:0;width:22px;pointer-events:none;font-variant-numeric:tabular-nums}
    .v6-stack .yax span{position:absolute;right:2px;font-size:7.8px;line-height:normal;color:rgb(0,0,0);font-weight:800;letter-spacing:.06em;text-transform:uppercase;transform:translateY(-50%)}
    .v6-stack .yax span:nth-child(1){top:6px}.v6-stack .yax span:nth-child(2){top:37px}.v6-stack .yax span:nth-child(3){top:68px}.v6-stack .yax span:nth-child(4){top:99px}.v6-stack .yax span:nth-child(5){top:100%}
    .v6-stack .col{position:relative;z-index:1;display:flex;flex-direction:column-reverse;gap:0;height:100%;background:transparent;border:0}.v6-stack .seg{width:100%}.v6-stack .s1{background:var(--brand)}.v6-stack .s2{background:#93b3f5}.v6-stack .s3{background:#16a34a}
    .v6-stack-labels{display:grid;grid-template-columns:repeat(12,1fr);gap:5px;font-size:7.8px;font-weight:800;color:rgb(0,0,0);letter-spacing:.06em;text-transform:uppercase;margin:4px 4px 0;text-align:center}
    .eb-foot{display:grid;grid-template-columns:repeat(3,1fr);column-gap:10px;margin-top:-16px;border-top:0;background:#fff;font-variant-numeric:tabular-nums;padding-left:26px;box-sizing:border-box}
    .eb-foot .ef{padding:4px 0 2px;border-right:0;display:grid;grid-template-columns:auto auto minmax(6px,1fr) max-content;align-items:baseline;column-gap:6px}
    .eb-foot .ef i{grid-column:1;display:inline-block;width:9px;height:9px;border-radius:2px;flex-shrink:0;align-self:center}
    .eb-foot .ef .k{grid-column:2;font-size:12px;letter-spacing:0;text-transform:none;color:var(--ink);font-weight:800}
    .eb-foot .ef .v{grid-column:4;font-size:12px;font-weight:800;letter-spacing:0;line-height:1;color:var(--ink);margin-left:auto}
    .eb-foot .ef .v small{font-size:inherit;color:var(--ink);font-weight:inherit;margin-left:2px;letter-spacing:0}
    .eb-foot .ef:last-child{padding-right:4px;border-right:0}
    .v6-compare{width:100%;border-collapse:collapse;border:0;background:transparent;font-variant-numeric:tabular-nums;table-layout:fixed}
    .v6-compare col.c-source{width:22%}.v6-compare col.c-data{width:auto}
    .v6-compare th,.v6-compare td{padding:8px 9px;border-right:1px solid var(--line);border-bottom:1px solid var(--line);text-align:left;font-size:11px;font-weight:700;color:var(--ink);white-space:nowrap}
    .v6-compare th:last-child,.v6-compare td:last-child{border-right:0}
    .v6-compare tr:last-child td{border-bottom:0}
    .v6-compare thead th{text-align:left;font-size:9.5px;letter-spacing:.04em;text-transform:none;color:var(--muted);font-weight:800;background:transparent;border-bottom:1px solid var(--ink);padding:7px 9px}
    .v6-compare th.rowhead,.v6-compare td.rowhead{text-align:left;font-size:10px;font-weight:800;letter-spacing:-.005em;background:transparent}
    .v6-compare thead th.rowhead{font-size:9.5px;letter-spacing:.04em;text-transform:none;color:var(--muted);font-weight:800}
    .v6-compare tbody td{color:#000 !important;background:transparent;font-weight:800 !important}
    .v6-compare tbody td.rowhead{color:#000 !important;background:transparent}
    .v6-compare td small{font-size:8.5px;font-weight:800 !important;color:#000 !important;margin-left:2px;letter-spacing:0}
    .v6-terrain{position:relative;margin-top:10px;height:200px;border:0;overflow:hidden;background-color:#fff;background-image:repeating-linear-gradient(to right,#cbd5e1 0 5px,transparent 5px 10px),repeating-linear-gradient(to right,#cbd5e1 0 5px,transparent 5px 10px),repeating-linear-gradient(to right,#cbd5e1 0 5px,transparent 5px 10px),repeating-linear-gradient(to right,#cbd5e1 0 5px,transparent 5px 10px),repeating-linear-gradient(to right,#cbd5e1 0 5px,transparent 5px 10px);background-size:calc(100% - 34px) 1px;background-repeat:no-repeat;background-position:34px 32px,34px 62px,34px 92px,34px 122px,34px 152px}
    .v6-terrain::after{content:"";position:absolute;left:34px;right:0;bottom:48px;border-bottom:1px solid var(--ink-2)}.v6-terrain svg{width:100%;height:100%;display:block}
    .radio-like-eb{display:flex;flex-direction:column;gap:0;width:100%}.radio-head{display:flex;flex-direction:column;align-items:flex-start;gap:2px;margin-bottom:0}
    .radio-yax,.radio-xax{pointer-events:none;font-variant-numeric:tabular-nums}
    .radio-legend-html{position:absolute;left:160px;right:0;bottom:0;height:16px;font-size:8.5px;font-weight:800;color:#000}.radio-legend-html .item{position:absolute;display:inline-flex;align-items:center;gap:6px}.radio-legend-html .sw{width:18px;height:2px;display:inline-block}.radio-legend-html .h{left:0}.radio-legend-html .s{left:94px}.radio-legend-html .fn{left:346px}.radio-legend-html .fo{left:484px}.radio-legend-html .h .sw{background:#000}.radio-legend-html .s .sw{background:green}.radio-legend-html .fn .sw{background:red}.radio-legend-html .fo .sw{background:orange}
    .v6-radio-data{display:inline-table;width:auto;max-width:none;margin:0;padding:0;border:0;border-collapse:collapse;border-spacing:0;background:transparent;font-variant-numeric:tabular-nums;text-align:left!important;white-space:nowrap}
    .v6-radio-data>div{display:table-cell;vertical-align:top;width:auto;min-width:0;max-width:none;margin:0;padding:0;border:0;border-right:1px solid var(--line,#cbd5e1);background:transparent;text-align:left!important;white-space:nowrap}.v6-radio-data>div:last-child{border-right:0}
    .v6-radio-data .k{display:block;box-sizing:border-box;width:100%!important;max-width:none!important;min-width:max-content;margin:0!important;padding:0 2px!important;border:0!important;border-top:1px solid var(--line,#cbd5e1)!important;color:var(--ink,#050816)!important;background:transparent!important;font-size:9.5px!important;line-height:1.12;letter-spacing:.04em!important;text-transform:none;font-weight:800;white-space:nowrap!important;overflow-wrap:normal!important;word-break:normal!important;text-align:left!important;text-indent:0!important}
    .v6-radio-data .v{display:block;box-sizing:border-box;width:100%!important;max-width:none!important;min-width:max-content;min-height:1.12em;margin:4px 0 0 0!important;padding:0 2px!important;border:0!important;color:var(--ink,#050816)!important;background:transparent!important;font-size:11px!important;line-height:1.12;font-weight:800;letter-spacing:-.01em;white-space:nowrap!important;overflow-wrap:normal!important;word-break:normal!important;text-align:center!important;text-indent:0!important}
    .footer{margin-top:8px;padding-top:6px;border-top:1px solid var(--line);display:flex;justify-content:space-between;font-size:8.5px;color:var(--muted);letter-spacing:.04em}
    .footer b{color:var(--ink-2);font-weight:700}
    .v6-terrain{background-image:none !important;background-color:transparent !important}
    .v6-terrain::after{content:"" !important;display:block !important;position:absolute !important;left:28px !important;right:48px !important;bottom:38px !important;height:0 !important;border-bottom:1px solid #000 !important;pointer-events:none !important;z-index:2 !important}
    .v6-terrain svg .radio-svg-y-axis text,.v6-terrain svg .radio-svg-x-axis text,.v6-terrain svg .radio-svg-legend text,.v6-terrain svg .radio-svg-legend{display:none !important}
    .radio-like-eb{display:flex;flex-direction:column;gap:0;width:703px}
    .radio-like-eb .radio-head{display:flex;flex-direction:column;align-items:flex-start;gap:2px;margin-bottom:10px;border-bottom:0}
    .radio-like-eb .radio-head b{color:#000 !important}
    .radio-like-eb .v6-terrain{width:703px;height:200px;margin-top:0;overflow:visible !important}
    .v6-terrain .radio-yax,.v6-terrain .radio-xax{position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;z-index:3;font-variant-numeric:tabular-nums}
    .v6-terrain .radio-yax{left:0 !important;top:0 !important;width:22px !important;height:100% !important}
    .v6-terrain .radio-yax .n{position:absolute;left:auto !important;right:2px !important;width:auto !important;text-align:right !important;font-family:inherit !important;font-size:7.8px !important;font-weight:800 !important;color:rgb(0,0,0) !important;letter-spacing:.06em !important;text-transform:uppercase !important;font-variant-numeric:tabular-nums !important;line-height:normal !important;transform:translateY(-50%) !important;text-shadow:none !important;-webkit-text-stroke:0 !important;paint-order:normal !important;white-space:nowrap}
    .v6-terrain .radio-yax .unit{position:absolute;left:-6px !important;top:88px !important;font-family:inherit !important;font-size:7.8px !important;font-weight:800 !important;color:rgb(0,0,0) !important;letter-spacing:.06em !important;text-transform:uppercase !important;font-variant-numeric:tabular-nums !important;line-height:normal !important;transform:translate(-50%,-50%) rotate(-90deg) !important;text-shadow:none !important;-webkit-text-stroke:0 !important;paint-order:normal !important;white-space:nowrap}
    .v6-terrain .radio-xax .n{position:absolute;top:174px !important;font-family:inherit !important;font-size:7.8px !important;font-weight:800 !important;color:rgb(0,0,0) !important;letter-spacing:.06em !important;text-transform:uppercase !important;font-variant-numeric:tabular-nums !important;line-height:normal !important;transform:translateX(-50%);white-space:nowrap;text-shadow:none !important;-webkit-text-stroke:0 !important;paint-order:normal !important}
    .v6-terrain .radio-xax .unit{position:absolute;top:187px;left:47.76% !important;font-family:inherit !important;font-size:7.8px !important;font-weight:800 !important;color:rgb(0,0,0) !important;letter-spacing:.06em !important;text-transform:uppercase !important;font-variant-numeric:tabular-nums !important;line-height:normal !important;transform:translateX(-50%);white-space:nowrap;text-shadow:none !important;-webkit-text-stroke:0 !important;paint-order:normal !important}
    .radio-legend-html{position:absolute !important;left:28px !important;right:28px !important;top:186px !important;bottom:auto !important;margin:0 !important;display:grid !important;grid-template-columns:repeat(4,max-content) !important;justify-content:space-between !important;align-items:center !important;column-gap:18px !important;z-index:4 !important;pointer-events:none !important;font-family:inherit !important;font-size:9.5px !important;font-weight:800 !important;letter-spacing:.02em !important;color:#000 !important;font-variant-numeric:tabular-nums !important;line-height:1 !important;white-space:nowrap !important;height:auto !important}
    .radio-legend-html .item{position:static !important;display:inline-flex !important;align-items:center !important;gap:6px !important;white-space:nowrap !important;color:#000 !important}
    .radio-legend-html .item span{color:#000 !important}
    .radio-legend-html .sw{width:24px !important;height:0 !important;border-top-width:3.5px !important;border-top-style:solid !important;border-radius:2px !important;background:transparent !important;flex:0 0 auto !important}
    .radio-legend-html .h .sw{border-top-color:#000 !important}
    .radio-legend-html .s .sw{border-top-color:#008000 !important}
    .radio-legend-html .fn .sw{border-top-color:#f00 !important}
    .radio-legend-html .fo .sw{border-top-color:orange !important}
    .radio-legend-html .s{transform:translateX(-12px) !important}
    .radio-legend-html .fn{transform:translateX(12px) !important}
    .radio-legend-html .fo{justify-self:end !important;transform:translateX(-14px) !important}
    .v6-stack-labels{display:grid !important;grid-template-columns:repeat(12,1fr) !important;gap:5px !important;margin:5px 4px 5px 26px !important;padding-right:4px !important;height:10px !important;position:relative !important;z-index:3 !important;text-align:center !important;font-size:7.8px !important;font-weight:800 !important;letter-spacing:.06em !important;color:rgb(0,0,0) !important;text-transform:uppercase !important;font-variant-numeric:tabular-nums !important;line-height:normal !important;text-shadow:none !important;-webkit-text-stroke:0 !important;paint-order:normal !important}
    .v6-stack-labels>span{color:rgb(0,0,0) !important}
    .eb-foot{margin-top:0 !important}
    .v6-eb2{margin-bottom:0 !important}
    @page{size:A4;margin:0}@media print{html,body{background:#fff}.page{box-shadow:none;margin:0;page-break-after:auto;break-after:auto}}
  </style>
</head><body>
  <main class="page" style="object-fit: fill;">
    <header class="top">
      <div class="brand"><img class="report-logo" src="/hydroguide-logo-black.svg" alt="HydroGuide" style="width: 181px; height: auto; position: absolute; top: 0px; left: 40px; pointer-events: none;"><span class="crumb"><br></span></div>
      <h1 class="report-title">${blank(title)}</h1>
      <div class="report-meta"><span class="doc-id">${esc(docId)}</span><span>${blank(reportId)}</span><span>${esc(reportDate(now))}</span></div>
    </header>

    <section>
      <div class="up-card">
        <div class="up-main">
          <span class="up-eyebrow">Anbefalt utstyrspakke</span>
          <h3>${blank(packageTitle)}</h3>
          <p style="font-weight: 700;"><span style="color: rgb(0, 0, 0);">${blank(lead)}</span></p>
        </div>
        <aside class="up-tech" aria-label="Tekniske valg">
          <div class="up-row"><span class="k"><span style="color: rgb(0, 0, 0);">Solcellepanel</span></span><span class="v">${panelCount && panelPower ? `${num(panelCount * panelPower, 0)} Wp<span class="sub">${num(panelCount, 0)} × ${num(panelPower, 0)} Wp</span>` : "&nbsp;"}</span></div>
          <div class="up-row"><span class="k"><span style="color: rgb(0, 0, 0);">Batteribank</span></span><span class="v">${batteryAh ? `${num(batteryAh, 0)} Ah${batteryUsableKWh ? `<span class="sub">${num(batteryUsableKWh, 1)} kWh brukbar</span>` : ""}` : "&nbsp;"}</span></div>
          <div class="up-row" style="color: rgb(0, 0, 0);"><span class="k"><span style="color: rgb(0, 0, 0);">Sekundærkilde</span></span><span class="v">${backupPowerW ? `${num(backupPowerW, 0)} W<span class="sub">${esc(backupLabel)}</span>` : "&nbsp;"}</span></div>
          <div class="up-row"><span class="k"><span style="color: rgb(0, 0, 0);">Autonomi</span></span><span class="v">${blank(autonomy)}</span></div>
        </aside>
      </div>
    </section>

    <section class="reasons-3">
      <div class="freetext-box">
        <span class="ft-eyebrow">Begrunnelse</span>
        <h3 class="ft-title">Begrunnelse valgt løsning</h3>
        <div class="ft-body">${freeText}</div>
      </div>
    </section>

    <section class="v6-mid">
      <section>
        <div class="v6-eb2" style="display: flex; flex-direction: column; gap: 0px; width: 703px;">
          <div style="display:flex; flex-direction:column; align-items:flex-start; gap:2px; margin-bottom: 10px; border-bottom: 0;">
            <span class="ft-eyebrow">Energibalanse</span>
            <b style="font-size:17px; font-weight:850; letter-spacing:-.03em; line-height:1.08; color:var(--ink);">Energibalanse</b>
          </div>
          <div class="v6-stack">${`<div class="yax">${energy.yAxis}</div>`}${energy.bars}</div>
          <div class="v6-stack-labels">${energy.labels}</div>
          <div class="eb-foot">
            <div class="ef hi"><i style="background:var(--brand)"></i><span class="k">Solcellepanel</span><span class="v" style="margin-left: auto;">${blank(num(visibleAnnualTotals.annualSolarProductionKWh, 0))}<small>kWh/år</small></span></div>
            <div class="ef"><i style="background:#93b3f5"></i><span class="k">Last</span><span class="v" style="margin-left:auto">${blank(num(visibleAnnualTotals.annualLoadDemandKWh, 0))}<small>kWh/år</small></span></div>
            <div class="ef"><i style="background:#16a34a"></i><span class="k">${blank(backupLabel)}</span><span class="v" style="margin-left:auto">${blank(num(secondaryKWh, 0))}<small>kWh/år</small></span></div>
          </div>
        </div>
      </section>
    </section>

    <section class="page-section">
      <div class="card-shell">
        <div style="display:flex; flex-direction:column; align-items:flex-start; gap:2px; margin-bottom: 10px;">
          <span class="ft-eyebrow">Sammenligning</span>
          <b style="font-size:17px; font-weight:850; letter-spacing:-.03em; line-height:1.08; color:var(--ink);">Sammenligning sekundærkilde</b>
        </div>
        <table class="v6-compare">
          <colgroup><col class="c-source"><col class="c-data"><col class="c-data"><col class="c-data"><col class="c-data"><col class="c-data"><col class="c-data"><col class="c-data"><col class="c-data"></colgroup>
          <thead><tr><th class="rowhead"><span style="color: rgb(0, 0, 0);">Reservekilde</span></th><th><span style="color: rgb(0, 0, 0);">Effekt</span></th><th><span style="color: rgb(0, 0, 0);">Levetid</span></th><th><span style="color: rgb(0, 0, 0);">Driftstid</span></th><th><span style="color: rgb(0, 0, 0);">Drivstoff</span></th><th><span style="color: rgb(0, 0, 0);">CO₂</span></th><th><span style="color: rgb(0, 0, 0);">Kjøp</span></th><th><span style="color: rgb(0, 0, 0);">Drift/år</span></th><th><span style="color: rgb(0, 0, 0);">TOC ${blank(num(config.other.evaluationHorizonYears, 0))} år</span></th></tr></thead>
          <tbody>${comparisonRows}</tbody>
        </table>
      </div>
    </section>

    <section class="card-shell page-section">
      <div class="radio-like-eb">
        <div class="radio-head"><span class="ft-eyebrow">Radiolinje</span><b style="font-size:17px; font-weight:850; letter-spacing:-.03em; line-height:1.08; color:var(--ink);">Radiolinje · ${blank(title)}</b></div>
        <div class="v6-terrain" style="margin-top:0;height:200px">
          ${radioGraph.svg}
          ${radioGraph.yAxis}
          ${radioGraph.xAxis}
          <div class="radio-legend-html" aria-hidden="true"><span class="item h"><i class="sw"></i><span>høyde</span></span><span class="item s"><i class="sw"></i><span>siktlinje</span></span><span class="item fn"><i class="sw"></i><span>fresnel nedre</span></span><span class="item fo"><i class="sw"></i><span>fresnel øvre</span></span></div>
        </div>
      </div>
      <div class="v6-radio-data">
        <div><span class="k">Linkavstand</span><span class="v">${blank(radio.distance)}</span></div>
        <div><span class="k">Frittromsdempning</span><span class="v">${blank(radio.loss)}</span></div>
        <div><span class="k">Regndempning</span><span class="v">${blank(radio.rainLoss)}</span></div>
        <div><span class="k">Frekvens</span><span class="v">${blank(radio.frequency)}</span></div>
        <div><span class="k">Jordradius-faktor</span><span class="v">${blank(radio.kFactor)}</span></div>
        <div><span class="k">Regnfaktor</span><span class="v">${blank(radio.rainFactor)}</span></div>
        <div><span class="k">% av første fresnel sone</span><span class="v">${blank(radio.fresnelFactor)}</span></div>
        <div><span class="k">Polarisering</span><span class="v">${blank(radio.polarization)}</span></div>
      </div>
    </section>

    <footer class="footer"><b>HydroGuide · Beslutningsrapport · ${blank(title)}&nbsp;</b><span class="trace-line">Sist sporing: ${esc(docId)}</span><b>Side 2 / 2</b></footer>
  </main>
</body></html>`;
}

export async function openReportWindow(
  config: PlantConfiguration,
  recommendation: Recommendation,
  aiRecommendationText: AiReportContent | null,
  derivedResults: DerivedResults,
  activeReserveSource: BackupSourceName,
  visibleAnnualTotals: AnnualTotals,
  visibleMonthlyEnergyBalance: MonthlyEnergyBalanceRow[]
): Promise<void> {
  const html = await stampTraceId(
    buildReportHtml(
      config,
      recommendation,
      aiRecommendationText,
      derivedResults,
      activeReserveSource,
      visibleAnnualTotals,
      visibleMonthlyEnergyBalance
    )
  );
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
  anchor.download = `${(config.name || "rapport").trim().replace(FILENAME_SAFE_RE, "")}.html`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
