import { useEffect, useMemo, useRef, useState } from "react";
import { BooleanChoiceField, NumberField, SelectField } from "../components/FormFields";
import WorkspaceActions, { HelpTip } from "../components/WorkspaceActions";
import WorkspaceHeader from "../components/WorkspaceHeader";
import WorkspaceSection from "../components/WorkspaceSection";
import { MONTH_KEYS, MONTH_LABELS } from "../constants";
import { useConfigurationContext } from "../context/ConfigurationContext";
import { useLanguage } from "../i18n";
import type { TranslationKey } from "../i18n";
import { useSolarRadiationFetch } from "../hooks/useSolarRadiationFetch";
import {
  workspaceFieldLabelClassName,
  workspaceFieldLabelRowClassName,
  workspaceInputClassName,
  workspacePageClassName,
  workspaceSubsectionTitleClassName
} from "../styles/workspace";
import { MonthKey } from "../types";
import { validateConfiguration } from "../utils/validation";

const secondarySourceFields: Array<{
  key: "purchaseCost" | "powerW" | "fuelConsumptionPerKWh" | "fuelPrice" | "lifetime" | "annualMaintenance";
  labelKey: TranslationKey;
  min: number;
  step: number;
  unit?: string;
  unitKey?: TranslationKey;
}> = [
  { key: "purchaseCost", labelKey: "system.purchaseCost", min: 0, step: 1, unit: "kr" },
  { key: "powerW", labelKey: "system.power", min: 0, step: 1, unit: "W" },
  { key: "fuelConsumptionPerKWh", labelKey: "system.fuelConsumption", min: 0, step: 0.01, unit: "L/kWh" },
  { key: "fuelPrice", labelKey: "system.fuelPrice", min: 0, step: 0.01, unit: "kr/L" },
  { key: "lifetime", labelKey: "system.technicalLifetime", min: 0, step: 1, unitKey: "system.hours" },
  { key: "annualMaintenance", labelKey: "system.annualMaintenance", min: 0, step: 1, unitKey: "system.krPerYear" }
];

function reserveCo2Field(section: "fuelCell" | "diesel") {
  return section === "fuelCell"
    ? { key: "co2Methanol" as const, labelKey: "system.co2FactorFuelCell" as TranslationKey }
    : { key: "co2Diesel" as const, labelKey: "system.co2FactorDiesel" as TranslationKey };
}

function InlineInfo({ text }: { text: string }) {
  return <HelpTip text={text} />;
}

function formatDecimalDraft(value: number | ""): string {
  return value === "" ? "" : String(value);
}

function buildSolarDrafts(values: Record<MonthKey, number | "">): Record<MonthKey, string> {
  return Object.fromEntries(MONTH_KEYS.map((month) => [month, formatDecimalDraft(values[month])])) as Record<
    MonthKey,
    string
  >;
}

type ValidationErrors = ReturnType<typeof validateConfiguration>;

const SOLAR_MONTH_ROWS: MonthKey[][] = [MONTH_KEYS.slice(0, 4), MONTH_KEYS.slice(4, 8), MONTH_KEYS.slice(8, 12)];

export default function SystemPage() {
  const { activeDraft, resetDraft, saveDraftMetadata } = useConfigurationContext();
  const { t, language } = useLanguage();
  const errors = useMemo(() => validateConfiguration(activeDraft), [activeDraft, language]);

  return (
    <main className={workspacePageClassName}>
      <WorkspaceHeader title={t("system.title")} />
      <SolarSettingsSection errors={errors} />
      <BatterySettingsSection errors={errors} />
      <ReserveSourceSection errors={errors} />
      {activeDraft.systemParameters.hasBackupSource === true ? <SecondarySourcesSection errors={errors} /> : null}

      <WorkspaceActions onReset={resetDraft} onSave={saveDraftMetadata} />
    </main>
  );
}

function SolarSettingsSection({ errors }: { errors: ValidationErrors }) {
  const { activeDraft, updateConfigSectionField } = useConfigurationContext();
  const { t } = useLanguage();
  const supportsSolarAuto = (activeDraft.engineMode ?? "standard") === "detailed";
  const [solarRadiationDrafts, setSolarRadiationDrafts] = useState<Record<MonthKey, string>>(() =>
    buildSolarDrafts(activeDraft.monthlySolarRadiation)
  );
  const focusedSolarMonthRef = useRef<MonthKey | null>(null);
  const previousSolarDraftConfigIdRef = useRef(activeDraft.id);
  const isAutoMode = supportsSolarAuto && activeDraft.solarRadiationSettings.mode === "auto";
  const autoControls = useSolarAutoControls(supportsSolarAuto, errors);

  useEffect(() => {
    if (!supportsSolarAuto && activeDraft.solarRadiationSettings.mode === "auto") {
      updateConfigSectionField("solarRadiationSettings", "mode", "manual");
    }
  }, [activeDraft.solarRadiationSettings.mode, supportsSolarAuto, updateConfigSectionField]);

  useEffect(() => {
    const configChanged = previousSolarDraftConfigIdRef.current !== activeDraft.id;
    previousSolarDraftConfigIdRef.current = activeDraft.id;

    setSolarRadiationDrafts((prev) => {
      const next = buildSolarDrafts(activeDraft.monthlySolarRadiation);
      const focusedMonth = focusedSolarMonthRef.current;

      if (!configChanged && focusedMonth) {
        next[focusedMonth] = prev[focusedMonth];
      }

      return next;
    });
  }, [activeDraft.id, activeDraft.monthlySolarRadiation]);

  const handleSolarRadiationChange = (month: MonthKey, rawValue: string) => {
    const normalized = rawValue.replace(",", ".");

    if (!/^\d*(?:\.\d*)?$/.test(normalized)) {
      return;
    }

    setSolarRadiationDrafts((prev) => ({
      ...prev,
      [month]: normalized
    }));

    if (normalized === "") {
      updateConfigSectionField("monthlySolarRadiation", month, "");
      return;
    }

    if (normalized === "." || normalized.endsWith(".")) {
      return;
    }

    const numericValue = Number(normalized);
    if (!Number.isNaN(numericValue)) {
      updateConfigSectionField("monthlySolarRadiation", month, numericValue);
    }
  };

  const handleSolarRadiationBlur = (month: MonthKey) => {
    focusedSolarMonthRef.current = null;
    const draftValue = solarRadiationDrafts[month];

    if (draftValue === "" || draftValue === ".") {
      setSolarRadiationDrafts((prev) => ({
        ...prev,
        [month]: ""
      }));
      updateConfigSectionField("monthlySolarRadiation", month, "");
      return;
    }

    const numericValue = Number(draftValue);
    if (Number.isNaN(numericValue)) {
      setSolarRadiationDrafts((prev) => ({
        ...prev,
        [month]: formatDecimalDraft(activeDraft.monthlySolarRadiation[month])
      }));
      return;
    }

    setSolarRadiationDrafts((prev) => ({
      ...prev,
      [month]: draftValue
    }));
    updateConfigSectionField("monthlySolarRadiation", month, numericValue);
  };

  return (
    <WorkspaceSection
      title={t("system.solarTitle")}
      description={t("system.solarDescription")}
      actions={supportsSolarAuto ? <SolarRadiationModeToggle /> : undefined}
    >
        <SolarSectionLayout
          isAuto={isAutoMode}
          panelFields={<SolarPanelFields errors={errors} />}
          radiationTable={
            <SolarRadiationTable
              monthRows={SOLAR_MONTH_ROWS}
              solarRadiationDrafts={solarRadiationDrafts}
              focusedSolarMonthRef={focusedSolarMonthRef}
              handleSolarRadiationChange={handleSolarRadiationChange}
              handleSolarRadiationBlur={handleSolarRadiationBlur}
              disabled={isAutoMode}
              unitLabel="kWh/m²"
            />
          }
          autoControls={autoControls}
        />
      </WorkspaceSection>
  );
}

function SolarPanelFields({ errors }: { errors: ValidationErrors }) {
  const { activeDraft, updateConfigSectionField } = useConfigurationContext();
  const { t } = useLanguage();

  return (
    <>
      <NumberField
        label={t("system.panelPower")}
        unit="Wp"
        value={activeDraft.solar.panelPowerWp}
        error={errors["solar.panelPowerWp"]}
        min={0}
        step={1}
        onChange={(next) => updateConfigSectionField("solar", "panelPowerWp", next)}
      />
      <NumberField
        label={t("system.panelCount")}
        unit={t("system.pcs")}
        value={activeDraft.solar.panelCount}
        error={errors["solar.panelCount"]}
        min={0}
        step={1}
        onChange={(next) => updateConfigSectionField("solar", "panelCount", next)}
      />
      <NumberField
        label={t("system.systemEfficiency")}
        helper={t("system.efficiencyHelper")}
        placeholder="0-1"
        value={activeDraft.solar.systemEfficiency}
        error={errors["solar.systemEfficiency"]}
        min={0}
        max={1}
        step={0.01}
        onChange={(next) => updateConfigSectionField("solar", "systemEfficiency", next)}
      />
    </>
  );
}

function BatterySettingsSection({ errors }: { errors: ValidationErrors }) {
  const { activeDraft, updateConfigSectionField } = useConfigurationContext();
  const { t } = useLanguage();

  const batteryValueLabel = t("system.desiredAutonomy");
  const batteryValueUnit =
    activeDraft.systemParameters.batteryMode === "autonomyDays"
      ? t("system.days")
      : activeDraft.systemParameters.batteryMode === "ah"
        ? "Ah"
        : undefined;
  const batteryValueHelper =
    activeDraft.systemParameters.batteryMode === "" ? t("system.batteryModeHelper") : undefined;

  return (
    <WorkspaceSection title={t("system.batteryTitle")} description={t("system.batteryDescription")}>
      <div className="grid gap-5 md:grid-cols-2">
        <NumberField
          label={t("system.nominalVoltage")}
          unit="V"
          value={activeDraft.battery.nominalVoltage}
          error={errors["battery.nominalVoltage"]}
          min={0}
          step={0.1}
          onChange={(next) => updateConfigSectionField("battery", "nominalVoltage", next)}
        />
        <SelectField
          label={t("system.autonomyInput")}
          value={activeDraft.systemParameters.batteryMode}
          error={errors["systemParameters.batteryMode"]}
          options={[
            { value: "autonomyDays", label: t("system.autonomyDays") },
            { value: "ah", label: t("system.batteryBankSize") }
          ]}
          onChange={(next) =>
            updateConfigSectionField("systemParameters", "batteryMode", next as "ah" | "autonomyDays")
          }
        />
        <NumberField
          label={batteryValueLabel}
          helper={batteryValueHelper}
          unit={batteryValueUnit}
          value={activeDraft.systemParameters.batteryValue}
          error={errors["systemParameters.batteryValue"]}
          min={0}
          step={0.1}
          onChange={(next) => updateConfigSectionField("systemParameters", "batteryValue", next)}
        />
        <NumberField
          label={t("system.maxDod")}
          placeholder="0-1"
          value={activeDraft.battery.maxDepthOfDischarge}
          error={errors["battery.maxDepthOfDischarge"]}
          min={0}
          max={1}
          step={0.01}
          onChange={(next) => updateConfigSectionField("battery", "maxDepthOfDischarge", next)}
        />
      </div>
    </WorkspaceSection>
  );
}

function ReserveSourceSection({ errors }: { errors: ValidationErrors }) {
  const { activeDraft, updateConfigSectionField } = useConfigurationContext();
  const { t } = useLanguage();

  return (
    <WorkspaceSection title={t("system.reserveSourceTitle")} description={t("system.reserveSourceDescription")}>
      <div className="max-w-xl">
        <BooleanChoiceField
          label={t("system.hasReserveSource")}
          value={activeDraft.systemParameters.hasBackupSource}
          error={errors["systemParameters.hasBackupSource"]}
          onChange={(next) => updateConfigSectionField("systemParameters", "hasBackupSource", next)}
        />
      </div>
    </WorkspaceSection>
  );
}

function SecondarySourcesSection({ errors }: { errors: ValidationErrors }) {
  const { activeDraft, updateConfigSectionField } = useConfigurationContext();
  const { t } = useLanguage();

  return (
    <WorkspaceSection title={t("system.secondarySourceTitle")} description={t("system.secondarySourceDescription")}>
      <div className="grid gap-6 xl:grid-cols-2">
        {[
          { section: "fuelCell" as const, titleKey: "system.fuelCell" as TranslationKey },
          { section: "diesel" as const, titleKey: "system.dieselGenerator" as TranslationKey }
        ].map((source, index) => {
          const co2Field = reserveCo2Field(source.section);

          return (
            <div
              key={source.section}
              className={index === 1 ? "border-t border-slate-200 pt-6 xl:border-l xl:border-t-0 xl:pl-6 xl:pt-0" : ""}
            >
              <div className="mb-4 flex items-center gap-2">
                <h3 className={workspaceSubsectionTitleClassName}>{t(source.titleKey)}</h3>
                <InlineInfo text={t("system.sameInputHelper")} />
              </div>

              <div className="divide-y divide-slate-200">
                {secondarySourceFields.map((field) => (
                  <div key={`${source.section}.${field.key}`} className="py-5 first:pt-0 last:pb-0">
                    <NumberField
                      label={t(field.labelKey)}
                      unit={field.unitKey ? t(field.unitKey) : field.unit}
                      value={activeDraft[source.section][field.key]}
                      error={errors[`${source.section}.${field.key}`]}
                      min={field.min}
                      step={field.step}
                      onChange={(next) => updateConfigSectionField(source.section, field.key, next)}
                    />
                  </div>
                ))}
              </div>

              <div className="mt-5 border-t border-slate-200 pt-5">
                <NumberField
                  label={t(co2Field.labelKey)}
                  helper={t("system.co2Helper")}
                  unit="kg/L"
                  value={activeDraft.other[co2Field.key]}
                  error={errors[`other.${co2Field.key}`]}
                  min={0}
                  step={0.001}
                  onChange={(next) => updateConfigSectionField("other", co2Field.key, next)}
                />
              </div>
            </div>
          );
        })}
      </div>
    </WorkspaceSection>
  );
}

function SolarRadiationModeToggle() {
  const { activeDraft, updateConfigSectionField } = useConfigurationContext();
  const { t } = useLanguage();
  const mode = activeDraft.solarRadiationSettings.mode;

  const handleModeChange = (m: "manual" | "auto") => {
    updateConfigSectionField("solarRadiationSettings", "mode", m);
    if (m === "auto") {
      for (const key of MONTH_KEYS) {
        updateConfigSectionField("monthlySolarRadiation", key, "");
      }
    }
  };

  return (
    <div className="flex gap-0.5 rounded-lg bg-slate-100 p-0.5" role="radiogroup">
      {(["manual", "auto"] as const).map((m) => (
        <button
          key={m}
          role="radio"
          aria-checked={mode === m}
          className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
            mode === m
              ? "bg-white text-slate-800 shadow-sm"
              : "text-slate-400 hover:text-slate-600"
          }`}
          onClick={() => handleModeChange(m)}
        >
          {m === "manual" ? t("system.solarRadiationManual") : t("system.solarRadiationAutomatic")}
        </button>
      ))}
    </div>
  );
}

function useSolarAutoControls(enabled: boolean, errors: ValidationErrors) {
  const { activeDraft, updateConfigSectionField } = useConfigurationContext();
  const { t } = useLanguage();
  const { loading, error, source, servedTmy, fetchSolarRadiation } = useSolarRadiationFetch();
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  const s = activeDraft.solarRadiationSettings;
  const isAuto = enabled && s.mode === "auto";
  const initialSolarMapSrc = useMemo(() => {
    const params = new URLSearchParams();

    if (typeof s.lat === "number" && typeof s.lon === "number") {
      params.set("lat", String(s.lat));
      params.set("lng", String(s.lon));
      params.set("zoom", String(typeof s.mapZoom === "number" ? s.mapZoom : 13));
      if (typeof s.locationName === "string" && s.locationName.trim()) {
        params.set("name", s.locationName.trim());
      }
    }

    const query = params.toString();
    return query ? `/solar-location-map.html?${query}` : "/solar-location-map.html";
  }, [activeDraft.id, isAuto]);

  // Listen for map location messages
  useEffect(() => {
    if (!isAuto) return;
    function handleMessage(event: MessageEvent) {
      if (!iframeRef.current || event.source !== iframeRef.current.contentWindow) return;
      const data = event.data;
      if (data?.type === "hydroguide:solar-location" && data.detail) {
        const { lat, lng, name, zoom } = data.detail;
        if (typeof lat === "number" && typeof lng === "number") {
          updateConfigSectionField("solarRadiationSettings", "lat", lat);
          updateConfigSectionField("solarRadiationSettings", "lon", lng);
        }
        if (typeof name === "string") {
          updateConfigSectionField("solarRadiationSettings", "locationName", name);
        }
        if (typeof zoom === "number") {
          updateConfigSectionField("solarRadiationSettings", "mapZoom", zoom);
        }
      }
      if (data?.type === "hydroguide:solar-map-zoom" && typeof data.zoom === "number") {
        updateConfigSectionField("solarRadiationSettings", "mapZoom", data.zoom);
      }
    }
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [isAuto, updateConfigSectionField]);

  // Sync saved location to map on mount and when values change.
  const hasSyncedRef = useRef(false);
  useEffect(() => {
    if (!isAuto || s.lat === "" || s.lon === "") return;
    const iframe = iframeRef.current;
    if (!iframe) return;

    const sendLocation = () => {
      iframe.contentWindow?.postMessage({
        type: "hydroguide:set-solar-location",
        detail: { lat: Number(s.lat), lng: Number(s.lon), name: s.locationName || "", zoom: s.mapZoom || 13 }
      }, window.location.origin);
      hasSyncedRef.current = true;
    };

    // Always listen for load (iframe remounts on navigation)
    iframe.addEventListener("load", sendLocation, { once: true });

    // If iframe already loaded (HMR / fast re-render), also send now
    if (hasSyncedRef.current) {
      sendLocation();
    }

    return () => iframe.removeEventListener("load", sendLocation);
  }, [isAuto, s.lat, s.lon, s.locationName, s.mapZoom]);

  if (!isAuto) return null;

  const handleFetch = async () => {
    const latVal = Number(s.lat);
    const lonVal = Number(s.lon);
    const tiltVal = Number(s.tilt);
    const azVal = Number(s.azimuth);
    const heightVal = s.heightOffset !== "" ? Number(s.heightOffset) : 0;
    if ([latVal, lonVal, tiltVal, azVal].some(Number.isNaN)) return;

    const result = await fetchSolarRadiation(latVal, lonVal, tiltVal, azVal, heightVal);
    if (result) {
      for (const key of MONTH_KEYS) {
        updateConfigSectionField("monthlySolarRadiation", key, result[key]);
      }
    }
  };

  const canFetch = s.lat !== "" && s.lon !== ""
    && s.tilt !== "" && s.azimuth !== ""
    && !loading;

  return {
    map: (
      <div className="flex flex-1 flex-col gap-3">
        <div className={workspaceFieldLabelRowClassName}>
          <span className={workspaceFieldLabelClassName}>{t("system.solarPanelPlacement")}</span>
        </div>
        <div className="flex-1 overflow-hidden rounded-2xl border border-slate-200" style={{ minHeight: "280px" }}>
          <iframe
            ref={iframeRef}
            title={t("system.solarPanelPlacement")}
            src={initialSolarMapSrc}
            className="block h-full w-full border-0"
          />
        </div>
      </div>
    ),
    controls: (
      <>
        <label className="block space-y-2">
          <span className={`${workspaceFieldLabelRowClassName} ${workspaceFieldLabelClassName}`}>{t("system.solarRadiationTilt")}</span>
          <div className="relative">
            <input
              type="number"
              min={0}
              max={90}
              step={1}
              className={`pr-10 ${workspaceInputClassName} hide-number-spin`}
              value={s.tilt}
              placeholder="45"
              onChange={(e) => {
                const v = e.target.value === "" ? "" : Number(e.target.value);
                updateConfigSectionField("solarRadiationSettings", "tilt", v as number | "");
              }}
            />
            <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm font-semibold text-slate-950">°</span>
          </div>
          {errors["solarRadiationSettings.tilt"] ? <p className="text-sm text-red-600">{errors["solarRadiationSettings.tilt"]}</p> : null}
        </label>
        <label className="block space-y-2">
          <span className={`${workspaceFieldLabelRowClassName} ${workspaceFieldLabelClassName}`}>{t("system.solarRadiationAzimuth")}</span>
          <div className="relative">
            <input
              type="number"
              min={0}
              max={360}
              step={1}
              className={`pr-10 ${workspaceInputClassName} hide-number-spin`}
              value={s.azimuth}
              placeholder="180"
              onChange={(e) => {
                const v = e.target.value === "" ? "" : Number(e.target.value);
                updateConfigSectionField("solarRadiationSettings", "azimuth", v as number | "");
              }}
            />
            <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm font-semibold text-slate-950">°</span>
          </div>
          {errors["solarRadiationSettings.azimuth"] ? <p className="text-sm text-red-600">{errors["solarRadiationSettings.azimuth"]}</p> : null}
        </label>
        <label className="block space-y-2">
          <span className={`${workspaceFieldLabelRowClassName} ${workspaceFieldLabelClassName}`}>{t("system.solarHeightOffset")}</span>
          <div className="relative">
            <input
              type="number"
              min={0}
              max={200}
              step={1}
              className={`pr-10 ${workspaceInputClassName} hide-number-spin`}
              value={s.heightOffset}
              placeholder="0"
              onChange={(e) => {
                const v = e.target.value === "" ? "" : Number(e.target.value);
                updateConfigSectionField("solarRadiationSettings", "heightOffset", v as number | "");
              }}
            />
            <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm font-semibold text-slate-950">m</span>
          </div>
        </label>
        <div className="space-y-2">
          {(errors["solarRadiationSettings.lat"] || errors["solarRadiationSettings.lon"]) ? (
            <p className="text-sm text-red-600">
              {errors["solarRadiationSettings.lat"] ?? errors["solarRadiationSettings.lon"]}
            </p>
          ) : null}
          <button
            disabled={!canFetch}
            onClick={handleFetch}
            className="w-full rounded-xl bg-sky-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {loading ? t("system.solarRadiationFetching") : t("system.solarRadiationFetch")}
          </button>
          <div className="min-h-5 space-y-1">
            {error && <span className="text-sm text-red-600">{error}</span>}
            {source && !error && <span className="text-xs text-slate-400">{source}</span>}
            {servedTmy && !error && <span className="block text-xs text-slate-400">{servedTmy}</span>}
          </div>
        </div>
      </>
    ),
  };
}

function SolarSectionLayout({
  isAuto,
  panelFields,
  radiationTable,
  autoControls,
}: {
  isAuto: boolean;
  panelFields: React.ReactNode;
  radiationTable: React.ReactNode;
  autoControls: { map: React.ReactNode; controls: React.ReactNode } | null;
}) {
  if (!isAuto) {
    return (
      <div className="grid gap-4 xl:grid-cols-[minmax(18rem,0.84fr)_minmax(24rem,1.16fr)] xl:grid-rows-3 xl:gap-x-8">
        <div className="space-y-4 xl:row-span-3 xl:grid xl:grid-rows-subgrid xl:space-y-0">{panelFields}</div>
        <div className="space-y-4 xl:row-span-3 xl:grid xl:min-w-0 xl:grid-rows-subgrid xl:space-y-0">{radiationTable}</div>
      </div>
    );
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] xl:gap-8">
      <div className="space-y-5">
        <div className="space-y-4">{panelFields}</div>
        <div className="space-y-4">{radiationTable}</div>
      </div>
      <div className="flex flex-col gap-4">
        {autoControls?.map}
        <div className="grid grid-cols-3 gap-4">{autoControls?.controls}</div>
      </div>
    </div>
  );
}

function SolarRadiationTable({
  monthRows,
  solarRadiationDrafts,
  focusedSolarMonthRef,
  handleSolarRadiationChange,
  handleSolarRadiationBlur,
  unitLabel = "kWh/m²",
  disabled = false,
}: {
  monthRows: MonthKey[][];
  solarRadiationDrafts: Record<MonthKey, string>;
  focusedSolarMonthRef: React.MutableRefObject<MonthKey | null>;
  handleSolarRadiationChange: (month: MonthKey, value: string) => void;
  handleSolarRadiationBlur: (month: MonthKey) => void;
  unitLabel?: string;
  disabled?: boolean;
}) {
  return (
    <>
      {/* Mobile: flat 3-col grid */}
      <div className="grid grid-cols-3 gap-4 xl:hidden">
        {monthRows.flat().map((month) => (
          <SolarRadiationMonthField
            key={`m-${month}`}
            month={month}
            value={solarRadiationDrafts[month]}
            focusedSolarMonthRef={focusedSolarMonthRef}
            onChange={handleSolarRadiationChange}
            onBlur={handleSolarRadiationBlur}
            unitLabel={unitLabel}
            disabled={disabled}
          />
        ))}
      </div>
      {/* Desktop: 3 rows of 4 for subgrid alignment */}
      {monthRows.map((row, rowIndex) => (
        <div key={`solar-row-${rowIndex}`} className="hidden gap-4 xl:flex">
          {row.map((month) => (
            <SolarRadiationMonthField
              key={month}
              month={month}
              value={solarRadiationDrafts[month]}
              focusedSolarMonthRef={focusedSolarMonthRef}
              onChange={handleSolarRadiationChange}
              onBlur={handleSolarRadiationBlur}
              unitLabel={unitLabel}
              disabled={disabled}
            />
          ))}
        </div>
      ))}
    </>
  );
}

function SolarRadiationMonthField({
  month,
  value,
  focusedSolarMonthRef,
  onChange,
  onBlur,
  unitLabel = "kWh/m²",
  disabled = false,
}: {
  month: MonthKey;
  value: string;
  focusedSolarMonthRef: React.MutableRefObject<MonthKey | null>;
  onChange: (month: MonthKey, value: string) => void;
  onBlur: (month: MonthKey) => void;
  unitLabel?: string;
  disabled?: boolean;
}) {
  const { t } = useLanguage();

  return (
    <label className="block min-w-0 flex-1 space-y-2">
      <span className={`${workspaceFieldLabelRowClassName} ${workspaceFieldLabelClassName} justify-center`}>{MONTH_LABELS[month]}</span>
      <div className="relative">
        <input
          type="text"
          inputMode="decimal"
          value={value}
          disabled={disabled}
          onFocus={() => {
            focusedSolarMonthRef.current = month;
          }}
          onChange={(e) => onChange(month, e.target.value)}
          onBlur={() => onBlur(month)}
          className={`pr-14 sm:pr-20 ${workspaceInputClassName} ${disabled ? "bg-slate-50 text-slate-500 cursor-not-allowed" : ""}`}
          aria-label={`${t("system.solarRadiationAria")} ${MONTH_LABELS[month]}`}
          placeholder={disabled ? "—" : "0.0"}
        />
        <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-[11px] sm:text-sm font-semibold text-slate-950">
          {unitLabel}
        </span>
      </div>
    </label>
  );
}

