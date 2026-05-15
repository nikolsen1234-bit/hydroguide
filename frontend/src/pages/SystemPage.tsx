import { type KeyboardEvent as ReactKeyboardEvent, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import KpiStrip, { type KpiStripItem } from "../components/KpiStrip";
import WorkspaceHeader, { WorkspaceHeaderActionButton, workspaceHeaderActionIcons } from "../components/WorkspaceHeader";
import { MONTH_KEYS, MONTH_LABELS as MONTH_NAMES } from "../constants";
import { useConfigurationContext } from "../context/ConfigurationContext";
import { useLanguage } from "../i18n";
import { workspaceOverlineClassName, workspacePageClassName, workspaceSectionTitleClassName } from "../styles/workspace";
import type { MonthlySolarRadiation, SecondarySourceKey } from "../types";
import { formatNumber } from "../utils/format";
import { calculateConfigurationOutputs } from "../utils/systemResults";
import { validateConfiguration } from "../utils/validation";

const FIELD_LABEL_CLASS = workspaceOverlineClassName;
const PANEL_LABEL_CLASS = `${workspaceOverlineClassName} text-[var(--hg-ink-2)]`;
const SOLAR_BAR_COLOR = "#60a5fa";
const CHART_GRID_LINES = [0.25, 0.5, 0.75, 1];
const FULL_MONTH_LABELS = MONTH_KEYS.map((month) => MONTH_NAMES[month]);
const MONTH_LABELS = FULL_MONTH_LABELS.map((month) => month.toUpperCase());
const DEFAULT_MONTH_VALUES = [0.4, 1.0, 2.7, 4.2, 5.6, 5.2, 5.1, 4.1, 2.4, 1.2, 0.5, 0.3];
const MONTH_PANEL_COLUMNS = ["MÅNED", "kWh/m²", "Δ FRA STANDARD"];
const SECONDARY_SOURCE_OPTIONS = ["BRENSELCELLE", "DIESEL", "BEGGE"];
const SECONDARY_SOURCE_LABELS: Record<SecondarySourceKey, string> = {
  fuelCell: "Brenselcelle (metanol)",
  diesel: "Dieselaggregat"
};
const PANEL_FOCUSABLE_SELECTOR =
  'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
type FlatFieldProps = {
  label: string;
  value?: string;
  unit?: string;
  hint?: string;
  info?: boolean;
  highlighted?: boolean;
  onChange?: (value: string) => void;
  readOnly?: boolean;
};
type MonthlyValuesPanelProps = { open: boolean; values: number[]; baseline: number[]; onChange: (index: number, value: number) => void; onClose: () => void; onReset: () => void };

function parseMonthlyValue(raw: string): number {
  const n = Number(raw.replace(",", ".").trim());
  return raw.trim() === "" || !Number.isFinite(n) || n < 0 ? 0 : n;
}

function parseEditableNumber(raw: string): number | "" {
  const trimmed = raw.replace(",", ".").trim();
  if (trimmed === "") return "";
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : "";
}

function formatEditable(value: number | ""): string {
  return value === "" ? "" : String(value);
}

function secondarySourceOptions(sources: SecondarySourceKey[] | undefined, fallback: SecondarySourceKey): SecondarySourceKey[] {
  const cleaned = (sources ?? []).filter((source): source is SecondarySourceKey => source === "fuelCell" || source === "diesel");
  return cleaned.length > 0 ? cleaned : [fallback];
}

function secondarySelectionValue(sources: SecondarySourceKey[]): string {
  const hasFuelCell = sources.includes("fuelCell");
  const hasDiesel = sources.includes("diesel");
  if (hasFuelCell && hasDiesel) return "BEGGE";
  return hasDiesel ? "DIESEL" : "BRENSELCELLE";
}

function secondarySourcesForSelection(value: string): SecondarySourceKey[] {
  if (value === "BEGGE") return ["fuelCell", "diesel"];
  if (value === "DIESEL") return ["diesel"];
  return ["fuelCell"];
}

function monthlyRadiationValues(radiation: MonthlySolarRadiation): number[] {
  return MONTH_KEYS.map((key) => {
    const v = radiation[key];
    return typeof v === "number" && Number.isFinite(v) ? v : 0;
  });
}

function cleanSolarValuesFromUrl(fallback: number[]): number[] {
  if (typeof window === "undefined") return fallback;

  const raw = new URLSearchParams(window.location.search).get("solarValues");
  const values = (raw?.match(/\d+(?:[,.]\d+)?/g) ?? []).map((part) => Number(part.replace(",", ".")));
  return values.length === 12 && values.every((value) => Number.isFinite(value) && value >= 0) ? values : fallback;
}

export default function SystemPage() {
  const { activeDraft, resetDraft, saveDraftMetadata } = useConfigurationContext();
  const { t, language } = useLanguage();
  const cleanSolarChartMode = typeof window !== "undefined" && new URLSearchParams(window.location.search).has("cleanSolarChart");
  const activeSolarValues = monthlyRadiationValues(activeDraft.monthlySolarRadiation);
  const validationErrors = useMemo(() => validateConfiguration(activeDraft), [activeDraft, language]);
  const hasCompleteConfiguration = Object.keys(validationErrors).length === 0;
  const outputs = useMemo(
    () => (hasCompleteConfiguration ? calculateConfigurationOutputs(activeDraft) : null),
    [activeDraft, hasCompleteConfiguration]
  );

  const isAutonomyMode = activeDraft.systemParameters.batteryMode === "autonomyDays";
  const kpiItems = useMemo<KpiStripItem[]>(() => {
    const batteryTileKicker = isAutonomyMode ? "BANKSTØRRELSE" : "AUTONOMI";
    const batteryTileUnit = isAutonomyMode ? "Ah" : "dager";

    if (!outputs) {
      return [
        { kicker: "SOLCELLEPROD.", value: "-", unit: "kWh" },
        { kicker: batteryTileKicker, value: "-", unit: batteryTileUnit },
        { kicker: "SEKUNDÆRDRIFT", value: "-", unit: "%" },
        { kicker: "CO₂", value: "-", unit: "kg" },
      ];
    }
    const annualSolarKWh = outputs.derivedResults.annualTotals.annualSolarProductionKWh;

    const ah = outputs.derivedResults.systemRecommendation.batteryCapacityAh;
    const autonomyDays = outputs.derivedResults.systemRecommendation.batteryAutonomyDays;
    const batteryTileValue = isAutonomyMode
      ? formatNumber(ah, 0)
      : formatNumber(autonomyDays, 1);

    const annualRuntimeHours = outputs.derivedResults.annualTotals.annualSecondaryRuntimeHours;
    const secondaryRuntimePct = (annualRuntimeHours / (365 * 24)) * 100;

    const recommendedSource = outputs.derivedResults.systemRecommendation.secondarySource;
    const co2Item = outputs.derivedResults.costComparison.alternatives.find(
      (item) => item.source === recommendedSource
    );
    const annualCo2Kg = co2Item ? co2Item.annualCo2 : 0;

    return [
      { kicker: "SOLCELLEPROD.", value: formatNumber(annualSolarKWh, 0), unit: "kWh" },
      { kicker: batteryTileKicker, value: batteryTileValue, unit: batteryTileUnit },
      { kicker: "SEKUNDÆRDRIFT", value: formatNumber(secondaryRuntimePct, 1), unit: "%" },
      { kicker: "CO₂", value: formatNumber(annualCo2Kg, 0), unit: "kg" },
    ];
  }, [outputs, isAutonomyMode]);

  if (cleanSolarChartMode) {
    return <CleanSolinnstralingChart values={cleanSolarValuesFromUrl(activeSolarValues)} />;
  }

  const handleReset = () => {
    const configurationName = activeDraft.name.trim() || t("shared.thisConfiguration");
    if (window.confirm(t("shared.resetConfirm").replace("{name}", configurationName))) {
      resetDraft();
    }
  };

  return (
    <main className={`${workspacePageClassName} hg-tp hg-tp-fullheight flex h-full flex-col !pb-3`}>
      <WorkspaceHeader
        title={t("system.title")}
        actions={
          <>
            <WorkspaceHeaderActionButton icon={workspaceHeaderActionIcons.reset} label="Tilbakestill" onClick={handleReset} />
            <WorkspaceHeaderActionButton icon={workspaceHeaderActionIcons.save} label="Lagre" onClick={() => saveDraftMetadata()} primary />
          </>
        }
      />

      <KpiStrip items={kpiItems} />

      <div className="flex min-h-0 flex-1 flex-col gap-3">
        <SecondarySection />
        <EnergiSeksjon />
        <SolinnstralingSection />
      </div>
    </main>
  );
}

function SectionHeader({ title, actions }: { title: string; actions?: ReactNode }) {
  return (
    <div className="flex min-h-[38px] flex-wrap items-end justify-between gap-3 pb-2 max-md:flex-col max-md:items-stretch">
      <div className="min-w-0">
        <h2 className={workspaceSectionTitleClassName}>{title}</h2>
      </div>
      {actions ? <div className="flex items-center gap-2 max-md:flex-wrap">{actions}</div> : null}
    </div>
  );
}

function FieldLabel({ label, focused, info }: { label: string; focused?: boolean; info?: boolean }) {
  return (
    <span className={`${FIELD_LABEL_CLASS} flex items-center gap-1 transition-colors ${focused ? "text-[var(--hg-accent)]" : "text-[var(--hg-ink-2)]"}`}>
      {label}
      {info ? <span className="inline-flex h-3 w-3 items-center justify-center rounded-full border border-[var(--hg-hairline)] text-[length:var(--hg-type-micro-size)]">i</span> : null}
    </span>
  );
}

function LabeledControl({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <FieldLabel label={label} />
      {children}
    </div>
  );
}

function FlatField({ label, value, unit, hint, info, highlighted, onChange, readOnly }: FlatFieldProps) {
  const isControlled = onChange !== undefined;
  const [internal, setInternal] = useState(value ?? "");
  const [focused, setFocused] = useState(false);
  const displayValue = isControlled ? value ?? "" : internal;
  const borderColor = focused
    ? "border-[var(--hg-accent)]"
    : highlighted
      ? "border-[var(--hg-accent)]"
      : "border-[var(--hg-ink)]";
  return (
    <label className="flex min-w-0 flex-col gap-1">
      <FieldLabel label={label} focused={focused} info={info} />
      <div className={`flex items-baseline gap-2 border-b-2 ${borderColor} pb-0.5 transition-colors`}>
        <input
          type="text"
          value={displayValue}
          readOnly={readOnly}
          onChange={(e) => {
            if (readOnly) return;
            if (isControlled) {
              onChange?.(e.target.value);
            } else {
              setInternal(e.target.value);
            }
          }}
          onFocus={(e) => {
            setFocused(true);
            e.target.select();
          }}
          onBlur={() => setFocused(false)}
          className="hg-mono min-w-0 flex-1 border-0 bg-transparent p-0 text-[length:var(--hg-type-control-value-size)] font-[var(--hg-type-weight-extra)] text-[var(--hg-ink)] outline-none focus:text-[var(--hg-accent)]"
        />
        {unit ? (
          <span className="hg-mono shrink-0 text-[13px] font-[var(--hg-type-weight-bold)] tracking-normal text-[var(--hg-ink)]">
            {unit}
          </span>
        ) : null}
      </div>
      {hint ? <span className="hg-mono text-[length:var(--hg-type-overline-size)] text-[var(--hg-ink-2)]">{hint}</span> : null}
    </label>
  );
}

function FlatSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange?: (value: string) => void;
}) {
  const isControlled = onChange !== undefined;
  const [internal, setInternal] = useState(value);
  const [focused, setFocused] = useState(false);
  const display = isControlled ? value : internal;
  return (
    <label className="flex min-w-0 flex-col gap-1">
      <FieldLabel label={label} />
      <div className={`flex items-center justify-between gap-2 border-b-2 ${focused ? "border-[var(--hg-accent)]" : "border-[var(--hg-ink)]"} pb-0.5 transition-colors`}>
        <select
          value={display}
          onChange={(e) => {
            if (isControlled) onChange?.(e.target.value);
            else setInternal(e.target.value);
          }}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          className="hg-mono min-w-0 flex-1 appearance-none border-0 bg-transparent p-0 text-[length:var(--hg-type-control-size)] font-[var(--hg-type-weight-bold)] text-[var(--hg-ink)] outline-none"
        >
          {options.map((opt) => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
        <span className="text-[var(--hg-ink)]">▾</span>
      </div>
    </label>
  );
}

function PillToggle({
  options,
  selected,
  fullWidth = false,
  onChange,
}: {
  options: string[];
  selected: string;
  fullWidth?: boolean;
  onChange?: (value: string) => void;
}) {
  const isControlled = onChange !== undefined;
  const [internal, setInternal] = useState(selected);
  const active = isControlled ? selected : internal;
  return (
    <div
      className={`grid rounded-md border border-[var(--hg-hairline)] bg-[var(--hg-surface)] p-0.5 ${fullWidth ? "w-full" : "inline-grid"}`}
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      {options.map((opt) => {
        const isActive = active === opt;
        return (
          <button
            key={opt}
            type="button"
            onClick={() => {
              if (isControlled) {
                onChange?.(opt);
              } else {
                setInternal(opt);
              }
            }}
            className={`hg-mono flex items-center justify-center rounded-[5px] border px-2 py-1.5 text-[length:var(--hg-type-overline-size)] font-[var(--hg-type-weight-bold)] uppercase tracking-[var(--hg-type-overline-tracking)] transition ${
              isActive
                ? "border-[var(--hg-accent)] bg-[var(--hg-accent-soft)] text-[var(--hg-accent)]"
                : "border-transparent text-[var(--hg-ink-2)] hover:text-[var(--hg-ink)]"
            }`}
          >
            {opt}
          </button>
        );
      })}
    </div>
  );
}

function EnergiSeksjon() {
  const { activeDraft, updateConfigSectionField } = useConfigurationContext();

  const dcVoltage = activeDraft.battery.nominalVoltage;
  const maxDoD = activeDraft.battery.maxDepthOfDischarge;
  const batteryMode = activeDraft.systemParameters.batteryMode || "ah";
  const bankSize = activeDraft.systemParameters.batteryValue;

  return (
    <section className="hg-tp-section flex flex-col border-t-2 border-[var(--hg-ink)] pt-2">
      <div className="grid gap-x-8 gap-y-3 lg:grid-cols-2">
        <div className="flex flex-col">
          <SectionHeader title="SOLCELLESYSTEM" />
          <div className="grid gap-x-6 gap-y-3 md:grid-cols-2">
            <div className="md:col-span-2">
              <FlatField
                label="PANELEFFEKT"
                value={formatEditable(activeDraft.solar.panelPowerWp)}
                unit="Wp"
                onChange={(v) => updateConfigSectionField("solar", "panelPowerWp", parseEditableNumber(v))}
              />
            </div>
          </div>
          <div className="mt-auto grid gap-x-6 gap-y-3 pt-3 md:grid-cols-2">
            <FlatField
              label="ANTALL PANEL"
              value={formatEditable(activeDraft.solar.panelCount)}
              unit="stk"
              onChange={(v) => updateConfigSectionField("solar", "panelCount", parseEditableNumber(v))}
            />
            <FlatField
              label="VIRKNINGSGRAD"
              value={formatEditable(activeDraft.solar.systemEfficiency)}
              onChange={(v) => updateConfigSectionField("solar", "systemEfficiency", parseEditableNumber(v))}
            />
          </div>
        </div>

        {/* Batteribank felter */}
        <div>
          <SectionHeader
            title="BATTERIBANK"
            actions={
              <span className="hg-mono inline-flex min-h-[30px] items-center rounded-md border border-[var(--hg-accent)] bg-[var(--hg-accent-soft)] px-3 text-[length:var(--hg-type-overline-size)] font-[var(--hg-type-weight-bold)] uppercase tracking-[var(--hg-type-overline-tracking)] text-[var(--hg-accent)]">
                Li-ion
              </span>
            }
          />
          <div className="grid gap-x-6 gap-y-3 md:grid-cols-2">
            <FlatField
              label="NOMINELL SPENNING"
              value={formatEditable(dcVoltage)}
              unit="V"
              onChange={(v) => updateConfigSectionField("battery", "nominalVoltage", parseEditableNumber(v))}
            />
            <LabeledControl label="AUTONOMI OPPGITT I">
              <PillToggle
                options={["DAGER", "AH"]}
                selected={batteryMode === "autonomyDays" ? "DAGER" : "AH"}
                fullWidth
                onChange={(v) =>
                  updateConfigSectionField("systemParameters", "batteryMode", v === "DAGER" ? "autonomyDays" : "ah")
                }
              />
            </LabeledControl>
            <FlatField
              label="MAKS UTLADINGSDYBDE"
              value={formatEditable(maxDoD)}
              onChange={(v) => updateConfigSectionField("battery", "maxDepthOfDischarge", parseEditableNumber(v))}
            />
            <FlatField
              label={batteryMode === "autonomyDays" ? "AUTONOMI" : "BATTERIBANKSTØRRELSE"}
              value={formatEditable(bankSize)}
              unit={batteryMode === "autonomyDays" ? "dager" : "Ah"}
              onChange={(v) => updateConfigSectionField("systemParameters", "batteryValue", parseEditableNumber(v))}
            />
          </div>
        </div>
      </div>

    </section>
  );
}

function SolinnstralingSection({ exportMode = false, overrideValues }: { exportMode?: boolean; overrideValues?: number[] } = {}) {
  const { activeDraft, updateConfigSectionField } = useConfigurationContext();
  const [panelOpen, setPanelOpen] = useState(false);
  const radiation = activeDraft.monthlySolarRadiation;
  const values = overrideValues ?? monthlyRadiationValues(radiation);
  const sum = values.reduce((acc, v) => acc + v, 0);

  const setMonthlyValue = (i: number, raw: number) => {
    const key = MONTH_KEYS[i] as keyof typeof radiation;
    updateConfigSectionField("monthlySolarRadiation", key, raw === 0 ? ("" as const) : raw);
  };

  return (
    <div data-clean-solar-chart={exportMode || undefined} className="flex min-h-0 flex-1 flex-col">
      <div className="mb-1 flex items-center gap-3">
        <p className={`${workspaceOverlineClassName} text-[var(--hg-ink-2)]`}>
          SOLINNSTRÅLING · kWh/m²
        </p>
        {!exportMode ? (
          <button
            type="button"
            onClick={() => setPanelOpen(true)}
            className="hg-mono inline-flex h-8 items-center justify-center rounded-md border border-[var(--hg-hairline)] bg-[var(--hg-surface)] px-3 text-[length:var(--hg-type-badge-size)] font-[var(--hg-type-weight-bold)] uppercase tracking-[var(--hg-type-unit-tracking)] text-[var(--hg-accent)] transition hover:border-[var(--hg-accent-2)] hover:bg-[var(--hg-accent-soft)]"
          >
            Rediger månedsverdier
          </button>
        ) : null}
      </div>
      <div className="min-h-0 flex-1 max-md:hidden">
        <RadiationBarChart values={values} />
      </div>
      <div className="hidden max-md:block">
        <RadiationBarChartHorizontal values={values} />
      </div>
      <p className="hg-mono mt-1 text-right text-[13px] font-[var(--hg-type-weight-bold)] tracking-normal text-[var(--hg-ink)]">
        Sum: {sum.toFixed(2)} kWh/m² · år
      </p>
      {!exportMode ? (
        <MonthlyValuesPanel
          open={panelOpen}
          values={values}
          baseline={DEFAULT_MONTH_VALUES}
          onChange={(i, v) => setMonthlyValue(i, v)}
          onClose={() => setPanelOpen(false)}
          onReset={() => MONTH_KEYS.forEach((key, i) => updateConfigSectionField("monthlySolarRadiation", key as keyof typeof radiation, DEFAULT_MONTH_VALUES[i]))}
        />
      ) : null}
    </div>
  );
}

function CleanSolinnstralingChart({ values }: { values: number[] }) {
  return (
    <main className="hg-tp flex min-h-screen items-center justify-center bg-[var(--hg-bg)] p-8 text-[var(--hg-ink)]">
      <section className="flex h-[430px] w-[1180px] max-w-full flex-col bg-[var(--hg-bg)]">
        <SolinnstralingSection exportMode overrideValues={values} />
      </section>
    </main>
  );
}

function RadiationBarChart({ values }: { values: number[] }) {
  const max = Math.max(...values);
  const niceMax = Math.ceil(max > 0 ? max : 6);

  return (
    <div className="relative h-full">
      <div className="pointer-events-none absolute inset-x-0 top-[18px] bottom-[19px]">
        {CHART_GRID_LINES.map((g) => (
          <div
            key={g}
            className="absolute inset-x-0 border-t-2 border-[var(--hg-hairline-2)]"
            style={{ bottom: `${g * 100}%` }}
          >
            <span className="hg-mono absolute -top-[7px] left-0 bg-[var(--hg-bg)] pr-1 text-[length:var(--hg-type-overline-size)] font-[var(--hg-type-weight-bold)] text-[var(--hg-ink)]">
              {(niceMax * g).toFixed(g === 1 ? 0 : 1)}
            </span>
          </div>
        ))}
        <div className="absolute inset-x-0 bottom-0 border-t-2 border-[var(--hg-ink)]" />
      </div>
      <div className="relative grid h-full grid-cols-12 items-end gap-3">
        {values.map((v, i) => {
          const ratio = v / niceMax;
          const barHeight = `${Math.max(ratio * 100, v > 0 ? 2 : 0)}%`;
          return (
            <div key={i} className="flex h-full min-w-0 flex-col items-stretch justify-end gap-0">
              <div className="flex flex-1 flex-col items-center justify-end">
                <span className="hg-mono mb-0.5 text-[length:var(--hg-type-overline-size)] font-[var(--hg-type-weight-bold)] text-[var(--hg-ink)]">
                  {v.toFixed(1)}
                </span>
                <div
                  className="w-[68%] rounded-t-[2px]"
                  style={{ height: barHeight, minHeight: v > 0 ? 2 : 0, background: SOLAR_BAR_COLOR }}
                  aria-label={`${MONTH_LABELS[i]}: ${v.toFixed(1)} kWh/m²`}
                />
              </div>
              <span className="hg-mono mt-1 text-center text-[length:var(--hg-type-overline-size)] font-[var(--hg-type-weight-bold)] uppercase tracking-[var(--hg-type-unit-tracking)] text-[var(--hg-ink)]">
                {MONTH_LABELS[i]}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function RadiationBarChartHorizontal({ values }: { values: number[] }) {
  const max = Math.max(...values);
  const niceMax = max > 0 ? Math.ceil(max) : 6;

  return (
    <div className="border-t-2 border-[var(--hg-ink)]">
      <ul className="m-0 list-none p-0">
        {values.map((v, i) => {
          const ratio = niceMax > 0 ? v / niceMax : 0;
          const barWidth = `${Math.max(ratio * 100, v > 0 ? 1.5 : 0)}%`;
          return (
            <li
              key={i}
              className="grid grid-cols-[2.25rem_minmax(0,1fr)_2.75rem] items-center gap-x-3 border-b border-[var(--hg-hairline-2)] py-2 last:border-b-0"
            >
              <span className="hg-mono text-[length:var(--hg-type-overline-size)] font-[var(--hg-type-weight-bold)] uppercase tracking-[var(--hg-type-unit-tracking)] text-[var(--hg-ink-2)]">
                {MONTH_LABELS[i]}
              </span>
              <div
                className="relative h-2 w-full overflow-hidden bg-[var(--hg-hairline-2)]"
                aria-label={`${MONTH_LABELS[i]}: ${v.toFixed(1)} kWh/m²`}
              >
                <div
                  className="absolute inset-y-0 left-0"
                  style={{ width: barWidth, background: SOLAR_BAR_COLOR }}
                />
              </div>
              <span className="hg-mono text-right text-[length:var(--hg-type-meta-size)] font-[var(--hg-type-weight-bold)] tabular-nums text-[var(--hg-ink)]">
                {v.toFixed(1)}
              </span>
            </li>
          );
        })}
      </ul>
      <div className="grid grid-cols-[2.25rem_minmax(0,1fr)_2.75rem] items-center gap-x-3 border-t border-[var(--hg-ink)] pt-1.5">
        <span aria-hidden="true" />
        <div className="hg-mono flex justify-between text-[length:var(--hg-type-micro-size)] font-[var(--hg-type-weight-semibold)] tabular-nums text-[var(--hg-muted)]">
          <span>0</span>
          <span>{niceMax}</span>
        </div>
        <span className="hg-mono text-right text-[length:var(--hg-type-micro-size)] font-[var(--hg-type-weight-semibold)] uppercase tracking-[var(--hg-type-unit-tracking)] text-[var(--hg-muted)]">
          kWh/m²
        </span>
      </div>
    </div>
  );
}

function MonthlyValuesPanel({ open, values, baseline, onChange, onClose, onReset }: MonthlyValuesPanelProps) {
  const panelRef = useRef<HTMLElement | null>(null);
  const inputsRef = useRef<Array<HTMLInputElement | null>>([]);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const id = window.setTimeout(() => {
      inputsRef.current[0]?.focus();
      inputsRef.current[0]?.select();
    }, 220);

    return () => {
      window.clearTimeout(id);
      document.body.style.overflow = previousOverflow;
      previousFocusRef.current?.focus();
      previousFocusRef.current = null;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }

      if (e.key !== "Tab") {
        return;
      }

      const panel = panelRef.current;
      if (!panel) {
        return;
      }

      const focusableElements = Array.from(panel.querySelectorAll<HTMLElement>(PANEL_FOCUSABLE_SELECTOR)).filter(
        (element) => element.getClientRects().length > 0
      );

      if (focusableElements.length === 0) {
        e.preventDefault();
        panel.focus();
        return;
      }

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];

      if (e.shiftKey && document.activeElement === firstElement) {
        e.preventDefault();
        lastElement.focus();
      } else if (!e.shiftKey && document.activeElement === lastElement) {
        e.preventDefault();
        firstElement.focus();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  const handleKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>, i: number) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (i < values.length - 1) {
        inputsRef.current[i + 1]?.focus();
        inputsRef.current[i + 1]?.select();
      } else {
        onClose();
      }
    }
  };

  if (!open) {
    return null;
  }

  return (
    <>
      <div
        className={`fixed inset-0 z-30 bg-black/35 transition-opacity duration-200 ${
          open ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={onClose}
        aria-hidden={!open}
      />
      <aside
        ref={panelRef}
        className={`fixed right-0 top-0 z-40 flex h-full w-full max-w-[520px] flex-col border-l border-[var(--hg-hairline)] bg-[var(--hg-surface)] shadow-2xl transition-transform duration-300 ease-out ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
        role="dialog"
        aria-modal="true"
        aria-label="Månedsverdier"
        tabIndex={-1}
      >
        <header className="flex items-start justify-between border-b border-[var(--hg-hairline)] px-6 py-4">
          <div>
            <p className={`${workspaceOverlineClassName} text-[var(--hg-ink-2)]`}>
              MÅNEDSVERDIER
            </p>
            <h2 className="mt-1 text-[length:var(--hg-type-dialog-title-size)] font-[var(--hg-type-weight-extra)] tracking-[var(--hg-type-tight-tracking)] text-[var(--hg-ink)]">
              SOLINNSTRÅLING · kWh/m²
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Lukk"
            className="flex h-8 w-8 items-center justify-center rounded-md border border-[var(--hg-hairline)] text-[var(--hg-ink-2)] hover:text-[var(--hg-ink)]"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" strokeWidth="1.8" stroke="currentColor">
              <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
            </svg>
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-6 py-3">
          <div className="grid grid-cols-[auto_1fr_auto] items-center gap-x-6 border-b border-[var(--hg-hairline)] pb-2">
            {MONTH_PANEL_COLUMNS.map((label, i) => (
              <span key={label} className={`${PANEL_LABEL_CLASS} ${i > 0 ? "text-right" : ""}`}>
                {label}
              </span>
            ))}
          </div>
          {values.map((v, i) => {
            const delta = v - baseline[i];
            const deltaText = delta === 0 ? "0.00" : `${delta > 0 ? "+" : ""}${delta.toFixed(2)}`;
            const deltaColor = delta === 0 ? "text-[var(--hg-ink-2)]" : delta > 0 ? "text-emerald-600" : "text-rose-600";
            return (
              <div key={i} className="grid grid-cols-[auto_1fr_auto] items-center gap-x-6 border-b border-[var(--hg-hairline-2)] py-2">
                <span className="text-[length:var(--hg-type-control-value-size)] font-[var(--hg-type-weight-medium)] text-[var(--hg-ink)]">
                  {FULL_MONTH_LABELS[i]}
                </span>
                <input
                  ref={(el) => {
                    inputsRef.current[i] = el;
                  }}
                  type="text"
                  inputMode="decimal"
                  value={Number.isFinite(v) ? String(v) : ""}
                  onFocus={(e) => e.target.select()}
                  onChange={(e) => onChange(i, parseMonthlyValue(e.target.value))}
                  onKeyDown={(e) => handleKeyDown(e, i)}
                  className="hg-mono w-full bg-transparent text-right text-[length:var(--hg-type-control-value-size)] font-[var(--hg-type-weight-bold)] text-[var(--hg-ink)] outline-none focus:text-[var(--hg-accent)]"
                  aria-label={`${FULL_MONTH_LABELS[i]} kWh/m²`}
                />
                <span className={`hg-mono text-right text-[length:var(--hg-type-meta-size)] font-[var(--hg-type-weight-bold)] ${deltaColor}`}>
                  {deltaText}
                </span>
              </div>
            );
          })}
        </div>

        <footer className="flex items-center justify-between border-t border-[var(--hg-hairline)] px-6 py-3">
          <button
            type="button"
            onClick={onReset}
            className="hg-mono text-[length:var(--hg-type-badge-size)] font-[var(--hg-type-weight-bold)] uppercase tracking-[var(--hg-type-unit-tracking)] text-[var(--hg-ink-2)] hover:text-[var(--hg-ink)]"
          >
            Tilbakestill til standard
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md bg-[var(--hg-accent)] px-4 py-2 text-[length:var(--hg-type-control-size)] font-[var(--hg-type-weight-bold)] text-white hover:bg-[var(--hg-accent-2)]"
          >
            Lagre
          </button>
        </footer>
      </aside>
    </>
  );
}

function SecondarySourceFields({ sourceKey }: { sourceKey: SecondarySourceKey }) {
  const { activeDraft, updateConfigSectionField } = useConfigurationContext();
  const cfg = activeDraft[sourceKey];
  const co2Factor = sourceKey === "fuelCell" ? activeDraft.other.co2Methanol : activeDraft.other.co2Diesel;
  const co2FactorKey = sourceKey === "fuelCell" ? "co2Methanol" : "co2Diesel";

  return (
    <div className="grid gap-y-3 border-t border-[var(--hg-hairline)] pt-3 first:border-t-0 first:pt-0">
      <p className={`${workspaceOverlineClassName} text-[var(--hg-ink-2)]`}>{SECONDARY_SOURCE_LABELS[sourceKey]}</p>
      <div className="grid gap-x-6 gap-y-3 md:grid-cols-2 lg:grid-cols-4">
        <FlatField
          label="INNKJØPSKOSTNAD"
          value={formatEditable(cfg.purchaseCost)}
          unit="kr"
          onChange={(v) => updateConfigSectionField(sourceKey, "purchaseCost", parseEditableNumber(v))}
        />
        <FlatField
          label="TEKNISK LEVETID"
          value={formatEditable(cfg.lifetime)}
          unit="t"
          onChange={(v) => updateConfigSectionField(sourceKey, "lifetime", parseEditableNumber(v))}
        />
        <FlatField
          label="EFFEKT"
          value={formatEditable(cfg.powerW)}
          unit="W"
          onChange={(v) => updateConfigSectionField(sourceKey, "powerW", parseEditableNumber(v))}
        />
        <FlatField
          label="DRIVSTOFFORBRUK"
          value={formatEditable(cfg.fuelConsumptionPerKWh)}
          unit="L/kWh"
          onChange={(v) => updateConfigSectionField(sourceKey, "fuelConsumptionPerKWh", parseEditableNumber(v))}
        />
        <FlatField
          label="DRIVSTOFFPRIS"
          value={formatEditable(cfg.fuelPrice)}
          unit="kr/L"
          onChange={(v) => updateConfigSectionField(sourceKey, "fuelPrice", parseEditableNumber(v))}
        />
        <FlatField
          label="CO₂-FAKTOR"
          value={formatEditable(co2Factor)}
          unit="kg/L"
          onChange={(v) => updateConfigSectionField("other", co2FactorKey, parseEditableNumber(v))}
        />
      </div>
    </div>
  );
}

function SecondarySection() {
  const { activeDraft, updateConfigSectionField } = useConfigurationContext();
  const selectedSources = secondarySourceOptions(
    activeDraft.systemParameters.secondarySourceOptions,
    activeDraft.systemParameters.selectedSecondarySource
  );
  const comparisonValue = secondarySelectionValue(selectedSources);
  const hasSecondarySource = activeDraft.systemParameters.hasBackupSource;
  const hasBothSources = comparisonValue === "BEGGE";

  const handleComparisonChange = (value: string) => {
    const sources = secondarySourcesForSelection(value);
    updateConfigSectionField("systemParameters", "secondarySourceOptions", sources);
    if (!sources.includes(activeDraft.systemParameters.selectedSecondarySource)) {
      updateConfigSectionField("systemParameters", "selectedSecondarySource", sources[0]);
    }
  };

  return (
    <section className="hg-tp-section border-t-2 border-[var(--hg-ink)] pt-2">
      <SectionHeader
        title="SEKUNDÆRKILDE"
        actions={
          <PillToggle
            options={["MED SEKUNDÆRKILDE", "UTEN SEKUNDÆRKILDE"]}
            selected={hasSecondarySource === false ? "UTEN SEKUNDÆRKILDE" : "MED SEKUNDÆRKILDE"}
            onChange={(v) => updateConfigSectionField("systemParameters", "hasBackupSource", v === "MED SEKUNDÆRKILDE")}
          />
        }
      />
      {hasSecondarySource === false ? (
        <p className={`${workspaceOverlineClassName} text-[var(--hg-ink-2)]`}>
          Ingen sekundærkilde valgt. Systemet dimensjoneres uten sekundærkilde.
        </p>
      ) : (
        <div className="grid gap-4">
          <FlatSelect
            label="SEKUNDÆRKILDE"
            value={comparisonValue}
            options={SECONDARY_SOURCE_OPTIONS}
            onChange={handleComparisonChange}
          />
          <div
            data-secondary-source-list
            className={`grid gap-4 ${hasBothSources ? "max-h-[340px] overflow-y-auto pr-2" : ""}`}
          >
            {selectedSources.map((sourceKey) => (
              <SecondarySourceFields key={sourceKey} sourceKey={sourceKey} />
            ))}
          </div>
        </div>
      )}

    </section>
  );
}
