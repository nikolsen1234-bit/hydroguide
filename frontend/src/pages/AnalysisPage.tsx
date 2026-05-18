import { useCallback, useMemo, useState } from "react";
import { NavLink } from "react-router-dom";
import { EnergyOverviewChart } from "../components/SystemCharts";
import WorkspaceHeader, { WorkspaceHeaderActionButton, workspaceHeaderActionIcons } from "../components/WorkspaceHeader";
import EditorialSection from "../components/EditorialSection";
import { ANSWER_KEYS, API_ENDPOINTS, STORAGE_KEYS } from "../constants";
import { useConfigurationContext } from "../context/ConfigurationContext";
import { hydroGuideCriteria } from "../hydroguide/sourceAnchoredDecision";
import { useLanguage, translateDynamic } from "../i18n";
import {
  workspaceContentCategoryClassName,
  workspaceContentValueBaseClassName,
  workspaceContentValueClassName,
  workspaceOverlineClassName,
  workspacePageClassName
} from "../styles/workspace";
import { Answers, BackupSourceName, CostComparisonItem, MonthlyEnergyBalanceRow, ValidationErrors } from "../types";
import { formatNumber } from "../utils/format";
import { buildAiReportPayload, openReportWindow, type AiReportFields } from "../utils/report";
import { calculateRecommendation } from "../utils/recommendation";
import { calculateConfigurationOutputs } from "../utils/systemResults";
import { validateConfiguration } from "../utils/validation";

const blockerLinkClass =
  "inline-flex min-h-[44px] items-center rounded-lg border border-[var(--hg-accent-2)] bg-[var(--hg-accent-soft)] px-4 py-2.5 text-[length:var(--hg-type-ui-size)] font-[var(--hg-type-weight-semibold)] leading-[var(--hg-type-category-leading)] text-[var(--hg-accent)] transition hover:bg-[var(--hg-surface-2)]";

const analysisMetricTitleClassName = workspaceContentCategoryClassName;
const analysisMetricValueBaseClassName = workspaceContentValueBaseClassName;
const analysisMetricValueClassName = workspaceContentValueClassName;

const ROBUST_PREFIX_RE = /^Robust\s+/i;
const ROBUST_VARIANT_RE = / med robust utforming/i;
const ROBUST_RELEASE_RE = /robust slipp-løsning/i;
const ROBUST_REGULATION_RE = /robust reguleringskum/i;
const WHITESPACE_RE = /\s+/g;
const MAIN_SOLUTION_PARTS_RE = /^(.*?)(?: med (.*?))?(?: \((.*)\))?$/;
const ACCESS_HASH_RE = /^[a-f0-9]{64}$/;
const ANSWER_KEY_SET = new Set<string>(ANSWER_KEYS);

const CRITERION_LABELS: Record<string, string> = Object.fromEntries(
  hydroGuideCriteria.map((criterion) => [criterion.id, criterion.title])
);

function foundationFieldLabel(key: string, t: (k: any) => string): string {
  if (key === "other.evaluationHorizonYears") return t("main.evaluationHorizon");
  if (key === "systemParameters.inspectionsPerYear") return t("main.inspectionsPerYear");
  return CRITERION_LABELS[key] ?? key;
}

async function getAiExportHash(promptText: string) {
  const storedHash = window.sessionStorage.getItem(STORAGE_KEYS.AI_EXPORT_HASH)?.trim().toLowerCase() ?? "";
  if (ACCESS_HASH_RE.test(storedHash)) {
    return storedHash;
  }
  if (storedHash) {
    window.sessionStorage.removeItem(STORAGE_KEYS.AI_EXPORT_HASH);
  }

  const accessCode = window.prompt(promptText);
  if (!accessCode) {
    return null;
  }

  const input = new TextEncoder().encode(accessCode.trim());
  const digest = await crypto.subtle.digest("SHA-256", input);
  const hash = Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  window.sessionStorage.setItem(STORAGE_KEYS.AI_EXPORT_HASH, hash);
  return hash;
}

function InfoRow({
  label,
  value
}: {
  label: string;
  value: string;
}) {
  const labelClassName = analysisMetricTitleClassName;
  const valueClassName = `${analysisMetricValueClassName} text-left sm:text-right`;

  return (
    <div className="grid grid-cols-1 items-baseline gap-1 border-t border-[var(--hg-hairline-2)] py-3 first:border-t-0 first:pt-0 last:pb-0 sm:grid-cols-[minmax(0,1fr)_auto] sm:gap-4">
      <span className={labelClassName}>{label}</span>
      <span className={valueClassName}>{value}</span>
    </div>
  );
}
function splitMainSolution(solution: string) {
  const normalized = solution
    .trim()
    .replace(ROBUST_PREFIX_RE, "")
    .replace(ROBUST_VARIANT_RE, " med vern mot is/drivgods")
    .replace(ROBUST_RELEASE_RE, "passiv slipp-løsning")
    .replace(ROBUST_REGULATION_RE, "reguleringskum")
    .replace(WHITESPACE_RE, " ");
  const match = normalized.match(MAIN_SOLUTION_PARTS_RE);

  if (!match) {
    return { title: normalized, detail: "", profile: "" };
  }

  const [, title = normalized, detail = "", profile = ""] = match;
  const titleText = title.trim();
  return {
    title: titleText ? `${titleText.charAt(0).toUpperCase()}${titleText.slice(1)}` : titleText,
    detail: detail.trim(),
    profile: profile.trim()
  };
}

function InfoColumn({
  title,
  items,
  className = ""
}: {
  title: string;
  items: Array<{ label: string; value: string }>;
  className?: string;
}) {
  return (
    <div className={className}>
      <h3 className={analysisMetricTitleClassName}>{title}</h3>
      <div className="mt-3">
        {items.map((item) => (
          <InfoRow key={item.label} label={item.label} value={item.value} />
        ))}
      </div>
    </div>
  );
}

const SOURCE_SUFFIX_RE = /\s+\(([^()]*?(?:NVE|Retningslinje)[^()]*)\)\.?$/i;
const SOURCE_GLOBAL_RE = /\s*\(([^()]*?(?:NVE|Retningslinje)[^()]*)\)/gi;
const DETAIL_LABEL_RE = /^(Kriterium dokumentert|Kriterium ikke oppfylt|Mangler dokumentasjon|Driftsforutsetning|Svar Nei|Dokumentert|Ikke oppfylt):\s*/i;
const DOCUMENTED_YES = "documented_satisfies_source_criterion";
const DOCUMENTED_NO = "documented_does_not_satisfy_source_criterion";

type MeasurementRecommendationText = {
  mappedConditions: string;
  recommendedMethod: string;
  unsuitableMethods: string;
  requirements: string;
  sources: string[];
};

const MEASUREMENT_RECOMMENDATION_SOURCES = [
  "NVE Veileder nr. 3/2020, Slipp, måling og dokumentasjon av minstevannføring, pkt. 4.2, 5.2, 6.1, 6.2, 6.3, 8 og 9",
  "Retningslinje for registrering av konsesjonspålagte minstevannføringer, vedtatt 12.02.24, pkt. 4.1-4.5",
  "Retningslinje for registrering av vannføring i elver, vedtatt 12.02.24, pkt. 4.2.1, 4.5, 4.6 og 4.7",
  "Veiledning for etablering av pålagt vannføringsstasjon, NVE 2024, kap. 3"
];

function parseDetailItem(item: string): { label: string; text: string; source: string } {
  let text = item.trim();
  let source = "";

  if (text.startsWith("Kilde:")) {
    return { label: "", text: "", source: text.slice("Kilde:".length).trim().replace(/\.$/, "") };
  }

  const inlineSourceIndex = text.indexOf("\n\nKilde:");
  if (inlineSourceIndex >= 0) {
    source = text.slice(inlineSourceIndex + "\n\nKilde:".length).trim().replace(/\.$/, "");
    text = text.slice(0, inlineSourceIndex).trim();
  }

  const sourceMatch = text.match(SOURCE_SUFFIX_RE);
  if (sourceMatch?.index !== undefined) {
    source = sourceMatch[1].trim();
    text = text.slice(0, sourceMatch.index).trim();
  }

  const labelMatch = text.match(DETAIL_LABEL_RE);
  const label = labelMatch?.[1] ?? "";
  if (labelMatch) {
    text = text.slice(labelMatch[0].length).trim();
  }

  return { label, text, source };
}

function isDocumentedYes(answers: Answers, key: string): boolean {
  return answers[key] === DOCUMENTED_YES;
}

function isDocumentedNo(answers: Answers, key: string): boolean {
  return answers[key] === DOCUMENTED_NO;
}

function isMissingEvidence(answers: Answers, key: string): boolean {
  const value = answers[key];
  return value === "" || value === undefined || value === null || value === "not_documented_yet";
}

function selectedSiteFactors(answers: Answers): string[] {
  return Array.isArray(answers.site_factors) ? answers.site_factors.map(String) : [];
}

function buildMeasurementRecommendation(answers: Answers): MeasurementRecommendationText {
  const conditions: string[] = [];
  const unsuitable: string[] = [];
  const requirements: string[] = [];
  const siteFactors = selectedSiteFactors(answers);
  const release = String(answers.release_method || "");
  const docMethod = String(answers.doc_method || "");
  const reportFreq = String(answers.report_freq || "");
  const redundancy = String(answers.redundancy || "");
  const isPipeLike = release === "intake_pipe" || release === "intake_coanda";

  if (siteFactors.includes("site_ice_frost")) {
    conditions.push("is eller frost ved inntak/målepunkt");
    requirements.push("målepunkt, sensor og elektronikk må plasseres eller beskyttes slik at is og frost ikke gir bortfall eller feil måling");
  }
  if (siteFactors.includes("site_debris_sediment")) {
    conditions.push("drivgods eller sediment i vannet");
    requirements.push("målepunktet må sikres mot sediment, rusk og profilendringer");
  }
  if (siteFactors.includes("site_low_conductivity")) {
    conditions.push("rent vann med lav ledningsevne");
    unsuitable.push("elektromagnetisk vannmåler kan være uegnet uten dokumentert lav-ledningsevne-spesifikasjon");
  }
  if (siteFactors.includes("site_limited_power_comm")) {
    conditions.push("begrenset strøm eller kommunikasjon");
    requirements.push("strømforsyning og kommunikasjon må dimensjoneres for kontinuerlig drift og lokal lagring");
  }
  if (siteFactors.includes("site_hard_access")) {
    conditions.push("vanskelig adkomst");
    requirements.push("redundant logging og robust feltløsning bør vurderes for vanskelig tilgjengelig stasjon");
  }

  if (isPipeLike) {
    conditions.push("slipp gjennom rør eller lukket kanal");
  } else if (release === "intake_dam_pipe" || release === "intake_dam_gate" || release === "intake_dam_opening") {
    conditions.push("slipp via damrør, luke eller utsparing der dokumentasjonen normalt bør knyttes til nedstrøms måleprofil");
  } else if (release === "intake_fish_passage") {
    conditions.push("minstevannføringen kan helt eller delvis føres gjennom fiskepassasje");
  } else if (release === "intake_alternative") {
    conditions.push("alternativ måleløsning utenfor normal kildeforankret metode");
  }

  if (docMethod === "doc_direct_flow") conditions.push("direkte flowmåling i rør er valgt som dokumentasjonsmetode");
  else if (docMethod === "doc_level_to_flow") conditions.push("indirekte dokumentasjon via vannstand og vannføringskurve er valgt");
  else if (docMethod === "doc_level_only") conditions.push("bare vannstandsmåling er valgt som dokumentasjon");

  if (reportFreq === "freq_frequent") requirements.push("rapporteringsfrekvensen skal være 15-30 min med stabil kommunikasjon eller lokal buffer");
  else if (reportFreq === "freq_hourly") conditions.push("standard rapporteringsfrekvens (1 gang per time)");

  if (redundancy === "redundancy_yes") {
    conditions.push("redundans (to uavhengige sensorer/loggere) er ønsket");
    requirements.push("to uavhengige målepunkt/loggere må prosjekteres og dokumenteres");
  }

  let recommendedMethod = "";
  if (isPipeLike && docMethod === "doc_direct_flow") {
    if (siteFactors.includes("site_low_conductivity")) {
      recommendedMethod = "Direkte flowmåling i rør anbefales. På grunn av lav ledningsevne bør elektromagnetisk måler spesifiseres for lav konduktivitet (eksempel Siemens SITRANS FMS520) eller ultralydmåler vurderes som alternativ.";
    } else {
      recommendedMethod = "Direkte flowmåling i rør med elektromagnetisk vannmåler anbefales. Måleren må monteres etter leverandørens spesifikasjoner.";
    }
  } else if (release === "intake_dam_pipe" || release === "intake_dam_gate" || release === "intake_dam_opening" || docMethod === "doc_level_to_flow") {
    recommendedMethod = "Vannstandsmåling med vannføringskurve (h-Q) i et stabilt nedstrøms måleprofil anbefales som dokumentasjon av minstevannføringen.";
  } else if (docMethod === "doc_level_only") {
    recommendedMethod = "Vannstandsmåling alene anbefales der det er tilstrekkelig som dokumentasjon for det aktuelle anlegget.";
  } else if (release === "intake_fish_passage") {
    recommendedMethod = "Målingen bør dokumentere vannføringen gjennom fiskepassasjen uten å skape vandringshinder, normalt med vannstand/lukeåpning og kontrollert nedstrøms måleprofil.";
  } else if (release === "intake_coanda") {
    recommendedMethod = "Ved coanda-/tyrolerrist bør målingen legges til et luftfritt og kontrollerbart målepunkt; åpen bypass bør normalt dokumenteres med vannstandsmåling over kalibrert profil.";
  } else if (release === "intake_alternative") {
    recommendedMethod = "Alternativ metode krever særskilt begrunnelse og NVE-avklaring.";
  } else {
    recommendedMethod = "Anbefalt målemetode kan ikke fastsettes før slippmetode og dokumentasjonsmetode er valgt.";
  }

  const mappedConditions =
    conditions.length > 0
      ? `Det er kartlagt ${joinNorwegianList(conditions)}.`
      : "Det er ikke registrert nok stedsspesifikke måleforhold til å gi en tydelig metodeanbefaling.";
  const unsuitableMethods = unsuitable.length > 0 ? `${joinReportSentences(unsuitable)}` : "";
  const requirementText =
    requirements.length > 0
      ? `Før anbefalingen legges til grunn må ${joinNorwegianList(Array.from(new Set(requirements)))}.`
      : "De registrerte forholdene gir ikke egne avklaringspunkter utover ordinær dokumentasjon, logging og kontroll.";

  return {
    mappedConditions,
    recommendedMethod,
    unsuitableMethods,
    requirements: requirementText,
    sources: MEASUREMENT_RECOMMENDATION_SOURCES
  };
}

function extractDetailSources(item: string): string[] {
  const sources: string[] = [];
  const parsed = parseDetailItem(item);
  if (parsed.source) {
    sources.push(parsed.source);
  }

  item.replace(SOURCE_GLOBAL_RE, (_match, source: string) => {
    sources.push(source);
    return "";
  });

  return sources;
}

function dedupeSources(items: string[]): string[] {
  const seen = new Set<string>();
  const sources: string[] = [];

  items
    .flatMap(extractDetailSources)
    .flatMap((source) => source.split(/\s*;\s*/))
    .map((source) => source.trim().replace(/\.$/, ""))
    .filter(Boolean)
    .forEach((source) => {
      if (!seen.has(source)) {
        seen.add(source);
        sources.push(source);
      }
    });

  return sources;
}

function joinNorwegianList(items: string[]): string {
  const visible = items.map((item) => item.trim()).filter(Boolean);
  if (visible.length === 0) return "";
  if (visible.length === 1) return visible[0];
  if (visible.length === 2) return `${visible[0]} og ${visible[1]}`;
  return `${visible.slice(0, -1).join(", ")} og ${visible[visible.length - 1]}`;
}

function joinReportSentences(items: string[]): string {
  return items.map((item) => item.trim()).filter(Boolean).map((item) => (/[.!?]$/.test(item) ? item : `${item}.`)).join(" ");
}

function operationsReport(items: string[]): string {
  if (items.length === 0) return "";

  return "Valgt metode forutsetter timeslogging, nøyaktighet innen +/-5 prosent ved kravsatt slipp, minst 97 prosent korrekte og komplette registreringer, kontinuerlig datatilgang, relevant backup, periodiske kontroller og lagring av dokumentasjon og måledata for NVE.";
}

function ReasoningReportPanel({
  sections,
  sources
}: {
  sections: Array<{ title: string; text: string }>;
  sources: string[];
}) {
  const visibleSections = sections.filter((section) => section.text.trim());

  if (visibleSections.length === 0 && sources.length === 0) return null;

  return (
    <div className="space-y-5">
      {visibleSections.map((section) => (
        <section key={section.title} className="border-t border-[var(--hg-hairline)] pt-4 first:border-t-0 first:pt-0">
          <h3 className={analysisMetricTitleClassName}>{section.title}</h3>
          <p className={`${analysisMetricValueClassName} mt-2 leading-7`}>{section.text}</p>
        </section>
      ))}

      {sources.length > 0 ? (
        <details className="border-t border-[var(--hg-hairline)] pt-4 text-[11px] text-[var(--hg-muted)]">
          <summary className="cursor-pointer select-none font-[var(--hg-type-weight-semibold)]">Kilder</summary>
          <div className="mt-2 space-y-1 leading-5">
            {sources.map((source) => (
              <p key={source}>{source}.</p>
            ))}
          </div>
        </details>
      ) : null}
    </div>
  );
}
function MonthlyTable({ rows }: { rows: MonthlyEnergyBalanceRow[] }) {
  const { t } = useLanguage();

  return (
    <>
      <div className="hidden lg:block">
        <table className="w-full table-fixed border-collapse">
          <thead>
            <tr className={`${analysisMetricTitleClassName} border-y border-[var(--hg-hairline)] text-left bg-[var(--hg-surface-2)]`}>
              <th className="px-4 py-3">{t("analysis.month")}</th>
              <th className="px-4 py-3 text-right">{t("analysis.sun")}</th>
              <th className="px-4 py-3 text-right">{t("analysis.load")}</th>
              <th className="px-4 py-3 text-right">{t("analysis.balance")}</th>
              <th className="px-4 py-3 text-right">{t("analysis.fuel")}</th>
              <th className="px-4 py-3 text-right">{t("analysis.cost")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.month} className="border-b border-[var(--hg-hairline-2)]">
                <td className="px-4 py-3">
                  <p className={analysisMetricTitleClassName}>{t(`month.${row.month}`)}</p>
                  <p className={analysisMetricValueClassName}>{row.daysInMonth} {t("analysis.days")}</p>
                </td>
                <td className={`px-4 py-3 text-right ${analysisMetricValueClassName}`}>{formatNumber(row.solarProductionKWh)} kWh</td>
                <td className={`px-4 py-3 text-right ${analysisMetricValueClassName}`}>{formatNumber(row.loadDemandKWh)} kWh</td>
                <td className={`px-4 py-3 text-right ${analysisMetricValueBaseClassName} ${row.energyBalanceKWh >= 0 ? "text-[var(--hg-ok)]" : "text-[var(--hg-warn)]"}`}>
                  {formatNumber(row.energyBalanceKWh)} kWh
                </td>
                <td className={`px-4 py-3 text-right ${analysisMetricValueClassName}`}>{formatNumber(row.fuelLiters)} l</td>
                <td className={`px-4 py-3 text-right ${analysisMetricValueClassName}`}>{formatNumber(row.fuelCost)} kr</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="space-y-3 lg:hidden">
        {rows.map((row) => (
          <div key={row.month} className="border-t border-[var(--hg-hairline-2)] pt-3 first:border-t-0 first:pt-0">
            <div className="flex items-baseline justify-between gap-3 border-b border-[var(--hg-hairline)] pb-2">
              <p className={analysisMetricTitleClassName}>{t(`month.${row.month}`)}</p>
              <p className={`${analysisMetricValueClassName} text-right`}>{row.daysInMonth} {t("analysis.days")}</p>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2">
              {[
                { label: t("analysis.sun"), value: `${formatNumber(row.solarProductionKWh)} kWh`, tone: analysisMetricValueClassName },
                { label: t("analysis.load"), value: `${formatNumber(row.loadDemandKWh)} kWh`, tone: analysisMetricValueClassName },
                {
                  label: t("analysis.balance"),
                  value: `${formatNumber(row.energyBalanceKWh)} kWh`,
                  tone: `${analysisMetricValueBaseClassName} ${row.energyBalanceKWh >= 0 ? "text-[var(--hg-ok)]" : "text-[var(--hg-warn)]"}`
                },
                { label: t("analysis.fuel"), value: `${formatNumber(row.fuelLiters)} l`, tone: analysisMetricValueClassName },
                { label: t("analysis.cost"), value: `${formatNumber(row.fuelCost)} kr`, tone: analysisMetricValueClassName }
              ].map((item) => (
                <div key={item.label}>
                  <p className={analysisMetricTitleClassName}>{item.label}</p>
                  <p className={item.tone}>{item.value}</p>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function CostCard({ item }: { item: CostComparisonItem }) {
  const { t } = useLanguage();
  const runtimeShare =
    item.technicalLifetimeHours > 0 ? (item.totalRuntimeHours / item.technicalLifetimeHours) * 100 : null;

  return (
    <div className="border-t border-[var(--hg-hairline)] pt-4 first:border-t-0 first:pt-0">
      <div className="flex items-center justify-between gap-3">
        <h3 className={analysisMetricTitleClassName}>{displaySecondarySource(item.source)}</h3>
        <p className={`${analysisMetricValueClassName} text-right`}>{formatNumber(item.totalOwnershipCost)} kr</p>
      </div>

      <div className="mt-3">
        <InfoRow label={t("analysis.purchase")} value={`${formatNumber(item.purchaseCost)} kr`} />
        <InfoRow label={t("analysis.fuelCostPerYearLabel")} value={`${formatNumber(item.operatingCostPerYear)} kr`} />
        <InfoRow label={t("analysis.evaluationHorizon")} value={`${formatNumber(item.evaluationHorizonYears)} ${t("main.year")}`} />
        <InfoRow label={t("analysis.fuelPerYearLabel")} value={`${formatNumber(item.annualFuelConsumption)} l`} />
        <InfoRow label={t("analysis.co2PerYear")} value={`${formatNumber(item.annualCo2)} kg`} />
        <div className="mt-4 border-t border-[var(--hg-hairline)] pt-3">
          <p className={`${analysisMetricTitleClassName} mb-1`}>{t("analysis.reserveLifetime")}</p>
          <InfoRow label={t("analysis.totalRuntime")} value={`${formatNumber(item.totalRuntimeHours)} t`} />
          <InfoRow label={t("analysis.technicalLifetime")} value={`${formatNumber(item.technicalLifetimeHours)} t`} />
          {runtimeShare !== null ? (
            <InfoRow label={t("analysis.usedLifetime")} value={`${formatNumber(runtimeShare)} %`} />
          ) : null}
        </div>
      </div>
    </div>
  );
}

function SecondarySourceToggle({
  value,
  options,
  onChange
}: {
  value: BackupSourceName;
  options: BackupSourceName[];
  onChange: (v: BackupSourceName) => void;
}) {
  const { t, language } = useLanguage();

  return (
    <div className="flex w-full flex-col gap-2 sm:w-auto sm:items-end">
      <p className={`${workspaceOverlineClassName} text-[var(--hg-ink-2)]`}>{t("analysis.reserveSourceForDisplay")}</p>
      <div
        className="grid w-full rounded-md border border-[var(--hg-hairline)] bg-[var(--hg-surface)] p-0.5 sm:w-auto"
        style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
      >
        {options.map((option) => {
          const selected = value === option;
          return (
            <button
              key={option}
              type="button"
              onClick={() => onChange(option)}
              aria-pressed={selected}
              className={`hg-mono flex items-center justify-center rounded-[5px] border px-2 py-1.5 text-[length:var(--hg-type-overline-size)] font-[var(--hg-type-weight-bold)] uppercase tracking-[var(--hg-type-overline-tracking)] transition ${
                selected
                  ? "border-[var(--hg-accent)] bg-[var(--hg-accent-soft)] text-[var(--hg-accent)]"
                  : "border-transparent text-[var(--hg-ink-2)] hover:text-[var(--hg-ink)]"
              }`}
            >
              {translateDynamic(option, language)}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function countMatchingErrors(errors: ValidationErrors, predicate: (key: string) => boolean) {
  return Object.keys(errors).filter(predicate).length;
}

function displaySecondarySource(source: BackupSourceName | "NotComputed") {
  if (source === "FuelCell") return "Brenselcelle";
  if (source === "DieselGenerator") return "Dieselaggregat";
  return "Ikke beregnet";
}

export default function AnalysisPage() {
  const { t, language } = useLanguage();
  const d = (value: string) => translateDynamic(value, language);
  const { activeDraft, saveDraft, saveDraftMetadata } = useConfigurationContext();
  const [secondarySourceOverrides, setSecondarySourceOverrides] = useState<Partial<Record<string, BackupSourceName>>>({});
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);
  const autonomyResultLabel =
    activeDraft.systemParameters.batteryMode === "ah" ? t("analysis.autonomyFromBattery") : t("analysis.autonomy");
  const engineMode = activeDraft.engineMode ?? "calculator";
  const isCalculatorMode = engineMode === "calculator";
  const isGuidedMode = !isCalculatorMode;
  const usesFoundationQuestions = isGuidedMode;

  const allValidationErrors = useMemo(() => validateConfiguration(activeDraft), [activeDraft]);
  const foundationErrorPredicate = useCallback(
    (key: string) =>
      usesFoundationQuestions &&
      (key === "other.evaluationHorizonYears" ||
        key === "systemParameters.inspectionsPerYear" ||
        ANSWER_KEY_SET.has(key)),
    [usesFoundationQuestions]
  );
  const foundationErrors = useMemo(
    () =>
      Object.fromEntries(Object.entries(allValidationErrors).filter(([key]) => foundationErrorPredicate(key))) as ValidationErrors,
    [allValidationErrors, foundationErrorPredicate]
  );
  const foundationReady = Object.keys(foundationErrors).length === 0;

  const detailErrorKeys = useMemo(() => new Set(Object.keys(foundationErrors)), [foundationErrors]);
  const detailErrors = useMemo(
    () =>
      Object.fromEntries(Object.entries(allValidationErrors).filter(([key]) => !detailErrorKeys.has(key))) as ValidationErrors,
    [allValidationErrors, detailErrorKeys]
  );
  const hasSystemDetails = Object.keys(detailErrors).length === 0;

  const liveRecommendation = useMemo(
    () =>
      isGuidedMode && foundationReady
        ? calculateRecommendation(activeDraft.answers)
        : null,
    [activeDraft.answers, foundationReady, isGuidedMode]
  );

  const liveOutputs = useMemo(
    () => (foundationReady && hasSystemDetails ? calculateConfigurationOutputs(activeDraft) : null),
    [activeDraft, foundationReady, hasSystemDetails]
  );

  const recommendation = isGuidedMode ? liveOutputs?.recommendation ?? liveRecommendation : null;
  const derivedResults = liveOutputs?.derivedResults ?? null;
  const hasBackupSource = activeDraft.systemParameters.hasBackupSource === true;
  const secondaryDisplayOptions: BackupSourceName[] =
    derivedResults?.costComparison.alternatives.map((item) => item.source) ?? [];
  const recommendedSecondarySource: BackupSourceName =
    derivedResults?.systemRecommendation.secondarySource === "FuelCell" ? "FuelCell" : "DieselGenerator";
  const fallbackSecondarySource = secondaryDisplayOptions.includes(recommendedSecondarySource)
    ? recommendedSecondarySource
    : secondaryDisplayOptions[0] ?? recommendedSecondarySource;
  const overrideSecondarySource = secondarySourceOverrides[activeDraft.id];
  const activeSecondarySource =
    overrideSecondarySource && secondaryDisplayOptions.includes(overrideSecondarySource)
      ? overrideSecondarySource
      : fallbackSecondarySource;
  const handleSecondarySourceChange = useCallback(
    (value: BackupSourceName) => {
      setSecondarySourceOverrides((current) =>
        current[activeDraft.id] === value ? current : { ...current, [activeDraft.id]: value }
      );
    },
    [activeDraft.id]
  );

  const activeSecondaryScenario = derivedResults
    ? activeSecondarySource === "FuelCell"
      ? derivedResults.reserveScenarios.fuelCell
      : derivedResults.reserveScenarios.diesel
    : null;

  const visibleMonthlyEnergyBalance =
    hasBackupSource && activeSecondaryScenario
      ? activeSecondaryScenario.monthlyEnergyBalance
      : derivedResults?.monthlyEnergyBalance ?? [];
  const visibleAnnualTotals =
    hasBackupSource && activeSecondaryScenario ? activeSecondaryScenario.annualTotals : derivedResults?.annualTotals ?? null;
  const visibleSecondarySourcePowerW =
    hasBackupSource && activeSecondaryScenario
      ? activeSecondaryScenario.secondarySourcePowerW
      : derivedResults?.systemRecommendation.secondarySourcePowerW ?? 0;
  const visibleSecondarySourceValue =
    hasBackupSource ? activeSecondarySource : derivedResults?.systemRecommendation.secondarySource ?? "NotComputed";
  const visibleSecondarySourceLabel = displaySecondarySource(visibleSecondarySourceValue);

  const handleSave = () => {
    if (foundationReady && hasSystemDetails) {
      saveDraft();
      return;
    }

    saveDraftMetadata();
  };

  const handleGenerateReport = async () => {
    if (!derivedResults || !recommendation || !visibleAnnualTotals || isGeneratingReport) {
      return;
    }

    setIsGeneratingReport(true);
    setReportError(null);
    let aiRecommendationText: string | AiReportFields | null = null;

    try {
      const accessCodeHash = await getAiExportHash(t("analysis.aiReportAccessCode"));
      if (!accessCodeHash) {
        setIsGeneratingReport(false);
        return;
      }

      const payload = buildAiReportPayload(
        activeDraft,
        recommendation,
        derivedResults,
        activeSecondarySource,
        visibleAnnualTotals,
        visibleSecondarySourcePowerW
      );

      const response = await fetch(API_ENDPOINTS.AI_REPORT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          ...payload,
          accessCodeHash
        })
      });
      const responseBody = (await response.json().catch(() => null)) as {
        error?: string;
        text?: string;
        fields?: AiReportFields;
      } | null;

      if (response.status === 403) {
        window.sessionStorage.removeItem(STORAGE_KEYS.AI_EXPORT_HASH);
        throw new Error(responseBody?.error || "Ugyldig tilgangskode.");
      }

      const hasFieldText =
        responseBody?.fields &&
        typeof responseBody.fields === "object" &&
        !Array.isArray(responseBody.fields) &&
        Object.values(responseBody.fields).some((value) => typeof value === "string" && value.trim());
      if (!response.ok || (!responseBody?.text?.trim() && !hasFieldText)) {
        throw new Error(responseBody?.error || "AI-generering feilet.");
      }

      aiRecommendationText = hasFieldText ? responseBody.fields ?? null : responseBody.text?.trim() ?? null;
      await openReportWindow(
        activeDraft,
        recommendation,
        aiRecommendationText,
        derivedResults,
        activeSecondarySource,
        visibleAnnualTotals,
        visibleMonthlyEnergyBalance
      );
    } catch (error) {
      setReportError(error instanceof Error ? error.message : "Ukjent feil.");
    }

    if (!aiRecommendationText) {
      setIsGeneratingReport(false);
      return;
    }

    setIsGeneratingReport(false);
  };

  const foundationMissingKeys = Object.keys(foundationErrors).filter(foundationErrorPredicate);
  const foundationBlockers =
    isGuidedMode && (!foundationReady || !recommendation) && usesFoundationQuestions
      ? [
          {
            label: t("main.title"),
            path: "/prosjektgrunnlag",
            count: foundationMissingKeys.length,
            missingFields: foundationMissingKeys.map((key) => foundationFieldLabel(key, t))
          }
        ].filter((item) => item.count > 0)
      : [];

  const solutionLead = recommendation ? splitMainSolution(d(recommendation.mainSolution)) : null;
  const detailBlockers = [
    {
      label: t("analysis.technicalParameters"),
      path: "/parametere",
      count: countMatchingErrors(
        detailErrors,
        (key) =>
          key.startsWith("systemParameters.") ||
          key.startsWith("solar.") ||
          key.startsWith("battery.") ||
          key.startsWith("fuelCell.") ||
          key.startsWith("diesel.") ||
          key.startsWith("other.") ||
          key.startsWith("monthlySolarRadiation.")
      ),
      missingFields: [] as string[]
    },
    {
      label: t("analysis.powerLabel"),
      path: "/komponenter",
      count: countMatchingErrors(detailErrors, (key) => key.startsWith("equipmentRows.")),
      missingFields: [] as string[]
    }
  ].filter((item) => item.count > 0);
  const missingBlockers = foundationBlockers.length > 0 ? foundationBlockers : detailBlockers;

  const systemSummaryItems = derivedResults
    ? [
        { label: t("analysis.releaseArrangement"), value: d(derivedResults.systemRecommendation.releaseArrangement) },
        { label: t("analysis.primaryMeasurement"), value: d(derivedResults.systemRecommendation.primaryMeasurement) },
        { label: t("analysis.controlMeasurement"), value: d(derivedResults.systemRecommendation.controlMeasurement) },
        { label: t("analysis.loggerSetup"), value: d(derivedResults.systemRecommendation.loggerSetup) },
        { label: t("analysis.adaptation"), value: d(derivedResults.systemRecommendation.icingAdaptation) }
      ]
    : [];

  const secondarySummaryItems = derivedResults
    ? [
        { label: t("analysis.reserveSource"), value: d(visibleSecondarySourceLabel) },
        { label: t("analysis.reserveSourcePower"), value: `${formatNumber(visibleSecondarySourcePowerW)} W` },
        { label: t("analysis.batteryBank"), value: `${formatNumber(derivedResults.systemRecommendation.batteryCapacityAh)} Ah` },
        {
          label: autonomyResultLabel,
          value: `${formatNumber(derivedResults.systemRecommendation.batteryAutonomyDays)} ${t("analysis.days")}`
        },
        ...(isGuidedMode
          ? [{ label: t("analysis.communication"), value: d(derivedResults.systemRecommendation.communication) }]
          : [])
      ]
    : [];

  const showRecommendationContent = isGuidedMode && Boolean(recommendation && solutionLead);
  const canGenerateReport = Boolean(derivedResults && visibleAnnualTotals && recommendation && hasSystemDetails && !isGeneratingReport);
  const operationalRequirementItems = recommendation?.silentNveRequirements?.map(d) ?? [];
  const measurementRecommendation = recommendation
    ? buildMeasurementRecommendation(activeDraft.answers)
    : null;
  const operationsText = operationsReport(operationalRequirementItems);
  const reasoningSources = dedupeSources([
    ...(recommendation?.justification.map(d) ?? []),
    ...(recommendation?.additionalRequirements.map(d) ?? []),
    ...(recommendation?.silentNveRequirements?.map(d) ?? []),
    ...(measurementRecommendation?.sources ?? [])
  ]);

  return (
    <main className={workspacePageClassName}>
      <WorkspaceHeader
        title={t("analysis.title")}
        actions={
          <>
            <WorkspaceHeaderActionButton
              icon={workspaceHeaderActionIcons.run}
              label="Kjør på nytt"
              subLabel="Analyse"
              onClick={handleSave}
              disabled={!foundationReady || !hasSystemDetails}
            />
            {showRecommendationContent && recommendation ? (
              <WorkspaceHeaderActionButton
                icon={workspaceHeaderActionIcons.report}
                disabled={!canGenerateReport}
                onClick={handleGenerateReport}
                label={isGeneratingReport ? "Genererer..." : "Generer rapport"}
                subLabel="PDF"
                primary
              />
            ) : null}
          </>
        }
      />

      {derivedResults ? (
        <>
          <EditorialSection
            title={t("analysis.systemAndReserve")}
            actions={
              hasBackupSource && secondaryDisplayOptions.length > 1
                ? <SecondarySourceToggle value={activeSecondarySource} options={secondaryDisplayOptions} onChange={handleSecondarySourceChange} />
                : undefined
            }
          >
            {isGuidedMode ? (
              <div className="grid gap-6 lg:grid-cols-2 lg:gap-0 lg:divide-x lg:divide-[var(--hg-hairline)]">
                <InfoColumn title={t("analysis.system")} items={systemSummaryItems} className="lg:pr-8" />
                <InfoColumn title={t("analysis.reserve")} items={secondarySummaryItems} className="lg:pl-8" />
              </div>
            ) : (
              <InfoColumn title={t("analysis.reserve")} items={secondarySummaryItems} />
            )}
          </EditorialSection>

          <EditorialSection
            title={t("analysis.energyAndConsumption")}
          >
            <div className="hidden md:grid md:grid-cols-3 md:divide-x md:divide-[var(--hg-hairline)]">
              <div className="divide-y divide-[var(--hg-hairline)] md:px-6">
                <div className="py-4 text-center first:pt-0">
                  <p className={`${analysisMetricTitleClassName} text-center`}>{t("analysis.solarPerYear")}</p>
                  <p className={`mt-2 text-center ${analysisMetricValueClassName}`}>
                    {formatNumber(visibleAnnualTotals?.annualSolarProductionKWh ?? 0)} kWh
                  </p>
                </div>
                <div className="py-4 text-center last:pb-0">
                  <p className={`${analysisMetricTitleClassName} text-center`}>{t("analysis.loadPerYear")}</p>
                  <p className={`mt-2 text-center ${analysisMetricValueClassName}`}>
                    {formatNumber(visibleAnnualTotals?.annualLoadDemandKWh ?? 0)} kWh
                  </p>
                </div>
              </div>
              <div className="divide-y divide-[var(--hg-hairline)] md:px-6">
                <div className="py-4 text-center first:pt-0">
                  <p className={`${analysisMetricTitleClassName} text-center`}>{t("analysis.energyBalancePerYear")}</p>
                  <p className={`mt-2 text-center ${analysisMetricValueClassName}`}>
                    {formatNumber(visibleAnnualTotals?.annualEnergyBalanceKWh ?? 0)} kWh
                  </p>
                </div>
                <div className="py-4 text-center last:pb-0">
                  <p className={`${analysisMetricTitleClassName} text-center`}>{t("analysis.reserveRunPerYear")}</p>
                  <p className={`mt-2 text-center ${analysisMetricValueClassName}`}>
                    {formatNumber(visibleAnnualTotals?.annualSecondaryRuntimeHours ?? 0)} h
                  </p>
                </div>
              </div>
              <div className="divide-y divide-[var(--hg-hairline)] md:px-6">
                <div className="py-4 text-center first:pt-0">
                  <p className={`${analysisMetricTitleClassName} text-center`}>{t("analysis.fuelPerYear")}</p>
                  <p className={`mt-2 text-center ${analysisMetricValueClassName}`}>
                    {formatNumber(visibleAnnualTotals?.annualFuelConsumption ?? 0)} l
                  </p>
                </div>
                <div className="py-4 text-center last:pb-0">
                  <p className={`${analysisMetricTitleClassName} text-center`}>{t("analysis.fuelCostPerYear")}</p>
                  <p className={`mt-2 text-center ${analysisMetricValueClassName}`}>
                    {formatNumber(visibleAnnualTotals?.annualFuelCost ?? 0)} kr
                  </p>
                </div>
              </div>
            </div>

            <div className="divide-y divide-[var(--hg-hairline)] md:hidden">
              {[
                { label: t("analysis.solarPerYearShort"), value: `${formatNumber(visibleAnnualTotals?.annualSolarProductionKWh ?? 0)} kWh` },
                { label: t("analysis.loadPerYearShort"), value: `${formatNumber(visibleAnnualTotals?.annualLoadDemandKWh ?? 0)} kWh` },
                { label: t("analysis.balancePerYearShort"), value: `${formatNumber(visibleAnnualTotals?.annualEnergyBalanceKWh ?? 0)} kWh` },
                { label: t("analysis.reservePerYearShort"), value: `${formatNumber(visibleAnnualTotals?.annualSecondaryRuntimeHours ?? 0)} h` },
                { label: t("analysis.fuelPerYearShort"), value: `${formatNumber(visibleAnnualTotals?.annualFuelConsumption ?? 0)} l` },
                { label: t("analysis.fuelCostPerYearShort"), value: `${formatNumber(visibleAnnualTotals?.annualFuelCost ?? 0)} kr` },
              ].map((item) => (
                <div key={item.label} className="grid grid-cols-1 gap-1 py-3 first:pt-0 last:pb-0">
                  <p className={analysisMetricTitleClassName}>{item.label}</p>
                  <p className={analysisMetricValueClassName}>{item.value}</p>
                </div>
              ))}
            </div>

            <div className="mt-6">
              <EnergyOverviewChart
                rows={visibleMonthlyEnergyBalance}
                backupSource={
                  hasBackupSource
                    ? activeSecondarySource
                    : derivedResults.systemRecommendation.secondarySource === "NotComputed"
                      ? undefined
                      : derivedResults.systemRecommendation.secondarySource
                }
              />
            </div>
          </EditorialSection>

          <EditorialSection title={t("analysis.monthByMonth")}>
            <MonthlyTable rows={visibleMonthlyEnergyBalance} />
          </EditorialSection>

          <EditorialSection title={t("analysis.tocComparison")}>
            <div className="space-y-6">
              <div className="md:grid md:gap-0 md:grid-cols-2 md:divide-x md:divide-[var(--hg-hairline)]">
                {derivedResults.costComparison.alternatives.map((item, index) => (
                  <div
                    key={item.source}
                    className={`${index === 0 ? "pb-5 md:pb-0 md:pr-6" : "border-t border-[var(--hg-hairline)] pt-5 md:border-t-0 md:pt-0 md:pl-6"}`}
                  >
                    <CostCard item={item} />
                  </div>
                ))}
              </div>
            </div>
          </EditorialSection>

          {reportError ? <p className={`${analysisMetricValueClassName} text-[var(--hg-warn)]`}>{reportError}</p> : null}

          {showRecommendationContent && recommendation ? (
            <EditorialSection title={t("analysis.reasoningTitle")}>
              <ReasoningReportPanel
                sections={[
                  { title: t("analysis.reasoning"), text: measurementRecommendation?.mappedConditions ?? "" },
                  { title: t("analysis.recommendedMeasurement"), text: measurementRecommendation?.recommendedMethod ?? "" },
                  { title: t("analysis.unsuitableMeasurement"), text: measurementRecommendation?.unsuitableMethods ?? "" },
                  { title: t("analysis.additionalRequirements"), text: measurementRecommendation?.requirements ?? "" },
                  { title: t("analysis.operationsAdaptation"), text: operationsText }
                ]}
                sources={reasoningSources}
              />
            </EditorialSection>
          ) : null}
        </>
      ) : (
        <>
          {isGuidedMode && missingBlockers.length > 0 ? (
            <EditorialSection
              title={t("analysis.missingForFull")}
            >
              <div className="flex flex-wrap gap-3">
                {missingBlockers.map((blocker) => (
                  <NavLink key={blocker.label} to={blocker.path} className={blockerLinkClass}>
                    {`${blocker.label}: ${blocker.count} ${t("analysis.fields")}`}
                  </NavLink>
                ))}
              </div>
            </EditorialSection>
          ) : (
            <EditorialSection
              title="Klar for analyse"
            >
              <div className="flex flex-wrap gap-3">
                <NavLink to="/parametere" className={blockerLinkClass}>
                  Tekniske parametere
                </NavLink>
                <NavLink to="/komponenter" className={blockerLinkClass}>
                  Komponenter
                </NavLink>
              </div>
            </EditorialSection>
          )}
        </>
      )}
    </main>
  );
}
