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
import type { RadioLinkAnalysis } from "./radioLink";
// @ts-ignore Shared browser-safe trace guard also runs as the Node hook script.
import { stampTraceId, TRACE_PLACEHOLDER } from "../../../backend/scripts/check-trace-id.mjs";

const AMP_RE = /&/g;
const LT_RE = /</g;
const GT_RE = />/g;
const DQUOTE_RE = /"/g;
const SQUOTE_RE = /'/g;
const TRIM_QUOTES_RE = /^["']|["']$/g;
const AI_REPORT_PREFIX_RE = /^Faglig underbygging:\s*/i;
const WHITESPACE_RE = /\s+/g;
const SENTENCE_BOUNDARY_RE = /([.!?])\s+(?=[A-ZÆØÅ])/g;
const SEMICOLON_SPLIT_RE = /\s*;\s*/;
const FILENAME_SAFE_RE = /[^a-zA-Z0-9æøåÆØÅ _-]/g;

export type AiReportFields = {
  recommendationNote?: string;
  measurementNote?: string;
  energyNote?: string;
  evidenceNote?: string;
};

export type AiReportContent = string | AiReportFields;

function esc(s: string): string {
  return s.replace(AMP_RE, "&amp;").replace(LT_RE, "&lt;").replace(GT_RE, "&gt;").replace(DQUOTE_RE, "&quot;").replace(SQUOTE_RE, "&#39;");
}

function localizeBackupSource(source: BackupSourceName | "NotComputed" | string): string {
  if (source === "FuelCell") return "Brenselcelle";
  if (source === "DieselGenerator") return "Dieselaggregat";
  if (source === "NotComputed") return "Ikke beregnet";
  return source;
}

function reportShortDate(date: Date): string {
  return new Intl.DateTimeFormat("nb-NO", { day: "numeric", month: "long", year: "numeric" }).format(date);
}

function formatAutonomyDays(days: number): string {
  if (days <= 0) return "\u2014";
  const decimals = Number.isInteger(days) ? 0 : 1;
  return `${formatNumber(days, decimals)} dager`;
}

function locationSubLabel(config: PlantConfiguration): string {
  const details = config.nvePlantDetails;
  if (details) {
    const parts = [details.municipality, details.county].filter(Boolean) as string[];
    if (parts.length) return parts.join(", ");
  }
  return config.location || "";
}

function projectShortName(config: PlantConfiguration): string {
  const raw = (config.name || "").trim();
  if (!raw) return "Konfigurasjon";
  return raw.replace(/\s+kraftverk$/i, "");
}

function projectFullTitle(config: PlantConfiguration): string {
  const raw = (config.name || "").trim();
  if (!raw) return "Konfigurasjon";
  return /kraftverk/i.test(raw) ? raw : `${raw} kraftverk`;
}

function flowVariationLabel(answers: PlantConfiguration["answers"]): string {
  const v = answers.q03FlowClass;
  if (v === "0_50") return "0-50 l/s";
  if (v === "50_200") return "50-200 l/s";
  if (v === "200_500") return "200-500 l/s";
  if (v === "500_1000") return "0,5-1 m3/s";
  if (v === "1000_2000") return "1-2 m3/s";
  if (v === "over_2000") return "Over 2 m3/s";
  if (v === "unknown") return "Ukjent";
  return "";
}

function projectSituationLabel(answers: PlantConfiguration["answers"]): string {
  if (answers.q02ProjectType === "new") return "Nytt anlegg";
  if (answers.q02ProjectType === "olderNewRequirement") return "Eldre anlegg med nytt krav";
  if (answers.q02ProjectType === "conversion") return "Ombygging";
  if (answers.q02ProjectType === "existingOperation") return "Eksisterende anlegg i drift";
  if (answers.q02ProjectType === "temporary") return "Midlertidig løsning";
  if (answers.q02ProjectType === "unknown") return "Ukjent";
  return "";
}

function releaseSolutionLabel(answers: PlantConfiguration["answers"]): string {
  if (answers.q07ReleaseSolution === "pipeIntake") return "Rør via inntak";
  if (answers.q07ReleaseSolution === "pipeThroughDam") return "Rør gjennom dam/terskel";
  if (answers.q07ReleaseSolution === "gate") return "Tappeluke";
  if (answers.q07ReleaseSolution === "damOpening") return "Utsparing i dam";
  if (answers.q07ReleaseSolution === "fishPassage") return "Fiskepassasje";
  if (answers.q07ReleaseSolution === "coandaSpecific") return "Coanda-/tyrolerrist";
  if (answers.q07ReleaseSolution === "noneSelected") return "Ikke valgt";
  if (answers.q07ReleaseSolution === "alternativeRelease") return "Alternativ slippform";
  if (answers.q07ReleaseSolution === "unknown") return "Ukjent";
  return "";
}

function confidenceLabel(status: string | undefined): string {
  if (status === "Recommended") return "Høy";
  if (status === "NeedsReview") return "Middels";
  if (status === "NeedsClarification") return "Lav";
  return "—";
}

function statusLabel(status: string | undefined): string {
  if (status === "Recommended") return "Anbefalt";
  if (status === "NeedsReview") return "Til vurdering";
  if (status === "NeedsClarification") return "Krever avklaring";
  return "—";
}

function backupAnnualEnergyKWh(systemRec: { secondarySourcePowerW: number }, annualTotals: AnnualTotals): number {
  return (systemRec.secondarySourcePowerW * annualTotals.annualSecondaryRuntimeHours) / 1000;
}

function deriveFrostProtection(releaseArrangement: string): string {
  return releaseArrangement.toLowerCase().includes("frostfritt rom")
    ? "Instrumentering og slipp i frostfritt rom"
    : "";
}

function deriveAlarmNotification(operationsRequirements: string[], communication: string): string {
  const opsHasAlarm = operationsRequirements.some((req) => /alarm|varsling|driftssystem/i.test(req));
  const commHasAlarm = /alarm|varsling/i.test(communication || "");
  return opsHasAlarm || commHasAlarm ? "Automatisk alarm og signaloverføring til driftssystem" : "";
}

function tocBarRow(
  item: CostComparisonItem,
  maxToc: number,
  isRecommended: boolean
): string {
  const widthPct = maxToc > 0 ? Math.max(2, (item.totalOwnershipCost / maxToc) * 100) : 0;
  const cls = isRecommended ? "row recommended" : "row alt";
  return `<div class="${cls}">
    <span class="name">${esc(localizeBackupSource(item.source))}</span>
    <span class="track"><span class="fill" style="width:${widthPct.toFixed(1)}%"></span></span>
    <span class="val">${formatNumber(item.totalOwnershipCost, 0)} kr</span>
  </div>`;
}

function costTableRow(item: CostComparisonItem, isRecommended: boolean): string {
  const cls = isRecommended ? "recommended" : "";
  return `<tr class="${cls}">
    <td>${esc(localizeBackupSource(item.source))}</td>
    <td class="num">${formatNumber(item.purchaseCost, 0)} kr</td>
    <td class="num">${formatNumber(item.operatingCostPerYear - item.annualMaintenance, 0)} kr</td>
    <td class="num">${formatNumber(item.annualMaintenance, 0)} kr</td>
    <td class="num">${formatNumber(item.annualCo2, 0)} kg</td>
    <td class="num">${formatNumber(item.totalRuntimeHours, 0)} t</td>
    <td class="num">${formatNumber(item.totalOwnershipCost, 0)} kr</td>
  </tr>`;
}

function reasonBlock(marker: string, justification: string): string {
  const trimmed = justification.trim();
  if (!trimmed) return "";
  const splitMatch = trimmed.match(/^([^.!?]{4,80}[.!?])\s*(.*)$/s);
  const heading = splitMatch ? splitMatch[1].replace(/[.!?]+$/, "").trim() : trimmed;
  const body = splitMatch && splitMatch[2] ? splitMatch[2].trim() : "";
  return `<div class="reason">
    <div class="marker">${esc(marker)}</div>
    <div>
      <h4>${esc(heading)}</h4>
      ${body ? `<p>${esc(body)}</p>` : ""}
    </div>
  </div>`;
}

function monthBarPair(row: MonthlyEnergyBalanceRow, label: string, niceMax: number): string {
  const solarH = niceMax > 0 ? Math.max(0, (row.solarProductionKWh / niceMax) * 100) : 0;
  const loadH = niceMax > 0 ? Math.max(0, (row.loadDemandKWh / niceMax) * 100) : 0;
  return `<div class="col"><div class="pair"><div class="bar" style="height:${solarH.toFixed(1)}%"></div><div class="bar load" style="height:${loadH.toFixed(1)}%"></div></div><span class="label">${esc(label)}</span></div>`;
}

function appendixMonthStack(row: MonthlyEnergyBalanceRow, niceMax: number): string {
  const solarH = niceMax > 0 ? Math.max(2, (row.solarProductionKWh / niceMax) * 100) : 2;
  const loadH = niceMax > 0 ? Math.max(2, (row.loadDemandKWh / niceMax) * 100) : 2;
  const reserveH = niceMax > 0 ? Math.max(0, (row.secondaryRuntimeHours / Math.max(niceMax, 1)) * 18) : 0;
  return `<div class="col"><div class="seg s1" style="height:${solarH.toFixed(1)}%"></div><div class="seg s2" style="height:${loadH.toFixed(1)}%"></div>${reserveH > 0 ? `<div class="seg s3" style="height:${reserveH.toFixed(1)}%"></div>` : ""}</div>`;
}

function appendixCostRow(item: CostComparisonItem, powerW: number | null, isRecommended: boolean): string {
  const cls = item.source === "FuelCell" ? "bc" : "ds";
  return `<tr class="${cls}${isRecommended ? " rec" : ""}">
    <td class="rowhead">${esc(localizeBackupSource(item.source))}</td>
    <td>${powerW === null ? "—" : formatNumber(powerW, 0)} <small>W</small></td>
    <td>${formatNumber(item.technicalLifetimeHours, 0)} <small>timer</small></td>
    <td>${formatNumber(item.totalRuntimeHours / Math.max(item.evaluationHorizonYears, 1), 0)} <small>timer/år</small></td>
    <td>${formatNumber(item.annualFuelConsumption, 0)} <small>l/år</small></td>
    <td>${formatNumber(item.annualCo2, 0)} <small>kg/år</small></td>
    <td>${formatNumber(item.purchaseCost, 0)} <small>kr</small></td>
    <td>${formatNumber(item.operatingCostPerYear, 0)} <small>kr</small></td>
    <td>${formatNumber(item.totalOwnershipCost, 0)} <small>kr</small></td>
  </tr>`;
}

function isRadioLinkAnalysis(value: unknown): value is RadioLinkAnalysis {
  return Boolean(
    value &&
      typeof value === "object" &&
      "terrainDistanceKm" in value &&
      "freeSpaceLossDb" in value &&
      "rainAttenuationDb" in value &&
      "fresnelClearanceM" in value
  );
}

function renderAiRecommendationText(text: string): string {
  const normalized = text
    .trim()
    .replace(TRIM_QUOTES_RE, "")
    .replace(AI_REPORT_PREFIX_RE, "")
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
        `<p${index > 0 ? ` style="margin-top:0.5rem;"` : ""}>${index === 0 ? `<strong>Faglig underbygging:</strong> ` : ""}${esc(restoreAbbreviations(paragraph))}</p>`
    )
    .join("");
}

function normalizeAiReportFields(content: AiReportContent | null): AiReportFields | null {
  if (!content || typeof content === "string") {
    return null;
  }

  const textField = (value: unknown) => (typeof value === "string" ? value.trim() : "");
  const fields = {
    recommendationNote: textField(content.recommendationNote),
    measurementNote: textField(content.measurementNote),
    energyNote: textField(content.energyNote),
    evidenceNote: textField(content.evidenceNote)
  };

  return Object.values(fields).some(Boolean) ? fields : null;
}

function renderAiNote(text: string | undefined): string {
  const trimmed = text?.trim();
  return trimmed ? `<p class="ai-note">${esc(trimmed)}</p>` : "";
}

function optionalNumber(value: number | ""): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function formatOptionalNumber(value: number | "", digits = 0, fallback = "Ikke beregnet"): string {
  const numericValue = optionalNumber(value);
  return numericValue === null ? fallback : formatNumber(numericValue, digits);
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
    derivedResults.systemRecommendation.secondarySource === "NotComputed" ? "Ikke beregnet" : activeReserveSource;
  const backupLogger =
    derivedResults.systemRecommendation.loggerSetup.toLowerCase().includes("backup") ||
    derivedResults.systemRecommendation.loggerSetup.toLowerCase().includes("2 loggere")
      ? "Ja"
      : "Nei";
  const frostProtection = deriveFrostProtection(derivedResults.systemRecommendation.releaseArrangement);
  const bypass = "";
  const alarmNotification = deriveAlarmNotification(
    derivedResults.systemRecommendation.operationsRequirements,
    derivedResults.systemRecommendation.communication
  );
  const plantTypeLabel = projectSituationLabel(config.answers);
  const hydrologyLabel = flowVariationLabel(config.answers);

  return {
    accessCodeHash: "",
    project: config.name || "Konfigurasjon",
    location: config.location || "",
    projectDescription: config.name ? `${config.name}${config.location ? ` i ${config.location}` : ""}.` : config.location || "",
    facilityType: plantTypeLabel,
    hydrology: hydrologyLabel,
    mainSolution: recommendation.mainSolution,
    releaseMethod: derivedResults.systemRecommendation.releaseArrangement,
    primaryMeasurement: derivedResults.systemRecommendation.primaryMeasurement,
    controlMeasurement: derivedResults.systemRecommendation.controlMeasurement,
    measurementPrinciple: derivedResults.systemRecommendation.primaryMeasurement,
    measurementEquipment: derivedResults.systemRecommendation.measurementEquipment,
    loggerSetup: derivedResults.systemRecommendation.loggerSetup,
    backupLogger,
    communication: derivedResults.systemRecommendation.communication,
    alarmNotification,
    backupSource: reserveSourceLabel,
    backupEnergySource: reserveSourceLabel,
    primaryEnergySource: "Solcelleanlegg",
    backupPowerW: visibleSecondarySourcePowerW,
    batteryBankAh: derivedResults.systemRecommendation.batteryCapacityAh,
    autonomyDays: derivedResults.systemRecommendation.batteryAutonomyDays,
    iceAdaptation: derivedResults.systemRecommendation.icingAdaptation,
    frostProtection,
    bypass,
    annualSolarProductionKWh: visibleAnnualTotals.annualSolarProductionKWh,
    annualLoadDemandKWh: visibleAnnualTotals.annualLoadDemandKWh,
    annualEnergyBalanceKWh: visibleAnnualTotals.annualEnergyBalanceKWh,
    justification: recommendation.justification,
    additionalRequirements: recommendation.additionalRequirements,
    operationalRequirements: derivedResults.systemRecommendation.operationsRequirements,
    methodCode: recommendation.methodCode,
    methodName: recommendation.methodName,
    releaseSolutionCode: recommendation.releaseSolutionCode,
    releaseSolutionName: recommendation.releaseSolutionName,
    measurementMethodCode: recommendation.measurementMethodCode,
    measurementMethodName: recommendation.measurementMethodName,
    solutionName: recommendation.methodName,
    decisionStatus: recommendation.decisionStatus,
    nveAnchors: recommendation.nveAnchors,
    alternativeRecommendations: recommendation.alternatives?.map(
      (item) => `${item.methodCode} - ${item.methodName} (rang ${item.rank}, ${item.nveAnchors.join(", ")})`
    ) ?? [],
    discouragedMethods: recommendation.discouragedMethods?.map((item) => `${item.methodCode}: ${item.reason}`) ?? [],
    missingForFinalChoice: recommendation.missingForFinalChoice,
    documentationRequirements: recommendation.documentationRequirements,
    silentNveRequirements: recommendation.silentNveRequirements,
    releaseMethodSelected: config.answers.q07ReleaseSolution,
    releaseMethodLabel: releaseSolutionLabel(config.answers),
    releaseRequirementVariation: config.answers.q04RequirementPattern,
    minFlowClass: config.answers.q03FlowClass,
    fishMigration: config.answers.q08FishMigration,
    coandaExists: config.answers.q09CoandaExists,
    siteChallenges: config.answers.q10SiteChallenges,
    powerCommunication: config.answers.q11PowerCommunication,
    publicDisplay: config.answers.q12PublicDisplay,
    hourlyAutomaticLogging: config.answers.q65HourlyAutomaticLogging,
    secureDataStorageForNve: config.answers.q68SecureDataStorageForNve,
    accuracyWithinFivePercent: config.answers.q66AccuracyWithinFivePercent,
    completenessNinetySevenPercent: config.answers.q67CompletenessNinetySevenPercent,
    include_recommendations: true,
    ai_on: true,
    reportExtract: [
      `Anbefalt hovedløsning: ${recommendation.mainSolution}.`,
      `Slippordning: ${derivedResults.systemRecommendation.releaseArrangement}.`,
      `Måling i ordinær drift: ${derivedResults.systemRecommendation.primaryMeasurement}.`,
      `Måleprinsipp: ${derivedResults.systemRecommendation.controlMeasurement}.`,
      `Kommunikasjon: ${derivedResults.systemRecommendation.communication}.`,
      `Loggeroppsett: ${derivedResults.systemRecommendation.loggerSetup}.`,
      `Reservekilde: ${reserveSourceLabel}.`,
      `Reserveeffekt: ${visibleSecondarySourcePowerW} W.`,
      `Batteribank: ${derivedResults.systemRecommendation.batteryCapacityAh} Ah.`,
      `Autonomi: ${derivedResults.systemRecommendation.batteryAutonomyDays} dager.`,
      `Årlig solproduksjon: ${visibleAnnualTotals.annualSolarProductionKWh} kWh.`,
      `Årlig last: ${visibleAnnualTotals.annualLoadDemandKWh} kWh.`,
      `Årlig energibalanse: ${visibleAnnualTotals.annualEnergyBalanceKWh} kWh.`
    ]
      .filter(Boolean)
      .join(" ")
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
  const todayLong = reportShortDate(now);
  const docId = TRACE_PLACEHOLDER;
  const isoStamp = now.toISOString().slice(0, 16) + "Z";

  const projectShort = projectShortName(config);
  const projectFull = projectFullTitle(config);
  const projectLocSub = locationSubLabel(config);

  const sysRec = derivedResults.systemRecommendation;
  const recommendedSource = sysRec.secondarySource;
  const recommendedSourceLabel = localizeBackupSource(recommendedSource);
  const recommendedItem =
    derivedResults.costComparison.alternatives.find((item) => item.source === recommendedSource) ??
    derivedResults.costComparison.alternatives.find((item) => item.source === activeReserveSource) ??
    derivedResults.costComparison.alternatives[0] ??
    null;
  const tocRecommended = recommendedItem ? recommendedItem.totalOwnershipCost : 0;

  const annualSolarKWh = visibleAnnualTotals.annualSolarProductionKWh;
  const annualBalanceKWh = visibleAnnualTotals.annualEnergyBalanceKWh;
  const balancePositive = annualBalanceKWh >= 0;

  const backupKWh = backupAnnualEnergyKWh(sysRec, visibleAnnualTotals);

  const panelCount = typeof config.solar.panelCount === "number" ? config.solar.panelCount : 0;
  const panelPower = typeof config.solar.panelPowerWp === "number" ? config.solar.panelPowerWp : 0;
  const totalSolarWp = panelCount * panelPower;
  const solarKvValue = panelCount > 0 && panelPower > 0
    ? `${panelCount} \u00d7 ${formatNumber(panelPower, 0)} Wp = ${formatNumber(totalSolarWp, 0)} Wp`
    : "\u2014";

  const batteryAh = sysRec.batteryCapacityAh;
  const batteryV = typeof config.battery.nominalVoltage === "number" ? config.battery.nominalVoltage : 0;
  const batteryKWh = batteryAh > 0 && batteryV > 0 ? (batteryAh * batteryV) / 1000 : 0;
  const batteryChemistry = "LiFePO4";
  const batteryKvValue = batteryAh > 0 && batteryV > 0
    ? `${formatNumber(batteryAh, 0)} Ah · ${formatNumber(batteryKWh, 1)} kWh · ${formatNumber(batteryV, 1)} V ${batteryChemistry}`
    : batteryAh > 0
      ? `${formatNumber(batteryAh, 0)} Ah · ${batteryChemistry}`
      : "\u2014";
  const autonomyDays = sysRec.batteryAutonomyDays;
  const autonomyText = formatAutonomyDays(autonomyDays);

  const backupPowerW = sysRec.secondarySourcePowerW;
  const backupRowValue = recommendedSource === "NotComputed"
    ? "Ingen reservekilde"
    : backupPowerW > 0
      ? `${recommendedSourceLabel} ${formatNumber(backupPowerW, 0)} W`
      : recommendedSourceLabel;

  const frostProtectionText = deriveFrostProtection(sysRec.releaseArrangement) || "Ikke nødvendig";
  const bypassText = "Ikke relevant";
  const alarmText = deriveAlarmNotification(sysRec.operationsRequirements, sysRec.communication) || "Lokal logging uten alarm";

  const additionalReqs = recommendation.additionalRequirements.filter((r) => r && r.trim().length > 0);
  const operationsReqs = sysRec.operationsRequirements.filter((r) => r && r.trim().length > 0);
  const requirementListHtml = (items: string[]): string =>
    items.length === 0
      ? `<p class="body" style="color:var(--ink-3);font-size:11.5px;">Ingen krav registrert.</p>`
      : `<ul class="req-list">${items.map((it) => `<li>${esc(it)}</li>`).join("")}</ul>`;

  const monthLabels = ["Jan", "Feb", "Mar", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Des"];
  const niceMaxRaw = Math.max(
    ...visibleMonthlyEnergyBalance.map((r) => Math.max(r.solarProductionKWh, r.loadDemandKWh)),
    1
  );
  const niceMax = Math.ceil(niceMaxRaw / 50) * 50 || 50;
  const yAxisTicks = [0, niceMax * 0.25, niceMax * 0.5, niceMax * 0.75, niceMax]
    .map((v) => formatNumber(v, 0))
    .reverse();
  const monthBars = visibleMonthlyEnergyBalance
    .map((row, i) => monthBarPair(row, monthLabels[i] || `M${i + 1}`, niceMax))
    .join("\n      ");
  const appendixMonthBars = visibleMonthlyEnergyBalance
    .map((row) => appendixMonthStack(row, niceMax))
    .join("\n        ");
  const appendixYAxisTicks = [niceMax, niceMax * 0.75, niceMax * 0.5, niceMax * 0.25, 0]
    .map((value) => `<span>${formatNumber(value, 0)}</span>`)
    .join("");
  const appendixMonthLabels = monthLabels.map((label) => `<span>${esc(label.toLowerCase())}</span>`).join("");
  const appendixPanelSpec = `${panelCount > 0 ? `${formatNumber(panelCount, 0)} x ` : ""}${panelPower > 0 ? `${formatNumber(panelPower, 0)} Wp` : "Solcellepanel"}`;
  const appendixSecondarySpec = backupPowerW > 0 ? `${formatNumber(backupPowerW, 0)} W` : "";
  const appendixReasonItems = [
    {
      mark: "A1 · Instrumentering",
      title: sysRec.primaryMeasurement || "Målepunkt må fastsettes",
      text: sysRec.measurementEquipment || sysRec.controlMeasurement || "Måleutstyr og kontrollmåling fastsettes i detaljprosjektering."
    },
    {
      mark: "A2 · Strømforsyning",
      title: `Solcellepanel primært, ${recommendedSourceLabel.toLowerCase()} som sekundærkilde`,
      text: `Beregnet solcelleproduksjon er ${formatNumber(annualSolarKWh, 0)} kWh/år. Sekundærkilden dekker ${formatNumber(backupKWh, 0)} kWh/år fordelt på ${formatNumber(visibleAnnualTotals.annualSecondaryRuntimeHours, 0)} driftstimer.`
    },
    {
      mark: "A3 · Kommunikasjon",
      title: sysRec.communication || "Kommunikasjon må avklares",
      text: sysRec.loggerSetup || "Loggeroppsett og dataoverføring må dokumenteres før endelig innsending."
    }
  ];
  const appendixReasons = appendixReasonItems
    .map((item) => `<div class="appendix-reason"><div class="rmark">${esc(item.mark)}</div><h4>${esc(item.title)}</h4><p>${esc(item.text)}</p></div>`)
    .join("\n    ");
  const radioAnalysis = isRadioLinkAnalysis(config.cachedRadioAnalysis) ? config.cachedRadioAnalysis : null;
  const radioDistance = radioAnalysis ? `${formatNumber(radioAnalysis.terrainDistanceKm, 2)} km` : "Ikke beregnet";
  const radioLoss = radioAnalysis ? `${formatNumber(radioAnalysis.freeSpaceLossDb, 1)} dB` : "Ikke beregnet";
  const radioRain = radioAnalysis ? `${formatNumber(radioAnalysis.rainAttenuationDb, 1)} dB` : "Ikke beregnet";
  const radioClearance = radioAnalysis ? `${radioAnalysis.fresnelClearanceM >= 0 ? "+" : ""}${formatNumber(radioAnalysis.fresnelClearanceM, 1)} m Fresnel` : "Mangler terrengprofil";

  const tocMax = derivedResults.costComparison.alternatives.reduce(
    (m, it) => Math.max(m, it.totalOwnershipCost),
    0
  );
  const tocBars = derivedResults.costComparison.alternatives
    .map((item) => tocBarRow(item, tocMax, item.source === recommendedSource))
    .join("\n      ");
  const costRows = derivedResults.costComparison.alternatives
    .map((item) => costTableRow(item, item.source === recommendedSource))
    .join("\n        ");
  const appendixCostRows = derivedResults.costComparison.alternatives
    .map((item) =>
      appendixCostRow(
        item,
        item.source === "FuelCell" ? optionalNumber(config.fuelCell.powerW) : optionalNumber(config.diesel.powerW),
        item.source === recommendedSource
      )
    )
    .join("\n        ");

  const justifications = recommendation.justification.filter((j) => j && j.trim().length > 0);
  const aiFields = normalizeAiReportFields(aiRecommendationText);
  const leadSummary = aiFields?.recommendationNote || justifications[0] || "Anbefalingen er basert p\u00e5 oppgitte prosjektsvar, m\u00e5leprofil og energibehov.";
  const reasonBlocks = justifications
    .slice(0, aiFields ? 4 : 6)
    .map((text, i) => reasonBlock(`A${i + 1}`, text))
    .filter(Boolean)
    .join("\n  ");

  const aiUnderbygningHtml = typeof aiRecommendationText === "string" && aiRecommendationText
    ? `<div class="reason"><div class="marker">KI</div><div>${renderAiRecommendationText(aiRecommendationText)}</div></div>`
    : aiFields?.evidenceNote
      ? `<div class="reason"><div class="marker">KI</div><div><h4>Faglig grunnlag</h4><p>${esc(aiFields.evidenceNote)}</p></div></div>`
    : "";

  const watermarkSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="185 106 350 396.5" preserveAspectRatio="none">
    <g fill="#2563eb">
      <path d="M399.37,106.08l-29.52-.03c-40.3,69.13-52.96,148.42-8.85,217.9,12.84,20.22,27.85,37.46,44.12,55.08l53.21,57.61c18.04,19.54,31.42,41.37,42.71,65.42l33.02.11c-3.66-7.2-8.74-16.83-15.21-27.97-5.92-10.19-11.99-20.64-21.08-33.37-5.89-8.24-14.04-18.83-24.72-30.5l-41.6-44.53c-15.36-16.44-29.76-32.28-42.59-50.75-24.88-35.81-33.95-78.23-25.87-121.31,5.77-31.61,18.74-59.22,36.39-87.65Z"/>
      <path d="M320.4,106.06c-41.51,76.35-52.9,158.38-9.04,235.98,32.17,56.91,77.87,98.9,103.4,159.95l30.43.3c-10.13-26.71-22.48-51.16-39.19-73.96l-37.65-51.37c-12.29-16.76-23.6-32.77-33.66-50.99-21.54-39.02-28.1-82.44-19.15-126.4,6.41-33.1,19.5-62.65,36.88-93.52h-32.01Z"/>
      <path d="M270.54,106.06c-39.02,85.2-50.77,169.12-10.32,255.62,22.84,48.83,51.51,90.18,69.91,140.49l29.49-.12c-9.77-30.45-24.24-58.08-39.37-86.58l-32.39-61.03c-41.53-85.36-26.23-165.08,13.68-248.38h-31Z"/>
      <path d="M213.87,106.06c-28.21,87.31-41.36,164.46-16.12,253.62,13.87,49,33.74,93.67,47.41,142.48l29.02-.02c-8.17-29.89-17.2-56.66-27.6-84.69-8.52-23.61-16.53-46.02-23.09-70.31-22.79-84.46-7.13-159.28,20.12-241.07h-29.73Z"/>
    </g>
  </svg>`;

  const markSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="185 105 350 400">
    <defs><linearGradient id="hg-mark-grad" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#3b82f6"/><stop offset="100%" stop-color="#1d4ed8"/></linearGradient></defs>
    <g fill="url(#hg-mark-grad)">
      <path d="M399.37,106.08l-29.52-.03c-40.3,69.13-52.96,148.42-8.85,217.9,12.84,20.22,27.85,37.46,44.12,55.08l53.21,57.61c18.04,19.54,31.42,41.37,42.71,65.42l33.02.11c-3.66-7.2-8.74-16.83-15.21-27.97-5.92-10.19-11.99-20.64-21.08-33.37-5.89-8.24-14.04-18.83-24.72-30.5l-41.6-44.53c-15.36-16.44-29.76-32.28-42.59-50.75-24.88-35.81-33.95-78.23-25.87-121.31,5.77-31.61,18.74-59.22,36.39-87.65Z"/>
      <path d="M320.4,106.06c-41.51,76.35-52.9,158.38-9.04,235.98,32.17,56.91,77.87,98.9,103.4,159.95l30.43.3c-10.13-26.71-22.48-51.16-39.19-73.96l-37.65-51.37c-12.29-16.76-23.6-32.77-33.66-50.99-21.54-39.02-28.1-82.44-19.15-126.4,6.41-33.1,19.5-62.65,36.88-93.52h-32.01Z"/>
      <path d="M270.54,106.06c-39.02,85.2-50.77,169.12-10.32,255.62,22.84,48.83,51.51,90.18,69.91,140.49l29.49-.12c-9.77-30.45-24.24-58.08-39.37-86.58l-32.39-61.03c-41.53-85.36-26.23-165.08,13.68-248.38h-31Z"/>
      <path d="M213.87,106.06c-28.21,87.31-41.36,164.46-16.12,253.62,13.87,49,33.74,93.67,47.41,142.48l29.02-.02c-8.17-29.89-17.2-56.66-27.6-84.69-8.52-23.61-16.53-46.02-23.09-70.31-22.79-84.46-7.13-159.28,20.12-241.07h-29.73Z"/>
    </g>
  </svg>`;

  return `<!DOCTYPE html>
<html lang="nb">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>HydroGuide \u2013 Rapport: ${esc(projectFull)}</title>
<style>
  :root{
    --slate-100:#f1f5f9; --slate-200:#e2e8f0; --slate-300:#cbd5e1; --slate-500:#64748b; --slate-700:#334155; --slate-950:#020617;
    --brand-50:#eff6ff; --brand-500:#3b82f6; --brand-600:#2563eb; --brand-700:#1d4ed8; --brand-800:#1e40af;
    --emerald-100:#d1fae5; --emerald-700:#047857;
    --rose-50:#fff1f2; --rose-700:#be123c;
    --sky-500:#0ea5e9;
    --shadow-soft:0 1px 2px rgba(15,23,42,.06), 0 1px 0 rgba(15,23,42,.04);
    --font-mono:"JetBrains Mono","SF Mono",ui-monospace,Menlo,Consolas,monospace;
    --ink: var(--slate-950);
    --ink-2: var(--slate-700);
    --ink-3: var(--slate-500);
    --hairline: var(--slate-200);
    --hairline-2: var(--slate-300);
    --tint: var(--brand-50);
    --tint-2: #f5f9ff;
    --brand: var(--brand-600);
    --brand-deep: var(--brand-800);
    --good: var(--emerald-700);
    --good-soft: var(--emerald-100);
    --bad: var(--rose-700);
    --bad-soft: var(--rose-50);
    --page-w: 210mm;
    --page-h: 297mm;
    --page-pad-x: 18mm;
    --page-pad-y: 16mm;
  }
  /*
    HydroGuide report design contract
    - The generated report is two fixed A4 pages; later pages stay hidden in this preview/export.
    - The layout is locked. Do not move sections between pages or reorder the established blocks.
    - Cover placement is fixed: top-left logo, top-right HG id/date, centered title block, KPI row below intro, dark recommendation band below KPI row, footer at bottom.
    - The cover is the only hero-style page. Do not reuse cover cards, tint panels or large boxed sections on page 2.
    - Page 2 placement is fixed: logo/id header, equipment package, three reason columns, energy balance, secondary-source table, radio link at the bottom, footer.
    - Energy balance placement is fixed above the secondary-source table; bars stay lowered inside the chart and close to month/legend labels.
    - Radio link placement is fixed as the lower A4 section and should use the remaining vertical space down toward the footer.
    - Page 2 uses flat sections: section rules, table grid lines and chart guides are allowed; outer pill/card boxes are not.
    - Default prose and data text is black. Muted gray is reserved for labels, metadata, units and other secondary context.
    - KPI labels on the cover use the blue brand accent, while KPI values remain black.
    - Energy balance on page 2 follows the variant reference chart style with dark labels.
    - The radio panel should fill the lower A4 area, and its footer text stays black.
  */
  *{box-sizing:border-box;margin:0;padding:0}
  html{font-size:14px;background:#eef2f7}
  body{
    font-family:"Manrope",system-ui,-apple-system,"Segoe UI",sans-serif;
    color:var(--ink);line-height:1.5;
    padding:24px 0 64px;
    -webkit-print-color-adjust:exact;print-color-adjust:exact;
    font-feature-settings:"ss01","cv11","tnum";
  }
  .page{
    position:relative;width:var(--page-w);min-height:var(--page-h);
    margin:0 auto 18px;background:#fff;
    box-shadow:0 1px 0 rgba(15,23,42,.04), 0 12px 32px -8px rgba(15,23,42,.16);
    border-radius:2px;overflow:hidden;
    padding:var(--page-pad-y) var(--page-pad-x);
    display:flex;flex-direction:column;
  }
  body > section.page:nth-of-type(n+3){display:none}

  .toolbar{
    position:sticky;top:12px;z-index:50;
    width:var(--page-w);max-width:calc(100% - 32px);
    margin:0 auto 18px;
    display:flex;align-items:center;justify-content:space-between;gap:12px;
    padding:10px 14px;background:rgba(255,255,255,.92);
    backdrop-filter:blur(8px);
    border:1px solid var(--hairline);
    box-shadow:var(--shadow-soft);font-size:13px;
  }
  .toolbar .brand{display:flex;align-items:center;gap:10px;color:var(--ink-2);font-weight:600}
  .toolbar .brand .toolbar-logo{width:118px;height:auto;display:block}
  .trace-line{font-size:11px;color:#050816;font-weight:700;letter-spacing:.02em;margin-left:8px}
  .toolbar button{
    font:inherit;font-weight:600;font-size:13px;
    padding:8px 14px;cursor:pointer;
    border:1px solid var(--brand);background:var(--brand);color:#fff;
  }
  .toolbar button:hover{background:var(--brand-500)}

  .eyebrow{font-size:10.5px;font-weight:600;letter-spacing:.18em;text-transform:uppercase;color:var(--ink-3);}
  .h-section{
    font-size:13px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;
    color:var(--ink);
    display:flex;align-items:baseline;gap:12px;
    padding-bottom:10px;margin-bottom:18px;
    border-bottom:1px solid var(--hairline);
  }
  .h-section .num{font-family:var(--font-mono);font-size:10.5px;color:var(--ink-3);letter-spacing:.16em;font-weight:600;}
  .h-card{font-size:13px;font-weight:700;letter-spacing:-.005em;color:var(--ink)}
  .body{font-size:12.5px;line-height:1.55;color:var(--ink)}
  .meta{font-size:10.5px;color:var(--ink-3);letter-spacing:.04em}
  .num{font-variant-numeric:tabular-nums}
  .lede{font-size:13px;color:var(--ink);line-height:1.6;max-width:165mm;margin-top:-4px;margin-bottom:16px;}

  .page-header{
    display:flex;align-items:center;justify-content:space-between;
    padding-bottom:10px;margin-bottom:20px;
    border-bottom:1px solid var(--hairline);
    font-size:11.5px;color:var(--ink-3);letter-spacing:.04em;
  }
  .page-header .left{display:flex;align-items:center;gap:9px;font-weight:600;color:var(--ink-2);letter-spacing:.02em}
  .page-header .left .header-mark{width:18px;height:18px;display:inline-block}
  .page-header .left .header-mark svg{width:100%;height:100%;display:block}
  .page-footer{
    margin-top:auto;padding-top:10px;
    border-top:1px solid var(--hairline);
    display:flex;justify-content:space-between;align-items:center;
    font-size:11px;color:var(--ink-3);letter-spacing:.04em;
  }
  .page-footer .pageno{font-weight:600;color:var(--ink-2)}
  .appendix .page-footer,.appendix .page-footer .pageno{color:var(--ink)}

  /* COVER */
  .cover{padding:0;display:block;border-radius:0;box-shadow:none}
  .cover-inner{
    width:100%;min-height:var(--page-h);
    display:grid;grid-template-rows:auto 1fr auto;
    padding:22mm var(--page-pad-x);
    background:#fff;
    position:relative;overflow:hidden;
  }
  .cover-watermark{position:absolute;top:0;bottom:0;right:-120mm;width:260mm;height:100%;transform:translateX(-16mm);opacity:.045;pointer-events:none;}
  .cover-watermark svg{width:100%;height:100%;display:block}
  .cover-edge{z-index:1}
  .cover-top.cover-edge{margin-left:-10mm;margin-right:-8mm}
  .cover-top{display:flex;align-items:center;justify-content:space-between;position:relative;transform:translateY(-18mm)}
  .cover-top .brand{display:flex;align-items:center;gap:14px}
  .cover-top .brand .mark{width:54px;height:54px;display:block;filter:drop-shadow(0 4px 14px rgba(37,99,235,.28))}
  .cover-top .brand .mark svg{width:100%;height:100%}
  .cover-top .brand .report-logo{width:205px;height:auto;display:block}
  .cover-top .brand-name{font-size:19px;font-weight:800;letter-spacing:-.02em;color:var(--ink);line-height:1.05;}
  .cover-top .brand-name small{display:block;font-size:11px;font-weight:600;letter-spacing:.18em;color:var(--brand-700);text-transform:uppercase;margin-top:4px;}
  .cover-top .doc-id{text-align:right;font-size:11.5px;color:#64748b;letter-spacing:.04em;}
  .cover-top .doc-id strong{display:block;color:#334155;font-weight:600;letter-spacing:.04em;font-size:12px}

  .cover-main{display:flex;flex-direction:column;justify-content:center;gap:24px;position:relative;z-index:1;}
  .cover-eyebrow{display:inline-flex;align-items:center;gap:10px;color:#2563eb;font-size:11px;font-weight:800;letter-spacing:.22em;text-transform:uppercase;width:fit-content;}
  .cover-eyebrow::before{content:"";width:24px;height:1px;background:#2563eb;}
  .cover-title{font-size:64px;font-weight:700;letter-spacing:-.035em;line-height:.98;color:var(--ink);max-width:165mm;}
  .cover-title em{font-style:normal;display:block;font-weight:650;line-height:1;letter-spacing:-.01em;color:#1d7ed8;}
  .cover-subtitle{font-size:18px;color:var(--ink);font-weight:400;line-height:1.45;max-width:140mm;}
  .cover-meta{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:0;border-top:1px solid #d8e0ea;border-bottom:1px solid #d8e0ea;padding:18px 0;}
  .cover-meta .item{padding:0 18px;border-left:1px solid #d8e0ea}
  .cover-meta .item:first-child{padding-left:0;border-left:0}
  .cover-meta .item .lbl{font-size:10.8px;font-weight:800;letter-spacing:.18em;text-transform:uppercase;color:var(--brand-700);margin-bottom:6px;}
  .cover-meta .item .val{font-size:16.5px;font-weight:700;color:var(--ink);letter-spacing:-.01em}
  .cover-meta .item .sub{font-size:12px;color:#64748b;font-weight:700;margin-top:2px}

  .cover-summary{display:block;margin-top:8px;}
  .cover-summary .recomm{
    background:linear-gradient(160deg, #0b2c5a 0%, #0a1f3d 100%);
    color:#fff;padding:22px 26px;
    box-shadow:0 12px 32px -16px rgba(11,44,90,.6);
    border:0;
    display:grid;grid-template-columns:1.5fr 1fr;gap:28px;align-items:center;
  }
  .cover-summary .recomm .eyebrow{color:#7fb6ff;letter-spacing:.22em;font-weight:800;text-transform:uppercase;font-size:11px}
  .cover-summary .recomm h3{font-size:22px;font-weight:650;letter-spacing:-.012em;line-height:1.2;margin-top:8px;}
  .cover-summary .recomm .stats{display:grid;grid-template-columns:1fr 1fr;gap:18px 22px;border-left:1px solid rgba(255,255,255,.14);padding-left:24px;}
  .cover-summary .recomm .stat .k{font-size:10px;font-weight:800;letter-spacing:.18em;text-transform:uppercase;color:rgba(255,255,255,.62);}
  .cover-summary .recomm .stat .v{display:block;color:#fff;font-weight:700;font-size:15px;letter-spacing:0;margin-top:4px;white-space:nowrap;}

  .cover-bottom{position:absolute;left:10mm;right:10mm;bottom:5mm;display:flex;justify-content:space-between;align-items:flex-end;gap:24mm;color:#64748b;font-size:11.5px;letter-spacing:.04em;}
  .cover-bottom .disclaimer{max-width:116mm;line-height:1.5;text-align:left}
  .cover-bottom .stamp{font-family:var(--font-mono);font-size:11px;color:#64748b;min-width:52mm;text-align:right;letter-spacing:.06em;}

  /* Cards */
  .grid-2{display:grid;grid-template-columns:1fr 1fr;gap:14px}
  .grid-3{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}
  .grid-4{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}
  .card{background:transparent;padding:0;border:0;}
  .card .card-head{display:flex;align-items:baseline;justify-content:space-between;gap:10px;margin-bottom:12px;padding-bottom:8px;border-bottom:1px solid var(--hairline);}
  .card .card-head .tag{font-size:10px;font-weight:700;letter-spacing:.18em;text-transform:uppercase;color:var(--ink-3);}
  .card .card-head .h-card{font-size:13px;font-weight:700;color:var(--ink);letter-spacing:-.005em}
  .kv-list{display:flex;flex-direction:column}
  .kv-list .kv{display:flex;justify-content:space-between;align-items:baseline;gap:14px;padding:7px 0;border-top:1px dashed var(--hairline);font-size:12px;}
  .kv-list .kv:first-child{border-top:0}
  .kv-list .kv .k{color:var(--ink-3);font-weight:500}
  .kv-list .kv .v{color:var(--ink);font-weight:600;text-align:right}
  .setup-grid{margin-top:28px;gap:22px}
  .setup-grid .card .card-head{margin-bottom:15px;padding-bottom:10px}
  .setup-grid .kv-list .kv{padding:9px 0}

  .metric{border:0;padding:4px 18px 4px 0;background:transparent;display:flex;flex-direction:column;gap:6px;border-right:1px solid var(--hairline);}
  .metric:last-child{border-right:0;padding-right:0}
  .grid-4 .metric{padding:4px 16px}
  .metric .lbl{font-size:10px;font-weight:600;letter-spacing:.18em;text-transform:uppercase;color:var(--ink-3);}
  .metric .val{font-size:26px;font-weight:800;letter-spacing:-.03em;color:var(--ink);line-height:1;}
  .metric .val .unit{font-size:13px;font-weight:600;color:var(--ink-3);margin-left:4px;letter-spacing:0}
  .metric .sub{font-size:11px;color:var(--ink-3)}
  .metric.brand .val{color:var(--brand-deep)}
  .metric.dark .val{color:var(--ink)}
  .metric.dark .lbl{color:var(--ink-3)}
  .metric.dark .val .unit{color:var(--ink-3)}
  .metric.dark .sub{color:var(--ink-3)}
  .delta{display:inline-flex;align-items:center;gap:4px;font-size:10.5px;font-weight:700;letter-spacing:.04em;}
  .delta.up{color:var(--good)}
  .delta.up::before{content:"\u25b2";font-size:9px}
  .delta.down{color:var(--bad)}
  .delta.down::before{content:"\u25bc";font-size:9px}

  /* Tables */
  table.data{width:100%;border-collapse:collapse;font-size:11.5px;font-variant-numeric:tabular-nums}
  table.data thead th{text-align:left;padding:9px 0 9px 12px;font-size:9.5px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:var(--ink-3);background:transparent;border-bottom:1px solid var(--ink);}
  table.data thead th:first-child{padding-left:0}
  table.data thead th.num,table.data tbody td.num{text-align:right}
  table.data tbody td{padding:9px 12px 9px 12px;border-bottom:1px solid var(--hairline);color:var(--ink)}
  table.data tbody td:first-child{padding-left:0}
  table.data tbody tr:last-child td{border-bottom:0}
  table.data tbody tr.recommended{background:transparent}
  table.data tbody tr.recommended td{color:var(--ink);font-weight:700}
  table.data tbody tr.recommended td:first-child{position:relative;padding-left:14px}
  table.data tbody tr.recommended td:first-child::before{content:"";position:absolute;left:0;top:50%;transform:translateY(-50%);width:3px;height:18px;background:var(--brand);}

  /* Bar chart */
  .chart{border:0;padding:0;background:transparent}
  .chart-head{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:14px;gap:14px}
  .chart-legend{display:flex;gap:14px;font-size:10.5px;color:var(--ink)}
  .chart-legend .swatch{display:inline-flex;align-items:center;gap:6px}
  .chart-legend .swatch::before{content:"";width:10px;height:10px;border-radius:2px}
  .swatch.solar::before{background:var(--brand)}
  .swatch.load::before{background:#cdd9ec}
  .bars{position:relative;display:grid;grid-template-columns:repeat(12,1fr);gap:6px;height:160px;padding:0 0 28px 36px;border-bottom:1px solid var(--hairline-2);}
  .bars .y-axis{position:absolute;left:0;top:0;bottom:28px;width:32px;display:flex;flex-direction:column-reverse;justify-content:space-between;font-size:9.5px;color:var(--ink-3);}
  .bars .y-axis span{position:relative;line-height:1}
  .bars .y-axis span::after{content:"";position:absolute;left:34px;right:-100vw;top:50%;border-top:1px dashed #eef2f7;}
  .bars .col{position:relative;display:flex;flex-direction:column;justify-content:flex-end;align-items:center}
  .bars .col .pair{position:relative;width:100%;height:100%;display:flex;align-items:flex-end;justify-content:center;gap:3px}
  .bars .col .bar{width:42%;border-radius:3px 3px 0 0;background:var(--brand)}
  .bars .col .bar.load{background:#cdd9ec}
  .bars .col .label{position:absolute;bottom:-22px;left:0;right:0;text-align:center;font-size:10px;color:var(--ink-3);letter-spacing:.04em}

  /* Reco hero */
  .reco-hero{display:grid;grid-template-columns:1.5fr 1fr;gap:36px;background:transparent;}
  .reco-hero .left{display:flex;flex-direction:column;gap:14px;}
  .reco-hero .left .eyebrow{color:var(--brand-700);display:inline-flex;align-items:center;gap:10px;font-weight:700;letter-spacing:.22em;font-size:11px;text-transform:uppercase;}
  .reco-hero .left .eyebrow::before{content:"";width:24px;height:1px;background:var(--brand)}
  .reco-hero .left h2{font-size:26px;font-weight:800;letter-spacing:-.03em;line-height:1.15;color:var(--ink)}
  .reco-hero .left p.summary{font-size:12.5px;color:var(--ink);line-height:1.6;max-width:120mm}
  .reco-hero .left .status-line{display:flex;align-items:center;gap:10px;padding-top:10px;border-top:1px solid var(--hairline);font-size:11.5px;color:var(--ink);font-weight:600;letter-spacing:.02em;}
  .reco-hero .left .status-line strong{color:var(--good);font-weight:700}
  .reco-hero .left .status-line .sep{color:var(--ink-3);font-weight:400}
  .reco-hero .right{display:flex;flex-direction:column;gap:0;border-left:1px solid var(--hairline);padding-left:28px;}
  .reco-hero .right .eyebrow{color:var(--brand-700);font-weight:700;letter-spacing:.22em;text-transform:uppercase;font-size:11px;display:inline-flex;align-items:center;gap:10px;margin-bottom:6px;}
  .reco-hero .right .eyebrow::before{content:"";width:24px;height:1px;background:var(--brand)}
  .reco-hero .right .row{display:flex;justify-content:space-between;align-items:baseline;gap:12px;padding:9px 0;border-top:1px solid var(--hairline);font-size:12px;}
  .reco-hero .right .row:first-of-type{border-top:0}
  .reco-hero .right .row .k{color:var(--ink-3)}
  .reco-hero .right .row .v{color:var(--ink);font-weight:700;text-align:right}

  /* TOC bars */
  .toc-bars{display:flex;flex-direction:column;gap:14px;margin-top:14px}
  .toc-bars .row{display:grid;grid-template-columns:140px 1fr 110px;gap:14px;align-items:center;font-size:11.5px}
  .toc-bars .row .name{color:var(--ink);font-weight:700;letter-spacing:-.005em}
  .toc-bars .row .val{text-align:right;font-weight:700;color:var(--ink);font-variant-numeric:tabular-nums}
  .toc-bars .track{height:8px;background:var(--slate-100);overflow:hidden;position:relative}
  .toc-bars .fill{height:100%;background:var(--brand)}
  .toc-bars .row.recommended .fill{background:linear-gradient(90deg,var(--brand-700),var(--brand-500))}
  .toc-bars .row.alt .name{color:var(--ink-3);font-weight:600}
  .toc-bars .row.alt .val{color:var(--ink-3);font-weight:600}
  .toc-bars .row.alt .fill{background:#cdd9ec}

  /* Reasoning */
  .reason{padding:14px 0 14px 18px;background:#fff;display:grid;grid-template-columns:auto 1fr;gap:18px;align-items:flex-start;border-top:1px solid var(--hairline);position:relative;}
  .reason::before{content:"";position:absolute;left:0;top:14px;bottom:14px;width:2px;background:var(--brand);}
  .reason:first-of-type{border-top:0}
  .reason .marker{font-family:var(--font-mono);color:var(--brand-700);font-size:10.5px;font-weight:700;letter-spacing:.16em;padding-top:2px;}
  .reason h4{font-size:13px;font-weight:700;color:var(--ink);margin-bottom:4px;letter-spacing:-.005em}
  .reason p{font-size:11.5px;color:var(--ink);line-height:1.6;max-width:155mm}
  .reason p + p{margin-top:0.5rem;}
  .ai-note{font-size:11px;line-height:1.55;color:var(--ink);margin-top:9px;padding-top:8px;border-top:1px dashed var(--hairline);}
  .req-list{list-style:none;padding:0;margin:0;display:flex;flex-direction:column}
  .req-list li{position:relative;padding:7px 0 7px 16px;font-size:11.5px;line-height:1.55;color:var(--ink);border-top:1px dashed var(--hairline);}
  .req-list li:first-child{border-top:0}
  .req-list li::before{content:"";position:absolute;left:0;top:14px;width:6px;height:1px;background:var(--brand);}

  /* Decision appendix */
  .appendix{--appendix-pad:12mm;--ink:#050816;--ink-2:#050816;--ink-3:#050816;--muted:#050816;--line:var(--hairline);--brand-dk:var(--brand-deep);padding:var(--appendix-pad);gap:8px;font-family:Arial,sans-serif;font-size:12px;line-height:1.45;height:var(--page-h)}
  .appendix,.appendix *{font-family:Arial,sans-serif;font-style:normal;opacity:1;text-shadow:none}
  .appendix svg,.appendix svg text{font-family:Arial,sans-serif}
  .appendix-top{display:flex;align-items:center;justify-content:space-between;padding-bottom:7px;border-bottom:1px solid var(--hairline);flex:none}
  .appendix-top .brand{display:flex;align-items:center;gap:10px}
  .appendix-top .brand .report-logo{width:124px;height:auto;display:block}
  .appendix-meta{font-size:9.5px;color:var(--ink-3);letter-spacing:.08em;text-transform:uppercase;font-weight:700;text-align:right;line-height:1.35}
  .appendix-meta b{color:var(--ink);font-weight:800}
  .up-card{display:grid;grid-template-columns:minmax(0,1.35fr) 1fr;gap:18px;margin-top:8px;border:0;border-top:1px solid var(--hairline);border-bottom:1px solid var(--hairline);background:transparent;position:relative;padding:10px 0 9px;flex:none}
  .up-card::before{content:"";position:absolute;left:0;top:12px;bottom:12px;width:3px;background:var(--brand-700)}
  .up-main{padding-left:10px;min-width:0;display:flex;flex-direction:column}
  .up-eyebrow{display:flex;align-items:center;gap:8px;font-size:10px;letter-spacing:.22em;text-transform:uppercase;color:var(--brand-700);font-weight:800;margin-bottom:7px}
  .up-eyebrow::before{content:"";width:20px;height:1px;background:var(--brand-700)}
  .up-main h3{margin:0 0 5px;font-size:16px;line-height:1.08;letter-spacing:-.03em;font-weight:800;color:var(--ink);max-width:18em}
  .up-main p{margin:0;font-size:12.5px;line-height:1.4;color:var(--ink);font-weight:700;max-width:42em}
  .up-tech{border-left:1px solid var(--hairline);padding-left:14px;display:flex;align-items:stretch}
  .up-table{width:100%;border-collapse:collapse;table-layout:fixed;font-variant-numeric:tabular-nums}
  .up-table th,.up-table td{padding:5px 0;border-bottom:1px solid var(--hairline);vertical-align:top}
  .up-table tr:last-child th,.up-table tr:last-child td{border-bottom:0}
  .up-table th{width:42%;text-align:left;font-size:9px;letter-spacing:.18em;text-transform:uppercase;color:var(--ink-3);font-weight:800;white-space:nowrap}
  .up-table td{text-align:right;color:var(--ink);font-weight:800;font-size:12.5px;letter-spacing:-.015em;line-height:1.05}
  .up-table td small{display:block;margin-top:2px;font-size:10px;color:var(--ink-3);font-weight:700;letter-spacing:0}
  .appendix-reasons{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:7px;flex:none}
  .appendix-reason{border-left:2px solid var(--brand);padding:8px 10px;background:#fcfdff}
  .appendix-reason .rmark{font-size:10px;letter-spacing:.1em;color:var(--brand);font-weight:800;margin-bottom:4px}
  .appendix-reason h4{margin:0 0 4px;font-size:13px;line-height:1.15;letter-spacing:-.015em;font-weight:800;color:var(--ink)}
  .appendix-reason p{margin:0;color:var(--ink);font-size:12px;line-height:1.3;font-weight:700}
  .v6-block-title,.v6-rowtitle{display:flex;justify-content:space-between;align-items:baseline;margin:8px 0 5px;border-bottom:1px solid var(--hairline);padding-bottom:4px}
  .v6-block-title b,.v6-rowtitle b{font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:var(--ink)}
  .v6-block-title span,.v6-rowtitle span{font-size:10px;color:var(--ink-3);font-weight:800;letter-spacing:.08em;text-transform:uppercase}
  .energy-panel .v6-eb2{height:50mm;display:flex;flex-direction:column}
  .v6-eb2{border:0;background:transparent;padding:9px 0 8px;flex:none}
  .v6-stack{height:100%;min-height:142px;flex:1 1 auto;display:grid;grid-template-columns:repeat(12,1fr);gap:5px;align-items:end;border-bottom:1px solid var(--hairline-2);padding:16px 0 0}
  .v6-stack .col{height:100%;display:flex;flex-direction:column-reverse;justify-content:flex-start;background:#f8fafc;border-left:1px solid #f1f5f9;border-right:1px solid #f1f5f9}
  .v6-stack .seg{width:100%}
  .v6-stack .s1{background:var(--brand)}
  .v6-stack .s2{background:#93b3f5}
  .v6-stack .s3{background:var(--secondary-source-color,#475569)}
  .v6-stack-labels{display:grid;grid-template-columns:repeat(12,1fr);gap:5px;margin-top:4px;font-size:8.5px;color:var(--ink);font-weight:800;text-transform:uppercase;text-align:center}
  .eb-foot{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:8px;flex:none}
  .ef{display:grid;grid-template-columns:auto 1fr auto;align-items:baseline;gap:6px;padding:5px 0 0}
  .ef i{width:8px;height:8px;display:block}
  .ef .k{font-size:9px;letter-spacing:.12em;text-transform:uppercase;font-weight:800;color:var(--ink)}
  .ef .v{font-size:13px;font-weight:800;color:var(--ink);white-space:nowrap}
  .ef .v small{font-size:9px;color:var(--ink);margin-left:3px}
  .v6-compare{width:100%;border-collapse:collapse;table-layout:fixed;font-size:12px;border:0;border-top:1px solid var(--hairline);border-bottom:1px solid var(--hairline)}
  .v6-compare th:nth-child(1){width:16.5%}
  .v6-compare th:nth-child(2){width:9.5%}
  .v6-compare th:nth-child(3){width:11%}
  .v6-compare th:nth-child(4){width:11%}
  .v6-compare th:nth-child(5){width:10%}
  .v6-compare th:nth-child(6){width:10%}
  .v6-compare th:nth-child(7){width:10.5%}
  .v6-compare th:nth-child(8){width:10.5%}
  .v6-compare th:nth-child(9){width:11%}
  .v6-compare th{background:transparent;color:var(--ink);font-size:9px;font-weight:900;letter-spacing:.04em;text-transform:uppercase;text-align:right;padding:6px 4px;border-bottom:1px solid var(--hairline);border-left:1px solid var(--hairline)}
  .v6-compare th.rowhead,.v6-compare td.rowhead{text-align:left}
  .v6-compare td{padding:7px 4px;text-align:right;border-left:1px solid var(--hairline);border-bottom:1px solid var(--hairline);font-weight:800;color:var(--ink);white-space:nowrap}
  .v6-compare td.rowhead{overflow:hidden;text-overflow:ellipsis}
  .v6-compare td small{display:inline;font-size:8.5px;color:var(--ink);font-weight:800;margin-left:2px}
  .v6-compare tr.rec td:first-child{box-shadow:none}
  .radio-panel{flex:1 1 auto;min-height:0;display:flex;flex-direction:column}
  .radio-panel .v6-radio-box{height:auto;flex:1 1 auto;min-height:0}
  .v6-radio-box{border:0;background:transparent;padding:0;display:flex;flex-direction:column;gap:8px}
  .v6-terrain-mini{height:auto;min-height:148px;flex:1 1 auto;border-bottom:1px solid var(--hairline);padding-bottom:6px}
  .v6-terrain-mini svg{width:100%;height:100%;display:block}
  .v6-radio-data{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}
  .v6-radio-data div{display:flex;flex-direction:column;gap:2px;border-left:1px solid var(--hairline);padding-left:8px}
  .v6-radio-data div:first-child{border-left:0;padding-left:0}
  .v6-radio-data .k{font-size:9.5px;letter-spacing:.12em;text-transform:uppercase;font-weight:800;color:var(--ink)}
  .v6-radio-data .v{font-size:12.5px;font-weight:800;color:var(--ink);text-align:left}
  .appendix .flex-spacer{display:none}

  .appendix .up-tech{border-left:1px solid var(--line);padding-left:12px;display:flex;flex-direction:column}
  .appendix .up-row{display:flex;align-items:baseline;gap:8px;padding:5px 0;border-bottom:1px solid var(--line);line-height:1.25;min-height:22px}
  .appendix .up-row:first-child{padding-top:1px}
  .appendix .up-row:last-child{border-bottom:0;padding-bottom:1px}
  .appendix .up-row::before{content:"";flex:1 1 auto;order:2;align-self:end;margin-bottom:3px;border-bottom:1px dotted var(--line);min-width:18px}
  .appendix .up-row .k{order:1;flex:0 0 auto;font-size:11px;letter-spacing:0;text-transform:none;color:var(--ink);font-weight:700}
  .appendix .up-row .v{order:3;flex:0 0 auto;text-align:right;color:var(--ink);font-weight:700;font-size:11px;letter-spacing:-.015em;line-height:1;display:flex;flex-direction:column;align-items:flex-end;gap:2px;white-space:nowrap}
  .appendix .up-row .v small{font-size:8.5px;color:var(--muted);font-weight:700;margin-left:2px;letter-spacing:0;white-space:nowrap}
  .appendix .up-row .v .sub{font-size:8px;color:var(--ink-2);font-weight:400;letter-spacing:-.005em;white-space:nowrap}
  .appendix .v6-eb2{border:1px solid var(--line);border-radius:4px;background:#fff;padding:10px 12px 4px;display:flex;flex-direction:column;gap:0;flex:1 1 auto;font-variant-numeric:tabular-nums}
  .appendix .v6-stack{position:relative;display:grid;grid-template-columns:repeat(12,1fr);gap:5px;height:130px;min-height:130px;align-items:end;padding:6px 4px 0 26px;border-bottom:0;background-image:repeating-linear-gradient(to right,#cbd5e1 0 5px,transparent 5px 10px),repeating-linear-gradient(to right,#cbd5e1 0 5px,transparent 5px 10px),repeating-linear-gradient(to right,#cbd5e1 0 5px,transparent 5px 10px),repeating-linear-gradient(to right,#cbd5e1 0 5px,transparent 5px 10px),repeating-linear-gradient(to right,#cbd5e1 0 5px,transparent 5px 10px);background-size:calc(100% - 34px) 1px;background-repeat:no-repeat;background-position:34px 6px,34px 37px,34px 68px,34px 99px,34px 100%}
  .appendix .v6-stack::before{content:"";position:absolute;left:26px;right:0;bottom:0;border-bottom:1px solid var(--ink-2)}
  .appendix .v6-stack .yax{position:absolute;left:0;top:0;bottom:0;width:22px;pointer-events:none;font-variant-numeric:tabular-nums}
  .appendix .v6-stack .yax span{position:absolute;right:2px;font-size:7.8px;color:var(--ink);letter-spacing:.06em;text-transform:uppercase;transform:translateY(-50%);font-weight:400}
  .appendix .v6-stack .yax span:nth-child(1){top:6px}
  .appendix .v6-stack .yax span:nth-child(2){top:37px}
  .appendix .v6-stack .yax span:nth-child(3){top:68px}
  .appendix .v6-stack .yax span:nth-child(4){top:99px}
  .appendix .v6-stack .yax span:nth-child(5){top:100%}
  .appendix .v6-stack .col{position:relative;z-index:1;display:flex;flex-direction:column-reverse;gap:1px;height:100%;justify-content:flex-start;background:transparent;border:0}
  .appendix .v6-stack .seg{width:100%}
  .appendix .v6-stack .s1{background:var(--brand)}
  .appendix .v6-stack .s2{background:#93b3f5}
  .appendix .v6-stack .s3{background:#cbd5e1}
  .appendix .v6-stack-labels{display:grid;grid-template-columns:repeat(12,1fr);gap:5px;font-size:7.8px;font-weight:700;color:var(--muted);letter-spacing:.06em;text-transform:uppercase;margin:4px 4px 0;text-align:center}
  .appendix .v6-stack-labels span{line-height:1.2}
  .appendix .eb-foot{display:grid;grid-template-columns:repeat(3,1fr);gap:0;margin-top:10px;border-top:0;background:#fff;flex:none}
  .appendix .eb-foot .ef{padding:4px 12px 2px;border-right:1px solid var(--line);display:flex;align-items:baseline;gap:10px;min-height:28px;line-height:1.25}
  .appendix .eb-foot .ef:first-child{padding-left:4px}
  .appendix .eb-foot .ef:last-child{border-right:0;padding-right:4px}
  .appendix .eb-foot .ef i{display:inline-block;width:9px;height:9px;border-radius:2px;flex-shrink:0;align-self:center}
  .appendix .eb-foot .ef .k{font-size:7.3px;letter-spacing:.16em;text-transform:uppercase;color:var(--muted);font-weight:700}
  .appendix .eb-foot .ef .v{margin-left:auto;font-size:14px;font-weight:700;letter-spacing:-.025em;line-height:1;color:var(--ink);white-space:nowrap}
  .appendix .eb-foot .ef .v small{font-size:9px;color:var(--muted);font-weight:700;margin-left:2px;letter-spacing:0}
  .appendix .v6-compare{width:100%;border-collapse:collapse;border:1px solid var(--line);border-radius:4px;overflow:hidden;background:#fff;font-variant-numeric:tabular-nums;table-layout:fixed;font-size:11px}
  .appendix .v6-compare th,.appendix .v6-compare td{padding:8px 9px;border-right:1px solid var(--line);border-bottom:1px solid var(--line);text-align:right;font-size:11px;font-weight:700;color:var(--ink);white-space:nowrap;min-height:26px;line-height:1.25}
  .appendix .v6-compare th:last-child,.appendix .v6-compare td:last-child{border-right:0}
  .appendix .v6-compare tr:last-child td{border-bottom:0}
  .appendix .v6-compare thead th{font-size:9.5px;letter-spacing:.04em;text-transform:none;color:var(--muted);font-weight:700;background:#fff;border-bottom:1px solid var(--ink);padding:7px 9px}
  .appendix .v6-compare th.rowhead,.appendix .v6-compare td.rowhead{text-align:left;font-size:10px;font-weight:700;letter-spacing:-.005em;background:#fff;width:38mm}
  .appendix .v6-compare thead th.rowhead{font-size:9.5px;letter-spacing:.04em;text-transform:none;color:var(--muted);font-weight:700}
  .appendix .v6-compare td small{display:inline;font-size:8.5px;font-weight:700;color:var(--ink);margin-left:2px;letter-spacing:0}
  .appendix .v6-compare tr.rec td:first-child{box-shadow:none}
  .appendix .appendix-meta,.appendix .appendix-meta b,.appendix .up-eyebrow,.appendix .up-main h3,.appendix .appendix-reason .rmark,.appendix .appendix-reason h4,.appendix .v6-block-title b,.appendix .v6-block-title span,.appendix .v6-rowtitle b,.appendix .v6-rowtitle span,.appendix .v6-radio-data .k,.appendix .v6-radio-data .v,.appendix-footer{font-weight:700;color:var(--ink)}

  @page{size:A4;margin:0}
  @media print{
    html,body{background:#fff}
    body{padding:0}
    .toolbar{display:none}
    .page{width:210mm;min-height:297mm;height:297mm;box-shadow:none;border-radius:0;margin:0;page-break-after:always;break-after:page;}
    .page:last-of-type{page-break-after:auto;break-after:auto}
  }
</style>
</head>
<body>

<div class="toolbar">
  <div class="brand">
    <img class="toolbar-logo" src="/hydroguide-logo-black.svg" alt="HydroGuide" />
    <span>Rapport \u00b7 ${esc(projectFull)}</span>
    <span class="trace-line">Sist sporing: ${esc(docId)}</span>
  </div>
  <button onclick="window.print()">Last ned PDF</button>
</div>

<section class="page cover">
  <div class="cover-inner">
    <div class="cover-watermark" aria-hidden="true">${watermarkSvg}</div>

    <div class="cover-top cover-edge">
      <div class="brand">
        <img class="report-logo" src="/hydroguide-logo-black.svg" alt="HydroGuide" />
      </div>
      <div class="doc-id">
        <strong>${esc(docId)}</strong>
        ${esc(todayLong)}
      </div>
    </div>

    <div class="cover-main">
      <span class="cover-eyebrow">Analyse og anbefaling \u00b7 Sm\u00e5kraft</span>
      <h1 class="cover-title">
        ${esc(projectFull)}<br/>
        <em>minstevannf\u00f8ring</em>
      </h1>
      <p class="cover-subtitle">
        Rapport for ${esc(projectFull)} om instrumentering, str\u00f8mforsyning og
        kommunikasjon ved avsidesliggende inntak. Resultatene er basert p\u00e5
        oppgitte svar og skal alltid verifiseres av fagkyndig personell f\u00f8r
        \u00f8konomiske eller andre beslutninger tas.
      </p>

            <div class="cover-meta">
        <div class="item">
          <div class="lbl">Prosjekt</div>
          <div class="val">${esc(projectShort)}</div>
          <div class="sub">${esc(projectLocSub || "\u2014")}</div>
        </div>
        <div class="item">
          <div class="lbl">Primærkilde</div>
          <div class="val">Solcellepanel</div>
          <div class="sub">${formatNumber(annualSolarKWh, 0)} kWh/år</div>
        </div>
        <div class="item">
          <div class="lbl">Sekundærkilde</div>
          <div class="val">${esc(recommendedSourceLabel)}</div>
          <div class="sub">${formatNumber(backupKWh, 0)} kWh/år</div>
        </div>
        <div class="item">
          <div class="lbl">Forventet autonomi</div>
          <div class="val">${esc(autonomyText)}</div>
          <div class="sub">Batteribank ${formatNumber(batteryAh, 0)} Ah</div>
        </div>
      </div>

      <div class="cover-summary">
        <div class="recomm">
          <div>
            <div class="eyebrow">Anbefalt hovedl\u00f8sning</div>
            <h3>${esc(recommendation.mainSolution || sysRec.releaseArrangement || "\u2014")}</h3>
          </div>
          <div class="stats">
            <div class="stat"><span class="k">Status</span><span class="v">${esc(statusLabel(recommendation.status))}</span></div>
            <div class="stat"><span class="k">Konfidens</span><span class="v">${esc(confidenceLabel(recommendation.status))}</span></div>
            <div class="stat"><span class="k">Totalkost 15 \u00e5r</span><span class="v">${formatNumber(tocRecommended, 0)} kr</span></div>
            <div class="stat"><span class="k">Energibalanse</span><span class="v">${balancePositive ? "+" : ""}${formatNumber(annualBalanceKWh, 0)} kWh/\u00e5r</span></div>
          </div>
        </div>
      </div>
    </div>

    <div class="cover-bottom cover-edge">
      <div class="disclaimer">
        Denne rapporten brukes p\u00e5 eget ansvar.<br/>
        Tall og anbefalinger er veiledende, og andre krav fra NVE kan forekomme.
      </div>
      <div class="stamp">
        hydroguide.no/r/${esc(docId)}<br/>
        ${esc(isoStamp)}
      </div>
    </div>
  </div>
</section>

<section class="page appendix">
  <header class="appendix-top">
    <div class="brand">
      <img class="report-logo" src="/hydroguide-logo-black.svg" alt="HydroGuide" />
    </div>
    <div class="appendix-meta">
      <div><b>${esc(docId)}</b></div>
      <div>${esc(todayLong)}</div>
    </div>
  </header>

  <section class="package-panel">
    <div class="up-card">
      <div class="up-main">
        <span class="up-eyebrow">Anbefalt utstyrspakke</span>
        <h3>${esc(recommendation.mainSolution || "Skalerbar standardpakke for fjernanlegg")}</h3>
        <p>${esc(leadSummary)}</p>
      </div>
      <aside class="up-tech" aria-label="Tekniske valg">
        <div class="up-row"><span class="k">Primærkilde</span><span class="v">Solcellepanel<span class="sub">${esc(appendixPanelSpec)} · ${formatNumber(annualSolarKWh, 0)} kWh/år</span></span></div>
        <div class="up-row"><span class="k">Batteribank</span><span class="v">500Ah</span></div>
        <div class="up-row"><span class="k">Sekundærkilde</span><span class="v">${appendixSecondarySpec ? esc(appendixSecondarySpec) : esc(recommendedSourceLabel)}${appendixSecondarySpec ? `<span class="sub">${esc(recommendedSourceLabel)}</span>` : ""}</span></div>
        <div class="up-row"><span class="k">Autonomi</span><span class="v">${esc(autonomyText)}</span></div>
      </aside>
    </div>
  </section>

  <section class="appendix-reasons">
    ${appendixReasons}
  </section>

  <section class="energy-panel">
    <div class="v6-block-title">
      <b>Energibalanse</b>
    </div>
    <div class="v6-eb2">
      <div class="v6-stack">
        <div class="yax">${appendixYAxisTicks}</div>
        ${appendixMonthBars}
      </div>
      <div class="v6-stack-labels">${appendixMonthLabels}</div>
      <div class="eb-foot">
        <div class="ef hi"><i style="background:var(--brand)"></i><span class="k">Solcellepanel</span><span class="v">${formatNumber(annualSolarKWh, 0)}<small>kWh/år</small></span></div>
        <div class="ef"><i style="background:#93b3f5"></i><span class="k">Last</span><span class="v">${formatNumber(visibleAnnualTotals.annualLoadDemandKWh, 0)}<small>kWh/år</small></span></div>
        <div class="ef"><i style="background:#15803d"></i><span class="k">${esc(recommendedSourceLabel)}</span><span class="v">${formatNumber(backupKWh, 0)}<small>kWh/år</small></span></div>
      </div>
    </div>
  </section>

  <section class="reserve-panel">
    <div class="v6-rowtitle">
      <b>Sekundærkilde</b>
    </div>
    <table class="v6-compare">
      <thead>
        <tr>
          <th class="rowhead">Sekundærkilde</th>
          <th>Effekt</th>
          <th>Levetid</th>
          <th>Driftstid</th>
          <th>Drivstoff</th>
          <th>CO₂</th>
          <th>Investering</th>
          <th>Drift/år</th>
          <th>TOC ${formatNumber(derivedResults.costComparison.alternatives[0]?.evaluationHorizonYears ?? 15, 0)} år</th>
        </tr>
      </thead>
      <tbody>
        ${appendixCostRows}
      </tbody>
    </table>
  </section>

  <section class="radio-panel">
    <div class="v6-rowtitle">
      <b>Radiolinje · ${esc(projectShort)}</b>
    </div>
    <div class="v6-radio-box">
      <div class="v6-terrain-mini">
        <svg viewBox="0 0 760 200" preserveAspectRatio="none" role="img" aria-label="Forenklet terrengprofil mellom radiopunkt">
          <rect width="760" height="200" fill="#f6fbff"/>
          <g stroke="#eef2f7" stroke-width="1">
            <line x1="32" y1="42" x2="734" y2="42"/><line x1="32" y1="82" x2="734" y2="82"/><line x1="32" y1="122" x2="734" y2="122"/><line x1="32" y1="162" x2="734" y2="162"/>
          </g>
          <path d="M32 170 L76 110 L126 122 L176 92 L226 112 L276 88 L326 126 L376 104 L426 136 L486 126 L546 154 L606 142 L666 158 L720 138 L734 168 L734 200 L32 200 Z" fill="#cbd5e1" stroke="#475569" stroke-width=".8" stroke-linejoin="round"/>
          <ellipse cx="383" cy="98" rx="330" ry="22" fill="#2563eb" fill-opacity=".08" stroke="#2563eb" stroke-opacity=".35" stroke-dasharray="6 5"/>
          <path d="M76 110 L720 138" stroke="#2563eb" stroke-width="2" stroke-dasharray="7 5"/>
          <circle cx="76" cy="110" r="5" fill="#2563eb"/><circle cx="720" cy="138" r="5" fill="#2563eb"/>
          <text x="82" y="96" font-family="Arial, sans-serif" font-size="9" font-weight="700" fill="#020617">A · Inntak</text>
          <text x="714" y="124" text-anchor="end" font-family="Arial, sans-serif" font-size="9" font-weight="700" fill="#020617">B · Kraftstasjon</text>
          <text x="383" y="92" text-anchor="middle" font-family="Arial, sans-serif" font-size="7.5" font-weight="700" fill="#1d4ed8">${esc(radioClearance)}</text>
        </svg>
      </div>
      <div class="v6-radio-data">
        <div><span class="k">Linkavstand</span><span class="v">${esc(radioDistance)}</span></div>
        <div><span class="k">Friromsdempning</span><span class="v">${esc(radioLoss)}</span></div>
        <div><span class="k">Regn ${formatOptionalNumber(config.radioLink.rainFactor, 0)} mm/h</span><span class="v">${esc(radioRain)}</span></div>
        <div><span class="k">Fresnel</span><span class="v">${esc(radioClearance)}</span></div>
      </div>
    </div>
  </section>

  <div class="flex-spacer"></div>

  <footer class="page-footer">
    <span>HydroGuide · ${esc(projectShort)}</span>
    <span class="pageno">Side 2 / 2</span>
  </footer>
</section>

<section class="page">
  <div class="page-header">
    <div class="left"><span class="header-mark" aria-hidden="true">${markSvg}</span>HydroGuide \u00b7 ${esc(projectFull)}</div>
    <div>Rapport ${esc(docId)} \u00b7 ${esc(todayLong)}</div>
  </div>

  <span class="h-section"><span class="num">01</span> Anbefaling</span>

  <div class="reco-hero" style="margin-bottom:18px;">
    <div class="left">
      <span class="eyebrow">Hovedl\u00f8sning</span>
      <h2>${esc(recommendation.mainSolution || sysRec.releaseArrangement || "\u2014")}</h2>
      <p class="summary">${esc(leadSummary)}</p>
      <div class="status-line"><strong>${esc(statusLabel(recommendation.status))}</strong> <span class="sep">\u00b7</span> Konfidens ${esc(confidenceLabel(recommendation.status).toLowerCase())} <span class="sep">\u00b7</span> Energibalanse ${balancePositive ? "oppfylt" : "underdekket"}</div>
    </div>
    <div class="right">
      <span class="eyebrow">Tekniske valg</span>
      <div class="row"><span class="k">Slippordning</span><span class="v">${esc(sysRec.releaseArrangement || "\u2014")}</span></div>
      <div class="row"><span class="k">Prim\u00e6rm\u00e5ling</span><span class="v">${esc(sysRec.primaryMeasurement || "\u2014")}</span></div>
      <div class="row"><span class="k">M\u00e5leprinsipp</span><span class="v">${esc(sysRec.controlMeasurement || "\u2014")}</span></div>
      <div class="row"><span class="k">Logger</span><span class="v">${esc(sysRec.loggerSetup || "\u2014")}</span></div>
      <div class="row"><span class="k">Kommunikasjon</span><span class="v">${esc(sysRec.communication || "\u2014")}</span></div>
      <div class="row"><span class="k">Reservekilde</span><span class="v">${esc(backupRowValue)}</span></div>
    </div>
  </div>

  <span class="h-section"><span class="num">02</span> Energibalanse</span>

  <div class="chart">
    <div class="chart-head">
      <div>
        <div class="h-card">M\u00e5nedlig solproduksjon vs. last</div>
        <div class="meta">
          \u00c5rsniv\u00e5: sol ${formatNumber(annualSolarKWh, 0)} kWh/\u00e5r \u00b7 reserve ${formatNumber(backupKWh, 0)} kWh/\u00e5r
        </div>
      </div>
      <div class="chart-legend">
        <span class="swatch solar">Solproduksjon</span>
        <span class="swatch load">Last</span>
      </div>
    </div>
    <div class="bars">
      <div class="y-axis">${yAxisTicks.map((t) => `<span>${esc(t)}</span>`).join("")}</div>
      ${monthBars}
    </div>
  </div>

  <div class="grid-2 setup-grid">
    <div class="card">
      <div class="card-head"><span class="h-card">Teknisk oppsett</span><span class="tag">M\u00e5ling</span></div>
      <div class="kv-list">
        <div class="kv"><span class="k">Slippordning</span><span class="v">${esc(sysRec.releaseArrangement || "\u2014")}</span></div>
        <div class="kv"><span class="k">Prim\u00e6rm\u00e5ling</span><span class="v">${esc(sysRec.primaryMeasurement || "\u2014")}</span></div>
        <div class="kv"><span class="k">M\u00e5leprinsipp</span><span class="v">${esc(sysRec.controlMeasurement || "\u2014")}</span></div>
        <div class="kv"><span class="k">M\u00e5leutstyr</span><span class="v">${esc(sysRec.measurementEquipment || "\u2014")}</span></div>
        <div class="kv"><span class="k">Istilpasning</span><span class="v">${esc(sysRec.icingAdaptation || "\u2014")}</span></div>
        <div class="kv"><span class="k">Frostsikring</span><span class="v">${esc(frostProtectionText)}</span></div>
        <div class="kv"><span class="k">Bypass ved utfall</span><span class="v">${esc(bypassText)}</span></div>
        <div class="kv"><span class="k">Varsling</span><span class="v">${esc(alarmText)}</span></div>
      </div>
      ${renderAiNote(aiFields?.measurementNote)}
    </div>
    <div class="card">
      <div class="card-head"><span class="h-card">Energiforsyning</span><span class="tag">Energi</span></div>
      <div class="kv-list">
        <div class="kv"><span class="k">Solcelleanlegg</span><span class="v">${esc(solarKvValue)}</span></div>
        <div class="kv"><span class="k">Batteribank</span><span class="v">${esc(batteryKvValue)}</span></div>
        <div class="kv"><span class="k">Autonomi</span><span class="v">${esc(autonomyText)}</span></div>
        <div class="kv"><span class="k">Reservekilde</span><span class="v">${esc(backupRowValue)}</span></div>
        <div class="kv"><span class="k">Kommunikasjon</span><span class="v">${esc(sysRec.communication || "\u2014")}</span></div>
      </div>
      ${renderAiNote(aiFields?.energyNote)}
    </div>
  </div>

  <div class="page-footer">
    <span>Side 3 \u00b7 Anbefaling og energibalanse</span>
    <span class="pageno">3 / 4</span>
  </div>
</section>

<section class="page">
  <div class="page-header">
    <div class="left"><span class="header-mark" aria-hidden="true">${markSvg}</span>HydroGuide \u00b7 ${esc(projectFull)}</div>
    <div>Rapport ${esc(docId)} \u00b7 ${esc(todayLong)}</div>
  </div>

  <span class="h-section"><span class="num">03</span> Kostnadssammenligning \u00b7 15 \u00e5r</span>
  <p class="lede">
    Total kostnad over 15 \u00e5r for reservekildene som er aktuelle.
    ${recommendedSourceLabel} er anbefalt; \u00f8vrige er tatt med som referanse.
  </p>

  <div class="card" style="margin-bottom:14px;">
    <div class="card-head">
      <span class="h-card">Total kostnad reservekilde (TOC)</span>
      <span class="meta">Innkj\u00f8p + drivstoff + vedlikehold</span>
    </div>
    <div class="toc-bars">
      ${tocBars}
    </div>
  </div>

  <div class="card" style="padding:0;overflow:hidden;margin-bottom:18px;">
    <table class="data">
      <thead>
        <tr>
          <th>Kilde</th>
          <th class="num">Investering</th>
          <th class="num">Drivstoff/\u00e5r</th>
          <th class="num">Vedlikehold/\u00e5r</th>
          <th class="num">CO\u2082/\u00e5r</th>
          <th class="num">Driftstimer 15 \u00e5r</th>
          <th class="num">TOC</th>
        </tr>
      </thead>
      <tbody>
        ${costRows}
      </tbody>
    </table>
  </div>

  <span class="h-section"><span class="num">04</span> Tilleggskrav og driftskrav</span>

  <div class="grid-2" style="margin-bottom:18px;">
    <div class="card">
      <div class="card-head"><span class="h-card">Tilleggskrav til l\u00f8sning</span><span class="tag">Krav</span></div>
      ${requirementListHtml(additionalReqs)}
    </div>
    <div class="card">
      <div class="card-head"><span class="h-card">Driftskrav</span><span class="tag">Drift</span></div>
      ${requirementListHtml(operationsReqs)}
    </div>
  </div>

  <span class="h-section"><span class="num">05</span> Faglig underbygging</span>

  ${reasonBlocks || "<p class=\"body\">Ingen begrunnelser er registrert.</p>"}
  ${aiUnderbygningHtml}

  <div class="page-footer">
    <span>Side 4 \u00b7 Kostnad og faglig underbygging \u00b7 Generert av HydroGuide</span>
    <span class="pageno">4 / 4</span>
  </div>
</section>

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
  const html = await stampTraceId(buildReportHtml(
    config,
    recommendation,
    aiRecommendationText,
    derivedResults,
    activeReserveSource,
    visibleAnnualTotals,
    visibleMonthlyEnergyBalance
  ));

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
