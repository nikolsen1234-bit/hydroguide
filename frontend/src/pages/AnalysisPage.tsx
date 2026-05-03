import { useEffect, useMemo, useRef, useState } from "react";
import { NavLink } from "react-router-dom";
import { useCallback } from "react";
import { CostComparisonChart, EnergyOverviewChart } from "../components/SystemCharts";
import { HorizonChart } from "../components/HorizonChart";
import { PanoramicHorizon } from "../components/PanoramicHorizon";
import { SolarPositionChart } from "../components/SolarPositionChart";
import { BatteryFrequencyChart, SocHistogramChart, ReliabilityKPIPanel } from "../components/ReliabilityCharts";
import { useHorizonProfile } from "../lib/horizonStore";
import { fetchHourlyClimateYear } from "../lib/metClient";
import { hourlyIrradianceForYear } from "../lib/solarEngine";
import { simulateBattery, computeReliabilityMetrics } from "../lib/batterySimulator";
import type { ReliabilityMetrics } from "../types";
import WorkspaceActions from "../components/WorkspaceActions";
import WorkspaceHeader from "../components/WorkspaceHeader";
import WorkspaceSection from "../components/WorkspaceSection";
import { API_ENDPOINTS, STORAGE_KEYS } from "../constants";
import { useConfigurationContext } from "../context/ConfigurationContext";
import { useLanguage, translateDynamic } from "../i18n";
import {
  workspaceBodyClassName,
  workspaceBodyStrongClassName,
  workspaceMetaClassName,
  workspacePageClassName,
  workspaceSectionTitleClassName,
  workspaceSubsectionTitleClassName,
  workspaceTitleClassName
} from "../styles/workspace";
import { BackupSourceName, CostComparisonItem, MonthlyEnergyBalanceRow, ValidationErrors } from "../types";
import { formatNumber } from "../utils/format";
import { buildAiReportPayload, openReportWindow } from "../utils/report";
import { calculateRecommendation } from "../utils/recommendation";
import { calculateConfigurationOutputs } from "../utils/systemResults";
import { validateConfiguration } from "../utils/validation";

const blockerLinkClass =
  "rounded-xl border border-brand-200 bg-brand-50 px-4 py-2 text-sm font-semibold text-brand-700 transition hover:bg-brand-100";

const workspaceMetaDetailClassName = `${workspaceMetaClassName} normal-case tracking-normal text-slate-950`;

const ROBUST_PREFIX_RE = /^Robust\s+/i;
const ROBUST_VARIANT_RE = / med robust utforming/i;
const ROBUST_RELEASE_RE = /robust slipp-løysing/i;
const ROBUST_REGULATION_RE = /robust reguleringskum/i;
const WHITESPACE_RE = /\s+/g;
const MAIN_SOLUTION_PARTS_RE = /^(.*?)(?: med (.*?))?(?: \((.*)\))?$/;
const QUESTION_KEY_RE = /^q\d+/i;

async function getAiExportHash(promptText: string) {
  const storedHash = window.sessionStorage.getItem(STORAGE_KEYS.AI_EXPORT_HASH);
  if (storedHash) {
    return storedHash;
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
  value,
  emphasize = "value"
}: {
  label: string;
  value: string;
  emphasize?: "label" | "value";
}) {
  const labelClassName =
    emphasize === "label" ? `${workspaceSubsectionTitleClassName}` : `${workspaceBodyClassName} text-slate-950`;
  const valueClassName =
    emphasize === "label"
      ? `text-[12.6875px] leading-6 text-right text-slate-700 [overflow-wrap:anywhere]`
      : `text-[12.6875px] leading-6 font-semibold text-right text-slate-950 [overflow-wrap:anywhere]`;

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-4 border-t border-slate-200 py-3 first:border-t-0 first:pt-0 last:pb-0">
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
    .replace(ROBUST_RELEASE_RE, "passiv slipp-løysing")
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
  className = "",
  emphasize = "value"
}: {
  title: string;
  items: Array<{ label: string; value: string }>;
  className?: string;
  emphasize?: "label" | "value";
}) {
  return (
    <div className={className}>
      <h3 className={workspaceSubsectionTitleClassName}>{title}</h3>
      <div className="mt-3">
        {items.map((item) => (
          <InfoRow key={item.label} label={item.label} value={item.value} emphasize={emphasize} />
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
        <div key={group.title} className={index === 0 ? "" : "md:border-l md:border-slate-200 md:pl-8"}>
          <h3 className={workspaceSubsectionTitleClassName}>{group.title}</h3>
          <div className="mt-3 space-y-2">
            {group.items.length === 0 ? (
              <p className={workspaceBodyClassName}>{group.emptyText}</p>
            ) : (
              group.items.map((item, itemIndex) => (
                <div
                  key={`${group.title}-${itemIndex}`}
                  className="border-t border-slate-200 pt-2 first:border-t-0 first:pt-0"
                >
                  <p className={`${workspaceBodyClassName} text-slate-950`}>
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
      <div className="hidden overflow-hidden rounded-lg border border-slate-200 lg:block">
        <table className="w-full table-fixed divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50">
            <tr className="text-left text-[0.935rem] leading-6 text-slate-950 sm:text-[0.98rem] font-semibold">
              <th className="px-4 py-3">{t("analysis.month")}</th>
              <th className="px-4 py-3 text-right">{t("analysis.sun")}</th>
              <th className="px-4 py-3 text-right">{t("analysis.load")}</th>
              <th className="px-4 py-3 text-right">{t("analysis.balance")}</th>
              <th className="px-4 py-3 text-right">{t("analysis.fuel")}</th>
              <th className="px-4 py-3 text-right">{t("analysis.cost")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 bg-white">
            {rows.map((row) => (
              <tr key={row.month}>
                <td className="px-4 py-3">
                  <p className="text-[0.935rem] leading-6 text-slate-950 sm:text-[0.98rem] font-semibold">{t(`month.${row.month}`)}</p>
                  <p className="text-xs text-slate-500">{row.daysInMonth} {t("analysis.days")}</p>
                </td>
                <td className="px-4 py-3 text-right text-slate-700">{formatNumber(row.solarProductionKWh)} kWh</td>
                <td className="px-4 py-3 text-right text-slate-700">{formatNumber(row.loadDemandKWh)} kWh</td>
                <td
                  className={`px-4 py-3 text-right font-semibold ${
                    row.energyBalanceKWh >= 0 ? "text-emerald-700" : "text-orange-700"
                  }`}
                >
                  {formatNumber(row.energyBalanceKWh)} kWh
                </td>
                <td className="px-4 py-3 text-right text-slate-700">{formatNumber(row.fuelLiters)} l</td>
                <td className="px-4 py-3 text-right text-slate-700">{formatNumber(row.fuelCost)} kr</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="-mx-4 overflow-x-auto lg:hidden">
        <table className="w-full min-w-[540px] divide-y divide-slate-200 text-sm">
          <thead>
            <tr className="text-left text-[0.935rem] leading-6 text-slate-950 sm:text-[0.98rem] font-semibold">
              <th className="sticky left-0 bg-white px-4 py-3">{t("analysis.month")}</th>
              <th className="px-3 py-3 text-right">{t("analysis.sun")}</th>
              <th className="px-3 py-3 text-right">{t("analysis.load")}</th>
              <th className="px-3 py-3 text-right">{t("analysis.balance")}</th>
              <th className="px-3 py-3 text-right">{t("analysis.fuel")}</th>
              <th className="px-3 py-3 text-right pr-4">{t("analysis.cost")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 bg-white">
            {rows.map((row) => (
              <tr key={row.month}>
                <td className="sticky left-0 bg-white px-4 py-2.5">
                  <p className="text-[0.935rem] leading-6 text-slate-950 sm:text-[0.98rem] font-semibold">{t(`month.${row.month}`)}</p>
                  <p className={workspaceMetaDetailClassName}>{row.daysInMonth} d</p>
                </td>
                <td className="whitespace-nowrap px-3 py-2.5 text-right text-slate-950">{formatNumber(row.solarProductionKWh)} kWh</td>
                <td className="whitespace-nowrap px-3 py-2.5 text-right text-slate-950">{formatNumber(row.loadDemandKWh)} kWh</td>
                <td
                  className={`whitespace-nowrap px-3 py-2.5 text-right font-semibold ${
                    row.energyBalanceKWh >= 0 ? "text-brand-700" : "text-rose-700"
                  }`}
                >
                  {formatNumber(row.energyBalanceKWh)} kWh
                </td>
                <td className="whitespace-nowrap px-3 py-2.5 text-right text-slate-950">{formatNumber(row.fuelLiters)} l</td>
                <td className="whitespace-nowrap px-3 py-2.5 text-right pr-4 text-slate-950">{formatNumber(row.fuelCost)} kr</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function CostCard({ item }: { item: CostComparisonItem }) {
  const { t, language } = useLanguage();

  return (
    <div className="border-t border-slate-200 pt-4 first:border-t-0 first:pt-0">
      <div className="flex items-center justify-between gap-3">
        <h3 className={workspaceSubsectionTitleClassName}>{translateDynamic(item.source, language)}</h3>
        <p className={workspaceSubsectionTitleClassName}>{formatNumber(item.toc)} kr</p>
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
      <div className="grid gap-0 md:grid-cols-2 md:divide-x md:divide-slate-200">
        {items.map((item) => {
          const runtimeShare =
            item.technicalLifetimeHours > 0 ? (item.totalRuntimeHours / item.technicalLifetimeHours) * 100 : null;

          return (
            <div key={item.source} className="md:px-6 md:first:pl-0 md:last:pr-0">
              <div className="flex items-center justify-between gap-3">
                <h3 className={workspaceSubsectionTitleClassName}>{translateDynamic(item.source, language)}</h3>
                <p className="text-sm font-semibold text-slate-500">{formatNumber(item.evaluationHorizonYears)} {t("analysis.yearsAnalysis")}</p>
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

function ReserveSourceToggle({
  value,
  onChange
}: {
  value: BackupSourceName;
  onChange: (value: BackupSourceName) => void;
}) {
  const options: BackupSourceName[] = ["Brenselcelle", "Dieselaggregat"];

  const { t, language } = useLanguage();

  return (
    <div className="flex flex-col gap-2 sm:items-end">
      <p className="text-[0.935rem] leading-6 text-slate-950 sm:text-[0.98rem] font-semibold text-slate-950">{t("analysis.reserveSourceForDisplay")}</p>
      <div className="flex w-full rounded-full border border-slate-200 p-1 sm:inline-flex sm:w-auto">
        {options.map((option) => {
          const selected = value === option;

          return (
            <button
              key={option}
              type="button"
              onClick={() => onChange(option)}
              aria-pressed={selected}
              className={`flex-1 rounded-full px-3.5 py-1.5 text-sm font-semibold transition sm:flex-initial ${
                selected ? "bg-slate-900 text-white" : "text-slate-950 hover:bg-slate-50 hover:text-slate-950"
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
  const { activeDraft, resetDraft, saveDraft, saveDraftMetadata } = useConfigurationContext();
  const [, setErrors] = useState<ValidationErrors>({});
  const [reserveSourceOverrides, setReserveSourceOverrides] = useState<Partial<Record<string, BackupSourceName>>>({});
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);
  const horizonProfile = useHorizonProfile();
  const [reliabilityMetrics, setReliabilityMetrics] = useState<ReliabilityMetrics | null>(null);
  const [reliabilityRunning, setReliabilityRunning] = useState(false);
  const [reliabilityError, setReliabilityError] = useState<string | null>(null);
  const lastReliabilityRunKeyRef = useRef<string | null>(null);
  const autonomyResultLabel =
    activeDraft.systemParameters.batteryMode === "ah" ? t("analysis.autonomyFromBattery") : t("analysis.autonomy");
  const engineMode = activeDraft.engineMode ?? "standard";
  const isCalculatorMode = engineMode === "standard";
  const isGuidedMode = !isCalculatorMode;
  const showAdvancedSimulation = engineMode === "detailed" || engineMode === "combined";
  const showReliabilitySimulation = showAdvancedSimulation;
  const showHorizonProfile = showAdvancedSimulation;
  const usesFoundationQuestions = isGuidedMode;

  const allValidationErrors = useMemo(() => validateConfiguration(activeDraft), [activeDraft]);
  const foundationErrorPredicate = useCallback(
    (key: string) =>
      usesFoundationQuestions &&
      (key === "other.evaluationHorizonYears" ||
        key === "systemParameters.inspectionsPerYear" ||
        key === "systemParameters.4gCoverage" ||
        key === "systemParameters.nbIotCoverage" ||
        key === "systemParameters.lineOfSightUnder15km" ||
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
        ? calculateRecommendation(activeDraft.answers, activeDraft.systemParameters.inspectionsPerYear)
        : null,
    [activeDraft.answers, activeDraft.systemParameters.inspectionsPerYear, foundationReady, isGuidedMode]
  );

  const liveOutputs = useMemo(
    () => (foundationReady && hasSystemDetails ? calculateConfigurationOutputs(activeDraft) : null),
    [activeDraft, foundationReady, hasSystemDetails]
  );

  const recommendation = isGuidedMode ? liveOutputs?.recommendation ?? liveRecommendation : null;
  const derivedResults = liveOutputs?.derivedResults ?? null;
  const hasBackupSource = activeDraft.systemParameters.hasBackupSource === true;
  const recommendedReserveSource: BackupSourceName =
    derivedResults?.systemRecommendation.secondarySource === "Brenselcelle" ? "Brenselcelle" : "Dieselaggregat";
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
    ? activeReserveSource === "Brenselcelle"
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
    hasBackupSource ? activeReserveSource : derivedResults?.systemRecommendation.secondarySource ?? "Ikkje berekna";

  const handleSave = () => {
    if (foundationReady && hasSystemDetails) {
      saveDraft();
      return;
    }

    saveDraftMetadata();
  };

  const handleReset = () => {
    resetDraft();
    setErrors({});
  };

  const handleGenerateReport = async () => {
    if (!derivedResults || !recommendation || !visibleAnnualTotals || isGeneratingReport) {
      return;
    }

    setIsGeneratingReport(true);
    setReportError(null);
    let aiRecommendationText: string | null = null;

    try {
      const tilgangskodeHash = await getAiExportHash(t("analysis.aiReportAccessCode"));
      if (!tilgangskodeHash) {
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
          tilgangskodeHash
        })
      });
      const responseBody = (await response.json().catch(() => null)) as { error?: string; text?: string } | null;

      if (response.status === 403) {
        window.sessionStorage.removeItem(STORAGE_KEYS.AI_EXPORT_HASH);
        throw new Error(responseBody?.error || "Ugyldig tilgangskode.");
      }

      if (!response.ok || !responseBody?.text?.trim()) {
        throw new Error(responseBody?.error || "AI-generering feila.");
      }

      aiRecommendationText = responseBody.text.trim();
      openReportWindow(
        activeDraft,
        recommendation,
        aiRecommendationText,
        derivedResults,
        activeReserveSource,
        visibleAnnualTotals,
        visibleMonthlyEnergyBalance
      );
    } catch (error) {
      setReportError(error instanceof Error ? error.message : "Ukjend feil.");
    }

    if (!aiRecommendationText) {
      setIsGeneratingReport(false);
      return;
    }

    setIsGeneratingReport(false);
  };

  const reliabilityCanRun =
    showReliabilitySimulation &&
    Boolean(derivedResults) &&
    activeDraft.solarRadiationSettings.mode === "auto" &&
    activeDraft.solarRadiationSettings.lat !== "" &&
    activeDraft.solarRadiationSettings.lon !== "" &&
    activeDraft.solarRadiationSettings.tilt !== "" &&
    activeDraft.solarRadiationSettings.azimuth !== "" &&
    activeDraft.solar.panelPowerWp !== "" &&
    activeDraft.solar.panelCount !== "" &&
    activeDraft.solar.systemEfficiency !== "" &&
    activeDraft.battery.nominalVoltage !== "" &&
    activeDraft.battery.maxDepthOfDischarge !== "" &&
    !reliabilityRunning;

  const reliabilityRunKey = useMemo(() => {
    if (!showReliabilitySimulation || !derivedResults) {
      return null;
    }

    return JSON.stringify({
      draftId: activeDraft.id,
      mode: activeDraft.solarRadiationSettings.mode,
      lat: activeDraft.solarRadiationSettings.lat,
      lon: activeDraft.solarRadiationSettings.lon,
      tilt: activeDraft.solarRadiationSettings.tilt,
      azimuth: activeDraft.solarRadiationSettings.azimuth,
      heightOffset: activeDraft.solarRadiationSettings.heightOffset,
      panelPowerWp: activeDraft.solar.panelPowerWp,
      panelCount: activeDraft.solar.panelCount,
      systemEfficiency: activeDraft.solar.systemEfficiency,
      voltage: activeDraft.battery.nominalVoltage,
      maxDepthOfDischarge: activeDraft.battery.maxDepthOfDischarge,
      batteryCapacityAh: derivedResults.systemRecommendation.batteryCapacityAh,
      totalWhPerDay: derivedResults.totalWhPerDay,
      hasBackupSource,
      activeReserveSource,
    });
  }, [
    activeDraft.battery.maxDepthOfDischarge,
    activeDraft.battery.nominalVoltage,
    activeDraft.id,
    activeDraft.solar.panelCount,
    activeDraft.solar.panelPowerWp,
    activeDraft.solar.systemEfficiency,
    activeDraft.solarRadiationSettings.azimuth,
    activeDraft.solarRadiationSettings.heightOffset,
    activeDraft.solarRadiationSettings.lat,
    activeDraft.solarRadiationSettings.lon,
    activeDraft.solarRadiationSettings.mode,
    activeDraft.solarRadiationSettings.tilt,
    derivedResults,
    showReliabilitySimulation,
    hasBackupSource,
    activeReserveSource,
  ]);

  const runReliabilitySimulation = async () => {
    if (!showReliabilitySimulation || !derivedResults) {
      return;
    }

    setReliabilityRunning(true);
    setReliabilityError(null);
    setReliabilityMetrics(null);

    try {
      const s = activeDraft.solarRadiationSettings;
      const lat = Number(s.lat);
      const lon = Number(s.lon);
      const tilt = Number(s.tilt);
      const azimuth = Number(s.azimuth);
      const heightOffset = s.heightOffset !== "" ? Number(s.heightOffset) : 0;

      const panelPowerWp = Number(activeDraft.solar.panelPowerWp);
      const panelCount = Number(activeDraft.solar.panelCount);
      const systemEfficiency = Number(activeDraft.solar.systemEfficiency);

      const voltage = Number(activeDraft.battery.nominalVoltage);
      const maxDoD = Number(activeDraft.battery.maxDepthOfDischarge);

      const batteryCapacityAh = derivedResults.systemRecommendation.batteryCapacityAh;
      const batteryCapacityWh = batteryCapacityAh * voltage;

      const totalWhPerDay = derivedResults.totalWhPerDay;
      const loadWhPerHour = totalWhPerDay / 24;

      if (batteryCapacityWh <= 0 || loadWhPerHour <= 0) {
        setReliabilityError("Batteri- og lastdata manglar. Lagre konfigurasjonen fyrst.");
        setReliabilityRunning(false);
        return;
      }

      const climate = await fetchHourlyClimateYear(lat, lon);
      const { generateHorizonProfile } = await import("../lib/horizonProfile");
      const hp = horizonProfile ?? await generateHorizonProfile(lat, lon, heightOffset);

      const irradiance = hourlyIrradianceForYear({
        latDeg: lat,
        lonDeg: lon,
        tiltDeg: tilt,
        orientDeg: azimuth,
        hourlyGhi: climate.ghi,
        hourlyDhi: climate.dhi,
        hourlyTemp: climate.temperature,
        hourlyWind: climate.windSpeed,
        numHours: climate.length,
        year: climate.year,
        utcDayOfYear: climate.utcDayOfYear,
        utcHour: climate.utcHour,
        horizonProfile: hp
      });

      // Resolve backup source config for the reliability simulation
      const backupSourceConfig = hasBackupSource
        ? activeReserveSource === "Brenselcelle"
          ? activeDraft.fuelCell
          : activeDraft.diesel
        : null;

      const sim = simulateBattery({
        hourlyGtiWm2: irradiance.gtiWm2,
        hourlyEfficiency: irradiance.efficiency,
        panelCount,
        panelPowerWp,
        systemEfficiency,
        batteryCapacityWh,
        maxDepthOfDischarge: maxDoD,
        loadWhPerHour,
        numHours: climate.length,
        year: climate.year,
        hasBackupSource,
        backupPowerW: backupSourceConfig ? Number(backupSourceConfig.powerW) || 0 : 0,
        backupFuelPerKWh: backupSourceConfig ? Number(backupSourceConfig.fuelConsumptionPerKWh) || 0 : 0,
      });

      setReliabilityMetrics(computeReliabilityMetrics(sim, batteryCapacityWh, maxDoD, loadWhPerHour));
    } catch (e) {
      setReliabilityError(e instanceof Error ? e.message : "Ukjend feil under simulering.");
    } finally {
      setReliabilityRunning(false);
    }
  };

  useEffect(() => {
    if (!showReliabilitySimulation) {
      lastReliabilityRunKeyRef.current = null;
      setReliabilityMetrics(null);
      setReliabilityError(null);
      setReliabilityRunning(false);
      return;
    }

    if (!reliabilityCanRun || !reliabilityRunKey) {
      return;
    }

    if (lastReliabilityRunKeyRef.current === reliabilityRunKey) {
      return;
    }

    lastReliabilityRunKeyRef.current = reliabilityRunKey;
    void runReliabilitySimulation();
  }, [reliabilityCanRun, reliabilityRunKey, showReliabilitySimulation]);

  if (isGuidedMode && (!foundationReady || !recommendation)) {
    const blockers = usesFoundationQuestions
      ? [
          {
            label: t("main.title"),
            path: "/parametere",
            count: countMatchingErrors(foundationErrors, foundationErrorPredicate)
          }
        ].filter((item) => item.count > 0)
      : [];

    return (
      <main className={workspacePageClassName}>
        <WorkspaceHeader title={t("analysis.title")} />

        <WorkspaceSection
          title={t("analysis.recommendation")}
          description={t("analysis.completeData")}
        >
          <div className="space-y-4">
            <div className="flex flex-wrap gap-3">
              {blockers.map((blocker) => (
                <NavLink key={blocker.label} to={blocker.path} className={blockerLinkClass}>
                  {`${blocker.label}: ${blocker.count} ${t("analysis.fields")}`}
                </NavLink>
              ))}
            </div>
            <div className={`border-t border-slate-200 pt-4 ${workspaceBodyClassName} text-slate-950`}>
              {t("analysis.resultPageOpen")}
            </div>
          </div>
        </WorkspaceSection>

        <WorkspaceActions onReset={handleReset} onSave={handleSave} />
      </main>
    );
  }

  const solutionLead = recommendation ? splitMainSolution(d(recommendation.hovudloysing)) : null;
  const detailBlockers = [
    {
      label: t("analysis.technicalParameters"),
      path: "/system",
      count: countMatchingErrors(
        detailErrors,
        (key) =>
          key.startsWith("systemParameters.") ||
          key.startsWith("solar.") ||
          key.startsWith("solarRadiationSettings.") ||
          key.startsWith("battery.") ||
          key.startsWith("fuelCell.") ||
          key.startsWith("diesel.") ||
          key.startsWith("other.") ||
          key.startsWith("monthlySolarRadiation.")
      )
    },
    {
      label: t("analysis.powerLabel"),
      path: "/effektbudsjett",
      count: countMatchingErrors(detailErrors, (key) => key.startsWith("equipmentRows."))
    }
  ].filter((item) => item.count > 0);

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

  const recommendationSection =
    showRecommendationContent && recommendation && solutionLead ? (
      <div>
        <h2 className={`max-w-3xl ${workspaceTitleClassName}`}>{solutionLead.title}</h2>
        {(solutionLead.detail || solutionLead.profile) && (
          <div className="mt-1 max-w-3xl space-y-2 text-[0.935rem] leading-6 text-slate-950 sm:text-[0.98rem]">
            {solutionLead.detail ? (
              <p>
                <span className="font-semibold text-slate-950">{t("analysis.execution")}</span> {solutionLead.detail}.
              </p>
            ) : null}
            {solutionLead.profile ? (
              <p>
                <span className="font-semibold text-slate-950">{t("analysis.profile")}</span> {solutionLead.profile}.
              </p>
            ) : null}
          </div>
        )}
      </div>
    ) : null;

  return (
    <main className={workspacePageClassName}>
      <WorkspaceHeader title={t("analysis.title")} />

      {derivedResults ? (
        <>
          {showRecommendationContent ? recommendationSection : null}

          <WorkspaceSection
            title={t("analysis.systemAndReserve")}
            description={t("analysis.systemAndReserveDesc")}
            actions={hasBackupSource ? <ReserveSourceToggle value={activeReserveSource} onChange={handleReserveSourceChange} /> : undefined}
          >
            {isGuidedMode ? (
              <div className="grid gap-6 lg:grid-cols-2 lg:gap-0 lg:divide-x lg:divide-slate-200">
                <InfoColumn title={t("analysis.system")} items={systemSummaryItems} className="lg:pr-8" emphasize="label" />
                <InfoColumn title={t("analysis.reserve")} items={reserveSummaryItems} className="lg:pl-8" emphasize="label" />
              </div>
            ) : (
              <InfoColumn title={t("analysis.reserve")} items={reserveSummaryItems} emphasize="label" />
            )}
          </WorkspaceSection>

          <WorkspaceSection
            title={t("analysis.energyAndConsumption")}
            description={t("analysis.energyAndConsumptionDesc")}
          >
            <div className="hidden md:grid md:grid-cols-3 md:divide-x md:divide-slate-200">
              <div className="divide-y divide-slate-200 md:px-6">
                <div className="py-4 text-center first:pt-0">
                  <p className={`${workspaceSubsectionTitleClassName} text-center`}>{t("analysis.solarPerYear")}</p>
                  <p className="mt-2 text-[12.6875px] leading-6 text-center text-slate-700 [overflow-wrap:anywhere]">
                    {formatNumber(visibleAnnualTotals?.annualSolarProductionKWh ?? 0)} kWh
                  </p>
                </div>
                <div className="py-4 text-center last:pb-0">
                  <p className={`${workspaceSubsectionTitleClassName} text-center`}>{t("analysis.loadPerYear")}</p>
                  <p className="mt-2 text-[12.6875px] leading-6 text-center text-slate-700 [overflow-wrap:anywhere]">
                    {formatNumber(visibleAnnualTotals?.annualLoadDemandKWh ?? 0)} kWh
                  </p>
                </div>
              </div>
              <div className="divide-y divide-slate-200 md:px-6">
                <div className="py-4 text-center first:pt-0">
                  <p className={`${workspaceSubsectionTitleClassName} text-center`}>{t("analysis.energyBalancePerYear")}</p>
                  <p className="mt-2 text-[12.6875px] leading-6 text-center text-slate-700 [overflow-wrap:anywhere]">
                    {formatNumber(visibleAnnualTotals?.annualEnergyBalanceKWh ?? 0)} kWh
                  </p>
                </div>
                <div className="py-4 text-center last:pb-0">
                  <p className={`${workspaceSubsectionTitleClassName} text-center`}>{t("analysis.reserveRunPerYear")}</p>
                  <p className="mt-2 text-[12.6875px] leading-6 text-center text-slate-700 [overflow-wrap:anywhere]">
                    {formatNumber(visibleAnnualTotals?.annualSecondaryRuntimeHours ?? 0)} h
                  </p>
                </div>
              </div>
              <div className="divide-y divide-slate-200 md:px-6">
                <div className="py-4 text-center first:pt-0">
                  <p className={`${workspaceSubsectionTitleClassName} text-center`}>{t("analysis.fuelPerYear")}</p>
                  <p className="mt-2 text-[12.6875px] leading-6 text-center text-slate-700 [overflow-wrap:anywhere]">
                    {formatNumber(visibleAnnualTotals?.annualFuelConsumption ?? 0)} l
                  </p>
                </div>
                <div className="py-4 text-center last:pb-0">
                  <p className={`${workspaceSubsectionTitleClassName} text-center`}>{t("analysis.fuelCostPerYear")}</p>
                  <p className="mt-2 text-[12.6875px] leading-6 text-center text-slate-700 [overflow-wrap:anywhere]">
                    {formatNumber(visibleAnnualTotals?.annualFuelCost ?? 0)} kr
                  </p>
                </div>
              </div>
            </div>

            <div className="divide-y divide-slate-200 md:hidden">
              {[
                { label: t("analysis.solarPerYearShort"), value: `${formatNumber(visibleAnnualTotals?.annualSolarProductionKWh ?? 0)} kWh` },
                { label: t("analysis.loadPerYearShort"), value: `${formatNumber(visibleAnnualTotals?.annualLoadDemandKWh ?? 0)} kWh` },
                { label: t("analysis.balancePerYearShort"), value: `${formatNumber(visibleAnnualTotals?.annualEnergyBalanceKWh ?? 0)} kWh` },
              { label: t("analysis.reservePerYearShort"), value: `${formatNumber(visibleAnnualTotals?.annualSecondaryRuntimeHours ?? 0)} h` },
                { label: t("analysis.fuelPerYearShort"), value: `${formatNumber(visibleAnnualTotals?.annualFuelConsumption ?? 0)} l` },
                { label: t("analysis.fuelCostPerYearShort"), value: `${formatNumber(visibleAnnualTotals?.annualFuelCost ?? 0)} kr` },
              ].map((item) => (
                <div key={item.label} className="flex items-baseline justify-between gap-4 py-3 first:pt-0 last:pb-0">
                  <p className={workspaceBodyClassName}>{item.label}</p>
                  <p className={`${workspaceBodyStrongClassName} text-right`}>{item.value}</p>
                </div>
              ))}
            </div>

            {showReliabilitySimulation ? (
              <ReliabilitySection
                metrics={reliabilityMetrics}
                running={reliabilityRunning}
                error={reliabilityError}
                visible
                embedded
              />
            ) : null}

            <div className={showReliabilitySimulation ? "mt-6 border-t border-slate-200 pt-6" : "mt-6"}>
              <EnergyOverviewChart
                rows={visibleMonthlyEnergyBalance}
                backupSource={
                  hasBackupSource
                    ? activeReserveSource
                    : derivedResults.systemRecommendation.secondarySource === "Ikkje berekna"
                      ? undefined
                      : derivedResults.systemRecommendation.secondarySource
                }
              />
            </div>

            {showHorizonProfile && horizonProfile && (
              <div className="mt-6">
                <div className="mb-0 flex flex-col gap-4 border-b border-slate-200 pb-2 sm:flex-row sm:items-end sm:justify-between">
                  <div className="min-w-0">
                    <h2 className={workspaceSectionTitleClassName}>Solposisjon</h2>
                  </div>
                </div>
                <PanoramicHorizon
                  profile={horizonProfile}
                  latDeg={activeDraft.solarRadiationSettings.lat !== "" ? Number(activeDraft.solarRadiationSettings.lat) : 60}
                  lonDeg={activeDraft.solarRadiationSettings.lon !== "" ? Number(activeDraft.solarRadiationSettings.lon) : 10}
                  locationName={activeDraft.solarRadiationSettings.locationName || undefined}
                />
              </div>
            )}

            {showHorizonProfile && horizonProfile && (
              <div className="mt-6">
                <div className="mb-0 flex flex-col gap-4 border-b border-slate-200 pb-2 sm:flex-row sm:items-end sm:justify-between">
                  <div className="min-w-0">
                    <h2 className={workspaceSectionTitleClassName}>
                      Innfallsvinkel på panelet (tilt {activeDraft.solarRadiationSettings.tilt !== "" ? Number(activeDraft.solarRadiationSettings.tilt) : 30}°, azimut {activeDraft.solarRadiationSettings.azimuth !== "" ? Number(activeDraft.solarRadiationSettings.azimuth) : 180}°)
                    </h2>
                  </div>
                </div>
                <SolarPositionChart
                  profile={horizonProfile}
                  latDeg={activeDraft.solarRadiationSettings.lat !== "" ? Number(activeDraft.solarRadiationSettings.lat) : 60}
                  lonDeg={activeDraft.solarRadiationSettings.lon !== "" ? Number(activeDraft.solarRadiationSettings.lon) : 10}
                  tiltDeg={activeDraft.solarRadiationSettings.tilt !== "" ? Number(activeDraft.solarRadiationSettings.tilt) : 30}
                  azimuthDeg={activeDraft.solarRadiationSettings.azimuth !== "" ? Number(activeDraft.solarRadiationSettings.azimuth) : 180}
                />
              </div>
            )}

            {showHorizonProfile && horizonProfile && (
              <div className="mt-6">
                <div className="mb-0 flex flex-col gap-4 border-b border-slate-200 pb-2 sm:flex-row sm:items-end sm:justify-between">
                  <div className="min-w-0">
                    <h2 className={workspaceSectionTitleClassName}>Horisontprofil</h2>
                  </div>
                </div>
                <HorizonChart profile={horizonProfile} latDeg={activeDraft.solarRadiationSettings.lat !== "" ? Number(activeDraft.solarRadiationSettings.lat) : undefined} />
              </div>
            )}
          </WorkspaceSection>

          <WorkspaceSection
            title={t("analysis.monthByMonth")}
            description={t("analysis.monthByMonthDesc")}
          >
            <MonthlyTable rows={visibleMonthlyEnergyBalance} />
          </WorkspaceSection>

          <WorkspaceSection
            title={t("analysis.reserveLifetime")}
            description={t("analysis.reserveLifetimeDesc")}
          >
            <LifetimePanel items={derivedResults.costComparison.items} />
          </WorkspaceSection>

          <WorkspaceSection
            title={t("analysis.tocComparison")}
            description={t("analysis.tocComparisonDesc")}
          >
            <div className="space-y-6">
              <CostComparisonChart items={derivedResults.costComparison.items} />

              <div className="border-t border-slate-200 pt-5 md:grid md:gap-0 md:grid-cols-2 md:divide-x md:divide-slate-200">
                {derivedResults.costComparison.items.map((item, index) => (
                  <div
                    key={item.source}
                    className={`${index === 0 ? "pb-5 md:pb-0 md:pr-6" : "border-t border-slate-200 pt-5 md:border-t-0 md:pt-0 md:pl-6"}`}
                  >
                    <CostCard item={item} />
                  </div>
                ))}
              </div>
            </div>
          </WorkspaceSection>

          {showRecommendationContent && recommendation ? (
            <WorkspaceSection
              title={t("analysis.reasoningTitle")}
              description={t("analysis.reasoningDesc")}
            >
              <div>
                <DetailGroupsPanel
                  groups={[
                    {
                      title: t("analysis.reasoning"),
                      items: recommendation.grunngiving.map(d),
                      emptyText: t("analysis.noReasoning")
                    },
                    {
                      title: t("analysis.additionalRequirements"),
                      items: recommendation.tilleggskrav.map(d),
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
            </WorkspaceSection>
          ) : null}

          {showRecommendationContent && recommendation ? (
            <WorkspaceSection title="Rapport">
              <div className="flex flex-wrap items-center gap-4">
                <button
                  type="button"
                  disabled={isGeneratingReport}
                  onClick={handleGenerateReport}
                  className="rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-50"
                >
                  {isGeneratingReport ? "Genererer..." : "Generer rapport med AI-underbygging"}
                </button>
                {reportError ? <p className="text-sm text-red-600">{reportError}</p> : null}
              </div>
            </WorkspaceSection>
          ) : null}
        </>
      ) : (
        <>
          {showRecommendationContent ? recommendationSection : null}

          {isGuidedMode && detailBlockers.length > 0 ? (
            <WorkspaceSection
              title={t("analysis.missingForFull")}
              description={t("analysis.missingForFullDesc")}
            >
              <div className="flex flex-wrap gap-3">
                {detailBlockers.map((blocker) => (
                  <NavLink key={blocker.label} to={blocker.path} className={blockerLinkClass}>
                    {`${blocker.label}: ${blocker.count} ${t("analysis.fields")}`}
                  </NavLink>
                ))}
              </div>
            </WorkspaceSection>
          ) : null}
        </>
      )}

      <WorkspaceActions onReset={handleReset} onSave={handleSave} />
    </main>
  );
}

// ---------------------------------------------------------------------------
// Reliability Analysis Section (hourly battery simulation)
// ---------------------------------------------------------------------------

function ReliabilitySection({
  metrics,
  running,
  error,
  visible,
  embedded = false
}: {
  metrics: ReliabilityMetrics | null;
  running: boolean;
  error: string | null;
  visible: boolean;
  embedded?: boolean;
}) {
  const { t } = useLanguage();
  if (!visible) return null;

  const content = (
    <div className="space-y-6">

      {metrics && (
        <>
          <ReliabilityKPIPanel metrics={metrics} />
          <div className="grid gap-6 lg:grid-cols-2">
            <BatteryFrequencyChart metrics={metrics} />
            <SocHistogramChart metrics={metrics} />
          </div>
        </>
      )}
    </div>
  );

  if (embedded) {
    return (
      <div className="mt-6 border-t border-slate-200 pt-6">
        <div className="mb-5 flex flex-col gap-4 border-b border-slate-200 pb-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className={workspaceSectionTitleClassName}>{t("reliability.title")}</h2>
            </div>
          </div>
          <div className="flex items-center gap-3 text-xs">
            {running ? <span className="font-semibold text-sky-700">{t("reliability.running")}</span> : null}
            {error && <span className="text-xs text-red-600">{error}</span>}
          </div>
        </div>
        {content}
      </div>
    );
  }

  return (
    <WorkspaceSection
      title={t("reliability.title")}
      description={t("reliability.description")}
      actions={
        <div className="flex items-center gap-3 text-xs">
          {running ? <span className="font-semibold text-sky-700">{t("reliability.running")}</span> : null}
          {error && <span className="text-xs text-red-600">{error}</span>}
        </div>
      }
    >
      {content}
    </WorkspaceSection>
  );
}
