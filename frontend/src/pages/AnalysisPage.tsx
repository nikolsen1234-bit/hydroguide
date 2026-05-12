import { useCallback, useMemo, useState } from "react";
import { NavLink } from "react-router-dom";
import { CostComparisonChart, EnergyOverviewChart } from "../components/SystemCharts";
import WorkspaceHeader, { WorkspaceHeaderActionButton, workspaceHeaderActionIcons } from "../components/WorkspaceHeader";
import EditorialSection from "../components/EditorialSection";
import KpiStrip from "../components/KpiStrip";
import { API_ENDPOINTS, STORAGE_KEYS } from "../constants";
import { useConfigurationContext } from "../context/ConfigurationContext";
import { useLanguage, translateDynamic } from "../i18n";
import {
  workspaceContentCategoryClassName,
  workspaceContentValueBaseClassName,
  workspaceContentValueClassName,
  workspaceOverlineClassName,
  workspacePageClassName,
  workspaceTitleClassName
} from "../styles/workspace";
import { BackupSourceName, CostComparisonItem, MonthlyEnergyBalanceRow, ValidationErrors } from "../types";
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
const QUESTION_KEY_RE = /^q\d+/i;
const ACCESS_HASH_RE = /^[a-f0-9]{64}$/;

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
function DetailGroupsPanel({
  groups
}: {
  groups: Array<{ title: string; items: string[]; emptyText: string }>;
}) {
  return (
    <div className="grid gap-6 md:grid-cols-3 md:gap-8">
      {groups.map((group, index) => (
        <div key={group.title} className={index === 0 ? "" : "md:border-l md:border-[var(--hg-hairline)] md:pl-8"}>
          <h3 className={analysisMetricTitleClassName}>{group.title}</h3>
          <div className="mt-3 space-y-2">
            {group.items.length === 0 ? (
              <p className={analysisMetricValueClassName}>{group.emptyText}</p>
            ) : (
              group.items.map((item, itemIndex) => (
                <div
                  key={`${group.title}-${itemIndex}`}
                  className="border-t border-[var(--hg-hairline)] pt-2 first:border-t-0 first:pt-0"
                >
                  <p className={analysisMetricValueClassName}>
                    {item.endsWith(".") ? item : `${item}.`}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>
      ))}
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
  const { t, language } = useLanguage();

  return (
    <div className="border-t border-[var(--hg-hairline)] pt-4 first:border-t-0 first:pt-0">
      <div className="flex items-center justify-between gap-3">
        <h3 className={analysisMetricTitleClassName}>{translateDynamic(item.source, language)}</h3>
        <p className={`${analysisMetricValueClassName} text-right`}>{formatNumber(item.totalOwnershipCost)} kr</p>
      </div>

      <div className="mt-3">
        <InfoRow label={t("analysis.purchase")} value={`${formatNumber(item.purchaseCost)} kr`} />
        <InfoRow label={t("analysis.fuelCostPerYearLabel")} value={`${formatNumber(item.operatingCostPerYear)} kr`} />
        <InfoRow label={t("analysis.maintenancePerYear")} value={`${formatNumber(item.annualMaintenance)} kr`} />
        <InfoRow label={t("analysis.evaluationHorizon")} value={`${formatNumber(item.evaluationHorizonYears)} ${t("main.year")}`} />
        <InfoRow label={t("analysis.fuelPerYearLabel")} value={`${formatNumber(item.annualFuelConsumption)} l`} />
        <InfoRow label={t("analysis.co2PerYear")} value={`${formatNumber(item.annualCo2)} kg`} />
      </div>
    </div>
  );
}

function LifetimePanel({ items }: { items: CostComparisonItem[] }) {
  const { t, language } = useLanguage();

  return (
    <div>
      <div className="grid gap-0 md:grid-cols-2 md:divide-x md:divide-[var(--hg-hairline)]">
        {items.map((item) => {
          const runtimeShare =
            item.technicalLifetimeHours > 0 ? (item.totalRuntimeHours / item.technicalLifetimeHours) * 100 : null;

          return (
            <div key={item.source} className="md:px-6 md:first:pl-0 md:last:pr-0">
              <div className="flex items-center justify-between gap-3">
                <h3 className={analysisMetricTitleClassName}>{translateDynamic(item.source, language)}</h3>
                <p className={`${analysisMetricValueClassName} text-right`}>{formatNumber(item.evaluationHorizonYears)} {t("analysis.yearsAnalysis")}</p>
              </div>

              <div className="mt-3">
                <InfoRow label={t("analysis.totalRuntime")} value={`${formatNumber(item.totalRuntimeHours)} t`} />
                <InfoRow label={t("analysis.technicalLifetime")} value={`${formatNumber(item.technicalLifetimeHours)} t`} />
                {runtimeShare !== null ? (
                  <InfoRow label={t("analysis.usedLifetime")} value={`${formatNumber(runtimeShare)} %`} />
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ReserveSourceToggle({ value, onChange }: { value: BackupSourceName; onChange: (v: BackupSourceName) => void }) {
  const options: BackupSourceName[] = ["FuelCell", "DieselGenerator"];
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

export default function AnalysisPage() {
  const { t, language } = useLanguage();
  const d = (value: string) => translateDynamic(value, language);
  const { activeDraft, saveDraft, saveDraftMetadata } = useConfigurationContext();
  const [reserveSourceOverrides, setReserveSourceOverrides] = useState<Partial<Record<string, BackupSourceName>>>({});
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
        QUESTION_KEY_RE.test(key)),
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
  const recommendedReserveSource: BackupSourceName =
    derivedResults?.systemRecommendation.secondarySource === "FuelCell" ? "FuelCell" : "DieselGenerator";
  const activeReserveSource = reserveSourceOverrides[activeDraft.id] ?? recommendedReserveSource;
  const handleReserveSourceChange = useCallback(
    (value: BackupSourceName) => {
      setReserveSourceOverrides((current) =>
        current[activeDraft.id] === value ? current : { ...current, [activeDraft.id]: value }
      );
    },
    [activeDraft.id]
  );

  const activeReserveScenario = derivedResults
    ? activeReserveSource === "FuelCell"
      ? derivedResults.reserveScenarios.fuelCell
      : derivedResults.reserveScenarios.diesel
    : null;

  const visibleMonthlyEnergyBalance =
    hasBackupSource && activeReserveScenario
      ? activeReserveScenario.monthlyEnergyBalance
      : derivedResults?.monthlyEnergyBalance ?? [];
  const visibleAnnualTotals =
    hasBackupSource && activeReserveScenario ? activeReserveScenario.annualTotals : derivedResults?.annualTotals ?? null;
  const visibleSecondarySourcePowerW =
    hasBackupSource && activeReserveScenario
      ? activeReserveScenario.secondarySourcePowerW
      : derivedResults?.systemRecommendation.secondarySourcePowerW ?? 0;
  const visibleReserveSourceValue =
    hasBackupSource ? activeReserveSource : derivedResults?.systemRecommendation.secondarySource ?? "NotComputed";

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
        activeReserveSource,
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
        activeReserveSource,
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

  const foundationBlockers =
    isGuidedMode && (!foundationReady || !recommendation) && usesFoundationQuestions
      ? [
          {
            label: t("main.title"),
            path: "/prosjektgrunnlag",
            count: countMatchingErrors(foundationErrors, foundationErrorPredicate)
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
      )
    },
    {
      label: t("analysis.powerLabel"),
      path: "/komponenter",
      count: countMatchingErrors(detailErrors, (key) => key.startsWith("equipmentRows."))
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

  const reserveSummaryItems = derivedResults
    ? [
        { label: t("analysis.reserveSource"), value: d(visibleReserveSourceValue) },
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

  const recommendationSection =
    showRecommendationContent && recommendation && solutionLead ? (
      <div>
        <h2 className={`max-w-3xl ${workspaceTitleClassName}`}>{solutionLead.title}</h2>
        {(solutionLead.detail || solutionLead.profile) && (
          <div className={`mt-1 max-w-3xl space-y-2 ${workspaceContentValueClassName}`}>
            {solutionLead.detail ? (
              <p>
                <span className={analysisMetricValueBaseClassName}>{t("analysis.execution")}</span> {solutionLead.detail}.
              </p>
            ) : null}
            {solutionLead.profile ? (
              <p>
                <span className={analysisMetricValueBaseClassName}>{t("analysis.profile")}</span> {solutionLead.profile}.
              </p>
            ) : null}
          </div>
        )}
      </div>
    ) : null;

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

      <KpiStrip items={[
        {
          kicker: "ENERGIBALANSE",
          value: visibleAnnualTotals
            ? formatNumber(visibleAnnualTotals.annualEnergyBalanceKWh, 0)
            : "-",
          unit: "kWh",
        },
        { kicker: "FORBRUK", value: visibleAnnualTotals ? formatNumber(visibleAnnualTotals.annualLoadDemandKWh, 0) : "-", unit: "kWh" },
        { kicker: "RESERVEDRIFT", value: visibleAnnualTotals ? formatNumber(visibleAnnualTotals.annualSecondaryRuntimeHours, 0) : "-", unit: "t" },
        { kicker: "BATTERIAUTONOMI", value: derivedResults ? formatNumber(derivedResults.systemRecommendation.batteryAutonomyDays, 1) : "-", unit: "dager" },
      ]} />

      {derivedResults ? (
        <>
          {showRecommendationContent ? recommendationSection : null}

          <EditorialSection
            title={t("analysis.systemAndReserve")}
            description={t("analysis.systemAndReserveDesc")}
            actions={hasBackupSource ? <ReserveSourceToggle value={activeReserveSource} onChange={handleReserveSourceChange} /> : undefined}
          >
            {isGuidedMode ? (
              <div className="grid gap-6 lg:grid-cols-2 lg:gap-0 lg:divide-x lg:divide-[var(--hg-hairline)]">
                <InfoColumn title={t("analysis.system")} items={systemSummaryItems} className="lg:pr-8" />
                <InfoColumn title={t("analysis.reserve")} items={reserveSummaryItems} className="lg:pl-8" />
              </div>
            ) : (
              <InfoColumn title={t("analysis.reserve")} items={reserveSummaryItems} />
            )}
          </EditorialSection>

          <EditorialSection
            title={t("analysis.energyAndConsumption")}
            description={t("analysis.energyAndConsumptionDesc")}
          >
            <div className="hidden md:grid md:grid-cols-3 md:divide-x md:divide-[var(--hg-hairline)]">
              <div className="divide-y divide-[var(--hg-hairline)] md:px-6">
                <div className="py-4 text-center first:pt-0">
                  <p className={`${analysisMetricTitleClassName} text-center`}>{t("analysis.solarPerYear")}</p>
                  <p className={`mt-2 text-center ${analysisMetricValueClassName}`}>
                    {formatNumber(visibleAnnualTotals?.annualSolarProductionKWh ?? 0)} kWh
                  </p>
                </div>
                <div className="py-4 text-center">
                  <p className={`${analysisMetricTitleClassName} text-center`}>{t("analysis.reserveProductionPerYear")}</p>
                  <p className={`mt-2 text-center ${analysisMetricValueClassName}`}>
                    {formatNumber(
                      ((visibleAnnualTotals?.annualSecondaryRuntimeHours ?? 0) * visibleSecondarySourcePowerW) / 1000
                    )} kWh
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
                { label: t("analysis.reserveProductionPerYearShort"), value: `${formatNumber(((visibleAnnualTotals?.annualSecondaryRuntimeHours ?? 0) * visibleSecondarySourcePowerW) / 1000)} kWh` },
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
                    ? activeReserveSource
                    : derivedResults.systemRecommendation.secondarySource === "NotComputed"
                      ? undefined
                      : derivedResults.systemRecommendation.secondarySource
                }
              />
            </div>
          </EditorialSection>

          <EditorialSection
            title={t("analysis.monthByMonth")}
            description={t("analysis.monthByMonthDesc")}
          >
            <MonthlyTable rows={visibleMonthlyEnergyBalance} />
          </EditorialSection>

          <EditorialSection
            title={t("analysis.reserveLifetime")}
            description={t("analysis.reserveLifetimeDesc")}
          >
            <LifetimePanel items={derivedResults.costComparison.alternatives} />
          </EditorialSection>

          <EditorialSection
            title={t("analysis.tocComparison")}
            description={t("analysis.tocComparisonDesc")}
          >
            <div className="space-y-6">
              <CostComparisonChart items={derivedResults.costComparison.alternatives} />

              <div className="border-t border-[var(--hg-hairline)] pt-5 md:grid md:gap-0 md:grid-cols-2 md:divide-x md:divide-[var(--hg-hairline)]">
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

          {showRecommendationContent && recommendation ? (
            <EditorialSection
              title={t("analysis.reasoningTitle")}
              description={t("analysis.reasoningDesc")}
            >
              <div>
                <DetailGroupsPanel
                  groups={[
                    {
                      title: t("analysis.reasoning"),
                      items: recommendation.justification.map(d),
                      emptyText: t("analysis.noReasoning")
                    },
                    {
                      title: t("analysis.additionalRequirements"),
                      items: recommendation.additionalRequirements.map(d),
                      emptyText: t("analysis.noAdditionalReq")
                    },
                    {
                      title: t("analysis.operationsAdaptation"),
                      items: derivedResults.systemRecommendation.operationsRequirements.map(d),
                      emptyText: t("analysis.noOperationsReq")
                    }
                  ]}
                />
              </div>
            </EditorialSection>
          ) : null}

          {reportError ? <p className={`${analysisMetricValueClassName} text-[var(--hg-warn)]`}>{reportError}</p> : null}
        </>
      ) : (
        <>
          {showRecommendationContent ? recommendationSection : null}

          {isGuidedMode && missingBlockers.length > 0 ? (
            <EditorialSection
              title={t("analysis.missingForFull")}
              description={t("analysis.missingForFullDesc")}
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
                  Tekniske parameterar
                </NavLink>
                <NavLink to="/komponenter" className={blockerLinkClass}>
                  Komponentar
                </NavLink>
              </div>
            </EditorialSection>
          )}
        </>
      )}
    </main>
  );
}
