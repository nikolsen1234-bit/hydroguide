import { useEffect, useMemo, useRef, useState, type FormEvent, type PointerEvent as ReactPointerEvent } from "react";
import RadioLinkMap from "../components/RadioLinkMap";
import WorkspaceHeader from "../components/WorkspaceHeader";
import WorkspaceSection from "../components/WorkspaceSection";
import { useConfigurationContext } from "../context/ConfigurationContext";
import { useLanguage } from "../i18n";
import {
  workspaceBodyClassName,
  workspaceBodyStrongClassName,
  workspaceChartTooltipTextFontSize,
  workspaceChartTooltipTitleFontSize,
  workspaceFieldLabelClassName,
  workspaceFieldLabelRowClassName,
  workspaceFieldStackClassName,
  workspaceMetaClassName,
  workspacePageClassName,
  workspacePrimaryButtonClassName,
  workspaceSecondaryButtonClassName,
  workspaceSubsectionTitleClassName,
  workspaceTallInputClassName
} from "../styles/workspace";
import type { HeightScale, KFactorKey } from "../types";
import { formatNumber } from "../utils/format";
import {
  clampFresnelFactor,
  parseCoordinateInput,
  runRadioLinkAnalysis,
  type RadioLinkAnalysis,
  type RadioLinkEndpointInput,
  type RadioLinkPoint,
  type RadioLinkFormState
} from "../utils/radioLink";

const fieldClassName = workspaceTallInputClassName;

const numberFieldClassName = `${fieldClassName} hide-number-spin`;
const segmentedControlClassName = "inline-flex shrink-0 rounded-lg border border-[var(--hg-hairline)] bg-[var(--hg-surface-2)] p-0.5";
const segmentedButtonClassName =
  "rounded-md px-3 py-1.5 text-[length:var(--hg-type-ui-size)] font-[var(--hg-type-weight-semibold)] transition";
const activeSegmentClassName = "bg-[var(--hg-accent)] text-white";
const inactiveSegmentClassName = "text-[var(--hg-muted)] hover:bg-[var(--hg-surface)] hover:text-[var(--hg-ink)]";
const endpointPanelClassName = "rounded-lg border border-[var(--hg-hairline)] bg-[var(--hg-surface)] p-3";
const endpointBadgeClassName = (tone: "cool" | "warm") =>
  tone === "cool"
    ? "border-[var(--hg-accent-2)] bg-[var(--hg-accent-soft)] text-[var(--hg-accent)]"
    : "border-[var(--hg-hairline)] bg-[var(--hg-warn-soft)] text-[var(--hg-warn)]";

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mql = window.matchMedia("(max-width: 767px)");
    setIsMobile(mql.matches);
    const handler = (event: MediaQueryListEvent) => setIsMobile(event.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, []);
  return isMobile;
}

function formatNumberDraft(value: number | ""): string {
  return value === "" ? "" : String(value);
}

function InlineUnitInput({
  label,
  unit,
  value,
  min,
  step: _step,
  allowEmpty = false,
  placeholder,
  inputPaddingClassName = "pr-20",
  onChange
}: {
  label: string;
  unit: string;
  value: number | "";
  min?: number;
  step?: number | "any";
  allowEmpty?: boolean;
  placeholder?: string;
  inputPaddingClassName?: string;
  onChange: (value: number | "") => void;
}) {
  const allowNegative = min === undefined || min < 0;
  const inputMode = "decimal";
  const [draftValue, setDraftValue] = useState(() => formatNumberDraft(value));
  const isEditingRef = useRef(false);

  useEffect(() => {
    if (!isEditingRef.current) {
      setDraftValue(formatNumberDraft(value));
    }
  }, [value]);

  return (
    <label className={`block ${workspaceFieldStackClassName}`}>
      <span className={workspaceFieldLabelClassName}>{label}</span>
      <div className="relative">
        <input
          type="text"
          inputMode={inputMode}
          value={draftValue}
          placeholder={placeholder}
          onFocus={() => {
            isEditingRef.current = true;
          }}
          onChange={(event) => {
            const normalized = event.target.value.replace(",", ".");
            const pattern = allowNegative ? /^-?\d*(?:\.\d*)?$/ : /^\d*(?:\.\d*)?$/;

            if (!pattern.test(normalized)) {
              return;
            }

            setDraftValue(normalized);

            if (normalized === "") {
              if (allowEmpty) {
                onChange("");
              }
              return;
            }

            if (normalized === "." || normalized === "-" || normalized === "-." || normalized.endsWith(".")) {
              return;
            }

            const numericValue = Number(normalized);
            if (Number.isNaN(numericValue)) {
              return;
            }

            onChange(numericValue);
          }}
          onBlur={() => {
            isEditingRef.current = false;

            if (draftValue === "") {
              if (allowEmpty) {
                onChange("");
                return;
              }

              setDraftValue(formatNumberDraft(value));
              return;
            }

            if (draftValue === "." || draftValue === "-" || draftValue === "-.") {
              if (allowEmpty) {
                setDraftValue("");
                onChange("");
                return;
              }

              setDraftValue(formatNumberDraft(value));
              return;
            }

            const numericValue = Number(draftValue);
            if (Number.isNaN(numericValue)) {
              setDraftValue(formatNumberDraft(value));
              return;
            }

            onChange(numericValue);
          }}
          className={`${numberFieldClassName} ${inputPaddingClassName}`}
        />
        <span className={`pointer-events-none absolute inset-y-0 right-4 flex items-center ${workspaceFieldLabelClassName}`}>
          {unit}
        </span>
      </div>
    </label>
  );
}

function ProfileChart({ analysis }: { analysis: RadioLinkAnalysis | null }) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const isMobile = useIsMobile();
  const { t } = useLanguage();

  if (!analysis) {
    return (
      <div className={`flex h-64 items-center justify-center rounded-lg border border-[var(--hg-hairline)] bg-[var(--hg-surface-2)] text-[var(--hg-muted)] ${workspaceBodyClassName}`}>
        {t("radio.noProfile")}
      </div>
    );
  }

  const width = isMobile ? 430 : 1200;
  const height = isMobile ? 300 : 360;
  const padding = isMobile
    ? { top: 16, right: 8, bottom: 34, left: 36 }
    : { top: 22, right: 12, bottom: 42, left: 56 };

  const yAxisFontSize = "var(--hg-type-chart-size)";
  const tooltipTitleFontSize = workspaceChartTooltipTitleFontSize;
  const tooltipBodyFontSize = workspaceChartTooltipTextFontSize;
  const distanceTickFontSize = "var(--hg-type-chart-size)";
  const tooltipWidth = isMobile ? 158 : 200;
  const tooltipHeight = isMobile ? 116 : 126;

  const sampleStep = Math.max(1, Math.ceil(analysis.series.terrain.length / 260));
  const indexes = analysis.series.terrain
    .map((_, index) => index)
    .filter((_, index) => index % sampleStep === 0 || index === analysis.series.terrain.length - 1);

  const earthCurve = indexes.map((index) => analysis.series.earthCurve[index]);
  const terrain = indexes.map((index) => analysis.series.terrain[index] - analysis.series.earthCurve[index]);
  const lineOfSight = indexes.map((index) => analysis.series.lineOfSight[index]);
  const fresnelLower = indexes.map((index) => analysis.series.fresnelLower[index]);
  const fresnelUpper = indexes.map((index) => analysis.series.fresnelUpper[index]);
  const allValues = [...terrain, ...lineOfSight, ...fresnelLower, ...fresnelUpper, ...earthCurve];
  const minValue = Math.min(...allValues);
  const maxValue = Math.max(...allValues);
  const range = maxValue - minValue || 1;
  const topPadding = range * 0.1;
  const bottomPadding = range * 0.08;
  const chartMin = minValue >= 0 ? 0 : minValue - bottomPadding;
  const chartMax = maxValue + topPadding;
  const chartRange = chartMax - chartMin || 1;

  const toX = (index: number) =>
    padding.left + (index / Math.max(indexes.length - 1, 1)) * (width - padding.left - padding.right);
  const toY = (value: number) =>
    height - padding.bottom - ((value - chartMin) / chartRange) * (height - padding.top - padding.bottom);

  const buildLine = (values: number[]) =>
    values.map((value, index) => `${index === 0 ? "M" : "L"} ${toX(index).toFixed(2)} ${toY(value).toFixed(2)}`).join(" ");

  const distancesKm = indexes.map((index) =>
    Number(((analysis.terrainDistanceKm * index) / Math.max(analysis.series.terrain.length - 1, 1)).toFixed(2))
  );

  const terrainArea =
    terrain
      .map((value, index) => `${index === 0 ? "M" : "L"} ${toX(index).toFixed(2)} ${toY(value).toFixed(2)}`)
      .join(" ") +
    ` L ${toX(terrain.length - 1).toFixed(2)} ${(height - padding.bottom).toFixed(2)}` +
    ` L ${toX(0).toFixed(2)} ${(height - padding.bottom).toFixed(2)} Z`;

  const hoveredIndex = activeIndex ?? Math.max(0, indexes.length - 1);
  const hoverX = toX(hoveredIndex);
  const hoverTerrainY = toY(terrain[hoveredIndex]);
  const hoverLineOfSightY = toY(lineOfSight[hoveredIndex]);
  const hoverTooltipX = Math.min(Math.max(hoverX + 12, 16), width - tooltipWidth - 8);
  const hoverTooltipY = Math.max(18, Math.min(hoverTerrainY - tooltipHeight - 6, height - tooltipHeight - 38));

  function handlePointerMove(event: ReactPointerEvent<SVGSVGElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    const relativeX = ((event.clientX - bounds.left) / bounds.width) * width;
    const chartWidth = width - padding.left - padding.right;
    const clampedX = Math.min(width - padding.right, Math.max(padding.left, relativeX));
    const ratio = chartWidth <= 0 ? 0 : (clampedX - padding.left) / chartWidth;
    const nextIndex = Math.round(ratio * Math.max(indexes.length - 1, 0));
    setActiveIndex(Math.max(0, Math.min(indexes.length - 1, nextIndex)));
  }

  return (
    <div className="space-y-5">
      <div className={`pt-2 ${isMobile ? "" : "xl:-mx-4 2xl:-mx-6"}`}>
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="block h-auto w-full cursor-crosshair"
          role="img"
          aria-label={t("radio.terrainProfile")}
          onPointerMove={handlePointerMove}
          onPointerLeave={() => setActiveIndex(null)}
        >
          {[0, 1, 2, 3, 4].map((step) => {
            const value = chartMin + (chartRange * step) / 4;
            const y = toY(value);

            return (
              <g key={step}>
                <line x1={padding.left} x2={width - padding.right} y1={y} y2={y} stroke="var(--hg-hairline)" strokeDasharray="4 6" />
                <text x={padding.left - 8} y={y - 6} fontSize={yAxisFontSize} fill="var(--hg-muted)" textAnchor="end">
                  {formatNumber(value, 0)} m
                </text>
              </g>
            );
          })}

          {[0, 1, 2, 3, 4].map((step) => {
            const x = padding.left + ((width - padding.left - padding.right) * step) / 4;
            return <line key={`tick-${step}`} x1={x} x2={x} y1={padding.top} y2={height - padding.bottom} stroke="var(--hg-hairline-2)" />;
          })}

          <path d={terrainArea} fill="url(#terrainFill)" />
          <path d={buildLine(terrain)} fill="none" stroke="var(--hg-ink-2)" strokeWidth="2.6" />
          <path d={buildLine(earthCurve)} fill="none" stroke="var(--hg-accent-2)" strokeWidth="2" />
          <path d={buildLine(fresnelUpper)} fill="none" stroke="var(--hg-warn)" strokeWidth="1.8" strokeDasharray="5 7" />
          <path d={buildLine(fresnelLower)} fill="none" stroke="var(--hg-warn)" strokeWidth="1.8" strokeDasharray="5 7" />
          <path d={buildLine(lineOfSight)} fill="none" stroke="var(--hg-ok)" strokeWidth="2.2" />

          <line x1={hoverX} x2={hoverX} y1={padding.top} y2={height - padding.bottom} stroke="var(--hg-muted)" strokeDasharray="4 6" />
          <circle cx={hoverX} cy={hoverTerrainY} r="4.5" fill="var(--hg-ink-2)" stroke="var(--hg-surface)" strokeWidth="2" />
          <circle cx={hoverX} cy={hoverLineOfSightY} r="4" fill="var(--hg-ok)" stroke="var(--hg-surface)" strokeWidth="2" />

          {[analysis.pointA, analysis.pointB].map((point, index) => (
            <g key={`${point.lat}-${point.lng}`}>
              <circle
                cx={index === 0 ? toX(0) : toX(indexes.length - 1)}
                cy={index === 0 ? toY(lineOfSight[0]) : toY(lineOfSight[lineOfSight.length - 1])}
                r="5.5"
                fill={index === 0 ? "var(--hg-accent-soft)" : "var(--hg-warn-soft)"}
                stroke={index === 0 ? "var(--hg-accent-2)" : "var(--hg-warn)"}
                strokeWidth="2"
              />
            </g>
          ))}

          <g>
            <rect
              x={hoverTooltipX}
              y={hoverTooltipY}
              width={tooltipWidth}
              height={tooltipHeight}
              rx="12"
              fill="var(--hg-surface)"
              stroke="var(--hg-hairline)"
              strokeWidth="1.2"
            />
            <text x={hoverTooltipX + 12} y={hoverTooltipY + 20} fontSize={tooltipTitleFontSize} fontWeight="var(--hg-type-weight-bold)" fill="var(--hg-ink)">
              {t("radio.distance")} {formatNumber(distancesKm[hoveredIndex], 2)} km
            </text>
            <text x={hoverTooltipX + 12} y={hoverTooltipY + 37} fontSize={tooltipBodyFontSize} fill="var(--hg-ink-2)">
              {t("radio.terrain")} {formatNumber(terrain[hoveredIndex], 1)} m
            </text>
            <text x={hoverTooltipX + 12} y={hoverTooltipY + 54} fontSize={tooltipBodyFontSize} fill="var(--hg-accent-2)">
              {t("radio.earthCurve")} {formatNumber(earthCurve[hoveredIndex], 2)} m
            </text>
            <text x={hoverTooltipX + 12} y={hoverTooltipY + 71} fontSize={tooltipBodyFontSize} fill="var(--hg-ok)">
              {t("radio.lineOfSight")} {formatNumber(lineOfSight[hoveredIndex], 1)} m
            </text>
            <text x={hoverTooltipX + 12} y={hoverTooltipY + 88} fontSize={tooltipBodyFontSize} fill="var(--hg-warn)">
              {t("radio.fresnelLower")} {formatNumber(fresnelLower[hoveredIndex], 1)} m
            </text>
            <text x={hoverTooltipX + 12} y={hoverTooltipY + 105} fontSize={tooltipBodyFontSize} fill="var(--hg-warn)">
              {t("radio.fresnelUpper")} {formatNumber(fresnelUpper[hoveredIndex], 1)} m
            </text>
          </g>

          {analysis.distanceTicksKm.map((tick, index) => {
            const isFirst = index === 0;
            const isLast = index === analysis.distanceTicksKm.length - 1;
            const x = padding.left + (index / (analysis.distanceTicksKm.length - 1)) * (width - padding.left - padding.right);
            return (
              <text
                key={`dist-${tick}-${index}`}
                x={x}
                y={height - 6}
                fontSize={distanceTickFontSize}
                fontWeight="var(--hg-type-weight-semibold)"
                fill="var(--hg-muted)"
                textAnchor={isFirst ? "start" : isLast ? "end" : "middle"}
                letterSpacing="var(--hg-type-chart-tick-tracking)"
              >
                {formatNumber(tick, 2)} KM
              </text>
            );
          })}

          <defs>
            <linearGradient id="terrainFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--hg-ink-2)" stopOpacity="0.28" />
              <stop offset="100%" stopColor="var(--hg-ink-2)" stopOpacity="0.04" />
            </linearGradient>
          </defs>
        </svg>
      </div>

      <div className={`flex flex-wrap gap-3 ${workspaceMetaClassName}`} style={{ paddingLeft: isMobile ? 0 : `${(padding.left / width) * 100}%` }}>
        <span className="flex items-center gap-2">
          <span className="h-3.5 w-3.5 rounded-sm bg-[var(--hg-ink-2)]" />
          {t("radio.terrain")}
        </span>
        <span className="flex items-center gap-2">
          <span className="h-3.5 w-3.5 rounded-sm bg-[var(--hg-accent-2)]" />
          {t("radio.earthCurve")}
        </span>
        <span className="flex items-center gap-2">
          <span className="h-3.5 w-3.5 rounded-sm bg-[var(--hg-ok)]" />
          {t("radio.lineOfSight")}
        </span>
        <span className="flex items-center gap-2">
          <span className="h-3.5 w-3.5 rounded-sm bg-[var(--hg-warn)]" />
          {t("radio.fresnel")}
        </span>
      </div>
    </div>
  );
}

function StationPanel({
  label,
  tone,
  endpoint,
  onCoordinateChange,
  onHeightChange,
  onScaleChange
}: {
  label: string;
  tone: "cool" | "warm";
  endpoint: RadioLinkEndpointInput;
  onCoordinateChange: (value: string) => void;
  onHeightChange: (value: number | "") => void;
  onScaleChange: (value: HeightScale) => void;
}) {
  const { t } = useLanguage();
  const heightScaleOptions = [
    { value: "AGL" as HeightScale, label: t("radio.agl") },
    { value: "ASL" as HeightScale, label: t("radio.asl") }
  ];
  const heightUnit = endpoint.heightScale === "AGL" ? t("radio.metersAboveGround") : t("radio.metersAboveSeaLevel");

  return (
    <section className={endpointPanelClassName}>
      <div className="space-y-4">
        <label className="block">
          <span className={`${workspaceFieldLabelRowClassName} mb-2 gap-3`}>
            <span className={`hg-mono inline-flex h-7 min-w-7 items-center justify-center rounded-md border px-2 text-[length:var(--hg-type-meta-size)] font-[var(--hg-type-weight-extra)] ${endpointBadgeClassName(tone)}`}>
              {label}
            </span>
            <span className={workspaceFieldLabelClassName}>{t("radio.location")} {label}</span>
          </span>
          <input
            value={endpoint.coordinate}
            onChange={(event) => onCoordinateChange(event.target.value)}
            className={fieldClassName}
            placeholder={t("radio.coordinateXY")}
          />
        </label>

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <span className={workspaceFieldLabelClassName}>{t("radio.antennaHeight")}</span>
            <div className={segmentedControlClassName}>
              {heightScaleOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => onScaleChange(option.value)}
                  className={`${segmentedButtonClassName} ${
                    endpoint.heightScale === option.value
                      ? activeSegmentClassName
                      : inactiveSegmentClassName
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <InlineUnitInput
            label=""
            unit={heightUnit}
            value={endpoint.antennaHeight}
            min={0}
            allowEmpty
            placeholder={t("radio.enterHeight")}
            inputPaddingClassName="pr-40"
            onChange={onHeightChange}
          />
        </div>
      </div>
    </section>
  );
}

function ResultRow({ label, value, tone = "default" }: { label: string; value: string; tone?: "default" | "good" | "bad" }) {
  const valueClassName =
    tone === "good" ? "text-[var(--hg-ok)]" : tone === "bad" ? "text-rose-600" : "text-[var(--hg-ink)]";

  return (
    <div className="grid gap-1 border-t border-[var(--hg-hairline-2)] py-3 first:border-t-0 first:pt-0 sm:grid-cols-[minmax(0,1fr)_8.5rem] sm:items-center sm:gap-4">
      <span className={`${workspaceBodyStrongClassName} text-[var(--hg-ink)]`}>{label}</span>
      <span className={`${workspaceBodyClassName} tabular-nums ${valueClassName} sm:text-right`}>{value}</span>
    </div>
  );
}

export default function RadioLinkPage() {
  const { activeDraft, resetDraft, saveDraftMetadata, updateConfigSectionField, updateRadioLinkEndpoint, updateCachedRadioAnalysis } = useConfigurationContext();
  const { t } = useLanguage();
  const [analysis, setAnalysis] = useState<RadioLinkAnalysis | null>(
    (activeDraft.cachedRadioAnalysis as RadioLinkAnalysis) ?? null
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nextMapPoint, setNextMapPoint] = useState<"pointA" | "pointB">("pointA");
  const [showMapMarkers, setShowMapMarkers] = useState(!!activeDraft.cachedRadioAnalysis);
  const [mapFitVersion, setMapFitVersion] = useState(activeDraft.cachedRadioAnalysis ? 1 : 0);
  const requestIdRef = useRef(0);
  const form = activeDraft.radioLink;
  const mapPointA = useMemo(() => parseCoordinateInput(form.pointA.coordinate), [form.pointA.coordinate]);
  const mapPointB = useMemo(() => parseCoordinateInput(form.pointB.coordinate), [form.pointB.coordinate]);

  useEffect(() => {
    setNextMapPoint(!mapPointA ? "pointA" : !mapPointB ? "pointB" : "pointA");
    if (!activeDraft.cachedRadioAnalysis) {
      setMapFitVersion(0);
    }
  }, [activeDraft.id]);

  useEffect(() => {
    if (!mapPointA) {
      setNextMapPoint("pointA");
      return;
    }

    if (!mapPointB) {
      setNextMapPoint("pointB");
    }
  }, [mapPointA, mapPointB]);

  async function calculate(nextForm: RadioLinkFormState) {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setLoading(true);
    setError(null);

    try {
      const nextAnalysis = await runRadioLinkAnalysis(nextForm);
      if (requestIdRef.current !== requestId) {
        return;
      }

      setAnalysis(nextAnalysis);
      updateCachedRadioAnalysis(nextAnalysis);
      setShowMapMarkers(true);
      setMapFitVersion((current) => current + 1);
    } catch (nextError) {
      if (requestIdRef.current !== requestId) {
        return;
      }

      setError(nextError instanceof Error ? nextError.message : t("radio.failedCalculation"));
    } finally {
      if (requestIdRef.current === requestId) {
        setLoading(false);
      }
    }
  }

  function handleMapClick(point: RadioLinkPoint) {
    setShowMapMarkers(true);
    const targetPoint = nextMapPoint;
    updateRadioLinkEndpoint(targetPoint, { coordinate: `${point.lat.toFixed(6)}, ${point.lng.toFixed(6)}` });
    setNextMapPoint(targetPoint === "pointA" ? "pointB" : "pointA");
  }

  function handleMapPointChange(pointKey: "pointA" | "pointB", point: RadioLinkPoint) {
    setShowMapMarkers(true);
    updateRadioLinkEndpoint(pointKey, { coordinate: `${point.lat.toFixed(6)}, ${point.lng.toFixed(6)}` });
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void calculate(form);
  }

  function handleReset() {
    requestIdRef.current += 1;
    setLoading(false);
    setError(null);
    setAnalysis(null);
    updateCachedRadioAnalysis(null);
    setShowMapMarkers(false);
    resetDraft();
  }

  /* ---- Shared fragments reused by both mobile and desktop layouts ---- */

  const stationPanels = (
    <>
      <StationPanel
        label="A"
        tone="cool"
        endpoint={form.pointA}
        onCoordinateChange={(value) => updateRadioLinkEndpoint("pointA", { coordinate: value })}
        onHeightChange={(value) => updateRadioLinkEndpoint("pointA", { antennaHeight: value })}
        onScaleChange={(value) => updateRadioLinkEndpoint("pointA", { heightScale: value })}
      />
      <StationPanel
        label="B"
        tone="warm"
        endpoint={form.pointB}
        onCoordinateChange={(value) => updateRadioLinkEndpoint("pointB", { coordinate: value })}
        onHeightChange={(value) => updateRadioLinkEndpoint("pointB", { antennaHeight: value })}
        onScaleChange={(value) => updateRadioLinkEndpoint("pointB", { heightScale: value })}
      />
    </>
  );

  const radioParamFields = (
    <>
      <InlineUnitInput
        label={t("radio.frequency")}
        unit="MHz"
        min={1}
        step={0.1}
        value={form.frequencyMHz}
        onChange={(value) => {
          if (value === "") {
            return;
          }

          updateConfigSectionField("radioLink", "frequencyMHz", value);
        }}
      />

      <label className={`block ${workspaceFieldStackClassName}`}>
        <span className={workspaceFieldLabelClassName}>{t("radio.fresnel")}</span>
        <div className="flex h-12 items-center gap-3">
          <input
            type="range"
            min="0.6"
            max="3"
            step="0.1"
            value={form.fresnelFactor}
            onChange={(event) =>
              updateConfigSectionField("radioLink", "fresnelFactor", clampFresnelFactor(Number(event.target.value)))
            }
            className="radiolink-slider min-w-0 flex-1"
          />
          <div className="hg-mono inline-flex min-w-[3.75rem] justify-center rounded-lg border border-[var(--hg-hairline)] bg-[var(--hg-surface)] px-3 py-1 text-[length:var(--hg-type-ui-size)] font-[var(--hg-type-weight-semibold)] text-[var(--hg-ink)] tabular-nums">
            {formatNumber(form.fresnelFactor, 1)}
          </div>
        </div>
      </label>

      <label className={`block ${workspaceFieldStackClassName}`}>
        <span className={workspaceFieldLabelClassName}>{t("radio.kFactor")}</span>
        <select
          value={form.kFactor}
          onChange={(event) => updateConfigSectionField("radioLink", "kFactor", event.target.value as KFactorKey)}
          className={fieldClassName}
        >
          <option value="4/3">4/3</option>
          <option value="1">1</option>
          <option value="2/3">2/3</option>
          <option value="-2/3">-2/3</option>
        </select>
      </label>

      <label className={`block ${workspaceFieldStackClassName}`}>
        <span className={workspaceFieldLabelClassName}>{t("radio.polarization")}</span>
        <select
          value={form.polarization}
          onChange={(event) =>
            updateConfigSectionField("radioLink", "polarization", event.target.value as "horizontal" | "vertical")
          }
          className={fieldClassName}
        >
          <option value="horizontal">{t("radio.horizontal")}</option>
          <option value="vertical">{t("radio.vertical")}</option>
        </select>
      </label>

      <InlineUnitInput
        label={t("radio.rain")}
        unit="mm/h"
        min={0}
        step={1}
        value={form.rainFactor}
        onChange={(value) => {
          if (value === "") {
            return;
          }

          updateConfigSectionField("radioLink", "rainFactor", value);
        }}
      />
    </>
  );

  const resultRows = (
    <>
      <ResultRow
        label={t("radio.losClearance")}
        value={analysis ? `${analysis.lineClearanceM >= 0 ? "+" : ""}${formatNumber(analysis.lineClearanceM, 1)} m` : "-"}
        tone={analysis ? (analysis.lineClearanceM >= 0 ? "good" : "bad") : "default"}
      />
      <ResultRow label={t("radio.rainAttenuation")} value={analysis ? `${formatNumber(analysis.rainAttenuationDb, 2)} dB` : "-"} />
      <ResultRow
        label={t("radio.azimuth")}
        value={analysis ? `${formatNumber(analysis.azimuthA, 1)}\u00B0 / ${formatNumber(analysis.azimuthB, 1)}\u00B0` : "-"}
      />
      <ResultRow label={t("radio.terrainDistance")} value={analysis ? `${formatNumber(analysis.terrainDistanceKm, 2)} km` : "-"} />
      <ResultRow label={t("radio.linkDistance")} value={analysis ? `${formatNumber(analysis.linkDistanceKm, 2)} km` : "-"} />
      <ResultRow label={t("radio.freeSpaceLoss")} value={analysis ? `${formatNumber(analysis.freeSpaceLossDb, 2)} dB` : "-"} />
      <ResultRow
        label={t("radio.elevation")}
        value={analysis ? `${formatNumber(analysis.elevationA, 2)}\u00B0 / ${formatNumber(analysis.elevationB, 2)}\u00B0` : "-"}
      />
      <ResultRow
        label={t("radio.fresnelClearance")}
        value={analysis ? `${analysis.fresnelClearanceM >= 0 ? "+" : ""}${formatNumber(analysis.fresnelClearanceM, 1)} m` : "-"}
        tone={analysis ? (analysis.fresnelClearanceM >= 0 ? "good" : "bad") : "default"}
      />
      <ResultRow
        label={t("radio.pointA")}
        value={analysis ? `${formatNumber(analysis.startAltitudeM, 0)} ${t("radio.masl")}` : "-"}
      />
      <ResultRow
        label={t("radio.pointB")}
        value={analysis ? `${formatNumber(analysis.endAltitudeM, 0)} ${t("radio.masl")}` : "-"}
      />
    </>
  );

  const submitButton = (
    <button
      type="submit"
      disabled={loading}
      className="h-10 w-full rounded-lg bg-[var(--hg-accent)] px-4 text-[length:var(--hg-type-ui-size)] font-[var(--hg-type-weight-semibold)] text-white disabled:cursor-wait disabled:opacity-75 sm:w-auto md:transition md:hover:bg-[var(--hg-accent-2)] xl:min-w-[10rem]"
    >
      {loading ? t("radio.calculating") : t("radio.calculate")}
    </button>
  );

  return (
    <main className={workspacePageClassName}>
      <WorkspaceHeader
        title={t("radio.title")}
        actions={
          <>
            <button type="button" onClick={handleReset} className={workspaceSecondaryButtonClassName}>
              {t("shared.reset")}
            </button>
            <button type="button" onClick={saveDraftMetadata} className={workspacePrimaryButtonClassName}>
              {t("shared.save")}
            </button>
          </>
        }
      />

      {/* ==================== MOBILE LAYOUT ==================== */}
      <div className="space-y-5 md:hidden">
        <form onSubmit={handleSubmit}>
          <div className="space-y-5">
            {/* Compact map */}
            <div className="-mt-2 mb-5">
              <div className="h-[42vh] min-h-[300px] max-h-[430px]">
                <RadioLinkMap
                  pointA={showMapMarkers ? mapPointA : null}
                  pointB={showMapMarkers ? mapPointB : null}
                  onMapClick={handleMapClick}
                  onPointChange={handleMapPointChange}
                  nextPoint={nextMapPoint}
                  fitKey={mapFitVersion > 0 ? `${activeDraft.id}:${mapFitVersion}` : undefined}
                />
              </div>
            </div>

            {/* Compact station cards */}
            <div className="grid grid-cols-1 gap-3 min-[520px]:grid-cols-2">
              {([
                { lbl: "A", tone: "cool" as const, ep: form.pointA, key: "pointA" as const },
                { lbl: "B", tone: "warm" as const, ep: form.pointB, key: "pointB" as const }
              ]).map(({ lbl, tone, ep, key }) => {
                const parsed = key === "pointA" ? mapPointA : mapPointB;
                const isSelectedForMap = nextMapPoint === key;
                return (
                  <div
                    key={lbl}
                    role="button"
                    tabIndex={0}
                    aria-pressed={isSelectedForMap}
                    aria-label={`${t("radio.location")} ${lbl}`}
                    className={`${endpointPanelClassName} space-y-2 focus:outline-none focus:ring-2 focus:ring-[var(--hg-accent-2)]`}
                    onClick={() => setNextMapPoint(key)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        setNextMapPoint(key);
                      }
                    }}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className={`hg-mono inline-flex h-7 w-7 items-center justify-center rounded-md border text-[length:var(--hg-type-meta-size)] font-[var(--hg-type-weight-extra)] ${endpointBadgeClassName(tone)}`}>
                          {lbl}
                        </span>
                        <span className={workspaceSubsectionTitleClassName}>{t("radio.location")} {lbl}</span>
                      </div>
                      <span className={`text-[length:var(--hg-type-meta-size)] font-[var(--hg-type-weight-semibold)] ${parsed ? "text-[var(--hg-ok)]" : "text-[var(--hg-muted)]"}`}>
                        {parsed ? t("radio.set") : t("radio.notSet")}
                      </span>
                    </div>
                    <input
                      value={ep.coordinate}
                      onChange={(e) => updateRadioLinkEndpoint(key, { coordinate: e.target.value })}
                        className={`${fieldClassName} !h-9 !rounded-lg !px-2.5 !text-[length:var(--hg-type-meta-size)]`}
                      placeholder="Lat, Lng"
                    />
                    <div className="flex flex-col gap-2">
                      <input
                        type="text"
                        inputMode="decimal"
                        value={ep.antennaHeight === "" ? "" : String(ep.antennaHeight)}
                        onChange={(e) => {
                          const raw = e.target.value.replace(",", ".");
                          if (/^\d*(?:\.\d*)?$/.test(raw)) {
                            updateRadioLinkEndpoint(key, { antennaHeight: raw === "" ? "" : Number(raw) });
                          }
                        }}
                        className={`${fieldClassName} w-full !h-9 !rounded-lg !px-2.5 !text-[length:var(--hg-type-meta-size)]`}
                        placeholder={t("radio.height")}
                      />
                      <div className="grid grid-cols-2 rounded-lg border border-[var(--hg-hairline)] bg-[var(--hg-surface-2)] p-0.5">
                        {(["AGL", "ASL"] as HeightScale[]).map((hs) => (
                          <button
                            key={hs}
                            type="button"
                            onClick={() => updateRadioLinkEndpoint(key, { heightScale: hs })}
                            className={`rounded-md px-2 py-1 text-[length:var(--hg-type-meta-size)] font-[var(--hg-type-weight-semibold)] ${
                              ep.heightScale === hs ? activeSegmentClassName : inactiveSegmentClassName
                            }`}
                          >
                            {hs === "AGL" ? t("radio.agl") : t("radio.asl")}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Compact radio params */}
            <div className="space-y-3 rounded-lg border border-[var(--hg-hairline)] bg-[var(--hg-surface)] p-3">
              <div className="grid grid-cols-1 gap-3 min-[520px]:grid-cols-2">
                <InlineUnitInput
                  label={t("radio.frequency")}
                  unit="MHz"
                  min={1}
                  step={0.1}
                  value={form.frequencyMHz}
                  onChange={(value) => {
                    if (value !== "") updateConfigSectionField("radioLink", "frequencyMHz", value);
                  }}
                />
                <InlineUnitInput
                  label={t("radio.rain")}
                  unit="mm/h"
                  min={0}
                  step={1}
                  value={form.rainFactor}
                  onChange={(value) => {
                    if (value !== "") updateConfigSectionField("radioLink", "rainFactor", value);
                  }}
                />
                <label className={`block ${workspaceFieldStackClassName}`}>
                  <span className={workspaceFieldLabelClassName}>{t("radio.kFactor")}</span>
                  <select
                    value={form.kFactor}
                    onChange={(event) => updateConfigSectionField("radioLink", "kFactor", event.target.value as KFactorKey)}
                    className={fieldClassName}
                  >
                    <option value="4/3">4/3</option>
                    <option value="1">1</option>
                    <option value="2/3">2/3</option>
                    <option value="-2/3">-2/3</option>
                  </select>
                </label>
                <label className={`block ${workspaceFieldStackClassName}`}>
                  <span className={workspaceFieldLabelClassName}>{t("radio.polarization")}</span>
                  <select
                    value={form.polarization}
                    onChange={(event) =>
                      updateConfigSectionField("radioLink", "polarization", event.target.value as "horizontal" | "vertical")
                    }
                    className={fieldClassName}
                  >
                    <option value="horizontal">{t("radio.horizontal")}</option>
                    <option value="vertical">{t("radio.vertical")}</option>
                  </select>
                </label>
              </div>
              <div className={`${workspaceFieldLabelRowClassName} gap-3`}>
                <span className={`shrink-0 ${workspaceFieldLabelClassName}`}>{t("radio.fresnel")}</span>
                <input
                  type="range"
                  min="0.6"
                  max="3"
                  step="0.1"
                  value={form.fresnelFactor}
                  onChange={(event) =>
                    updateConfigSectionField("radioLink", "fresnelFactor", clampFresnelFactor(Number(event.target.value)))
                  }
                  className="radiolink-slider min-w-0 flex-1"
                />
                <span className="hg-mono shrink-0 rounded-lg border border-[var(--hg-hairline)] bg-[var(--hg-surface)] px-2.5 py-0.5 text-[length:var(--hg-type-ui-size)] font-[var(--hg-type-weight-bold)] text-[var(--hg-ink)] tabular-nums">
                  {formatNumber(form.fresnelFactor, 1)}
                </span>
              </div>
              {submitButton}
            </div>

            {error ? (
              <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-[length:var(--hg-type-ui-size)] font-[var(--hg-type-weight-semibold)] text-rose-700">{error}</div>
            ) : null}
          </div>
        </form>

        {/* Mobile result cards */}
        {analysis ? (
          <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2">
            <div className="rounded-lg border border-[var(--hg-hairline)] bg-[var(--hg-surface)] p-3">
              <p className={workspaceFieldLabelClassName}>{t("radio.pointA")}</p>
              <p className={`mt-1 ${workspaceSubsectionTitleClassName}`}>
                {formatNumber(analysis.startAltitudeM, 0)} {t("radio.masl")}
              </p>
            </div>
            <div className="rounded-lg border border-[var(--hg-hairline)] bg-[var(--hg-surface)] p-3">
              <p className={workspaceFieldLabelClassName}>{t("radio.pointB")}</p>
              <p className={`mt-1 ${workspaceSubsectionTitleClassName}`}>
                {formatNumber(analysis.endAltitudeM, 0)} {t("radio.masl")}
              </p>
            </div>
            <div className="rounded-lg border border-[var(--hg-hairline)] bg-[var(--hg-surface)] p-3">
              <p className={workspaceFieldLabelClassName}>{t("radio.fresnelClearance")}</p>
              <p className={`mt-1 ${workspaceSubsectionTitleClassName} ${analysis.fresnelClearanceM >= 0 ? "text-[var(--hg-ok)]" : "text-rose-600"}`}>
                {analysis.fresnelClearanceM >= 0 ? "+" : ""}
                {formatNumber(analysis.fresnelClearanceM, 1)} m
              </p>
            </div>
            <div className="rounded-lg border border-[var(--hg-hairline)] bg-[var(--hg-surface)] p-3">
              <p className={workspaceFieldLabelClassName}>{t("radio.terrainDistance")}</p>
              <p className={`mt-1 ${workspaceSubsectionTitleClassName}`}>{formatNumber(analysis.terrainDistanceKm, 2)} km</p>
            </div>
          </div>
        ) : null}

        {/* Mobile profile chart */}
        <WorkspaceSection title={t("radio.profileChartSection")} description={t("radio.profileChartSectionDesc")}>
          <div>
            <ProfileChart analysis={analysis} />
          </div>
        </WorkspaceSection>

        {/* Mobile full results (shown only after calculation) */}
        {analysis ? (
          <WorkspaceSection title={t("radio.allResultsSection")}>
            <div>{resultRows}</div>
          </WorkspaceSection>
        ) : null}
      </div>

      {/* ==================== DESKTOP LAYOUT ==================== */}
      <div className="hidden md:grid md:grid-cols-[minmax(0,1.05fr)_minmax(0,1.4fr)] md:gap-4">
        <form onSubmit={handleSubmit} className="space-y-4">
          <WorkspaceSection title={t("radio.locationsSection")} description={t("radio.locationsSectionDesc")}>
            <div className="grid gap-4">
              {stationPanels}
            </div>
          </WorkspaceSection>

          <WorkspaceSection title={t("radio.radioParamsSection")} description={t("radio.radioParamsSectionDesc")}>
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                {radioParamFields}
              </div>
              <div className="flex justify-end">
                <div className="w-full sm:w-auto">{submitButton}</div>
              </div>
            </div>
          </WorkspaceSection>

          <WorkspaceSection title={t("radio.mapSection")} description={t("radio.mapSectionDesc")}>
            <div className="h-[300px]">
              <RadioLinkMap
                pointA={showMapMarkers ? mapPointA : null}
                pointB={showMapMarkers ? mapPointB : null}
                onMapClick={handleMapClick}
                onPointChange={handleMapPointChange}
                nextPoint={nextMapPoint}
                fitKey={mapFitVersion > 0 ? `${activeDraft.id}:${mapFitVersion}` : undefined}
              />
            </div>
          </WorkspaceSection>

          {error ? (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-[length:var(--hg-type-ui-size)] font-[var(--hg-type-weight-semibold)] text-rose-700">{error}</div>
          ) : null}
        </form>

        <div className="space-y-4">
          <WorkspaceSection title={t("radio.profileChartSection")} description={t("radio.profileChartSectionDesc")}>
            <ProfileChart analysis={analysis} />
          </WorkspaceSection>

          <section className="hg-card grid overflow-hidden sm:grid-cols-2">
            {[
              { label: t("radio.terrainDistance"), value: analysis ? `${formatNumber(analysis.terrainDistanceKm, 2)} km` : "-" },
              { label: t("radio.freeSpaceLoss"), value: analysis ? `${formatNumber(analysis.freeSpaceLossDb, 2)} dB` : "-" },
              {
                label: t("radio.fresnelClearance"),
                value: analysis ? `${analysis.fresnelClearanceM >= 0 ? "+" : ""}${formatNumber(analysis.fresnelClearanceM, 1)} m` : "-"
              },
              { label: "Status", value: analysis ? (analysis.fresnelClearanceM >= 0 && analysis.lineClearanceM >= 0 ? "OK" : "Krev tiltak") : "-" }
            ].map((item, index) => (
              <div key={item.label} className={`p-4 ${index === 0 ? "" : "border-t border-[var(--hg-hairline-2)] sm:border-l sm:border-t-0"}`}>
                <p className={workspaceMetaClassName}>{item.label}</p>
                <p className="hg-mono mt-2 text-[1.35rem] font-[var(--hg-type-weight-bold)] tracking-[var(--hg-type-title-tracking)] text-[var(--hg-ink)]">
                  {item.value}
                </p>
              </div>
            ))}
          </section>

          <WorkspaceSection title={t("radio.resultsSection")} description={t("radio.resultsSectionDesc")}>
            <div>{resultRows}</div>
          </WorkspaceSection>
        </div>
      </div>
    </main>
  );
}
