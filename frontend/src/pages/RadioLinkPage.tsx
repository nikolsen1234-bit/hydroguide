import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode, type PointerEvent as ReactPointerEvent } from "react";
import RadioLinkMap from "../components/RadioLinkMap";
import WorkspaceHeader, { WorkspaceHeaderActionButton, workspaceHeaderActionIcons } from "../components/WorkspaceHeader";
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
  workspaceMetaClassName,
  workspacePageClassName,
  workspaceSubsectionTitleClassName
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

const activeSegmentClassName = "border-[var(--hg-accent)] bg-[var(--hg-accent-soft)] text-[var(--hg-accent)]";
const inactiveSegmentClassName = "border-transparent text-[var(--hg-ink-2)] hover:text-[var(--hg-ink)]";
const endpointPanelClassName = "rounded-[8px] border border-[var(--hg-hairline)] bg-[var(--hg-surface)] p-2.5 2xl:p-3.5";
const endpointBadgeClassName = (tone: "cool" | "warm") =>
  tone === "cool"
    ? "border-[var(--hg-accent-2)] bg-[var(--hg-accent-soft)] text-[var(--hg-accent)]"
    : "border-[var(--hg-hairline)] bg-[var(--hg-warn-soft)] text-[var(--hg-warn)]";
const radioBlueprintPanelClassName = "border-t-2 border-[var(--hg-ink)] pt-1.5";
const radioBlueprintKickerClassName =
  "hg-mono text-[10px] font-[var(--hg-type-weight-bold)] uppercase tracking-[0.14em] text-[var(--hg-ink-2)]";
const radioBlueprintTitleClassName =
  "text-[15px] font-[var(--hg-type-weight-extra)] leading-tight tracking-normal text-[var(--hg-ink)]";
const radioBlueprintControlLineClassName =
  "mt-0.5 flex items-baseline gap-2 border-b-2 border-[var(--hg-hairline)] pb-0.5 transition-colors focus-within:border-[var(--hg-accent)]";
const radioBlueprintInputClassName =
  "hg-mono min-w-0 flex-1 border-0 bg-transparent p-0 text-[15px] font-[var(--hg-type-weight-extra)] text-[var(--hg-ink)] outline-none placeholder:text-[var(--hg-muted)] focus:text-[var(--hg-accent)]";
const radioBlueprintSelectClassName =
  "hg-mono min-w-0 flex-1 appearance-none border-0 bg-transparent p-0 text-[15px] font-[var(--hg-type-weight-bold)] text-[var(--hg-ink)] outline-none focus:text-[var(--hg-accent)]";
const radioBlueprintUnitClassName =
  "hg-mono shrink-0 text-[12px] font-[var(--hg-type-weight-bold)] uppercase tracking-[0.1em] text-[var(--hg-ink-2)]";

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
  inputPaddingClassName: _inputPaddingClassName = "pr-20",
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
    <label className="flex min-w-0 flex-col gap-1">
      {label ? <span className={radioBlueprintKickerClassName}>{label}</span> : null}
      <div className={radioBlueprintControlLineClassName}>
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
          className={`${radioBlueprintInputClassName} hide-number-spin`}
        />
        <span className={radioBlueprintUnitClassName}>
          {unit}
        </span>
      </div>
    </label>
  );
}

function EmptyProfilePreview({ compact = false }: { compact?: boolean }) {
  const heightClassName = compact ? "h-full min-h-0" : "h-64";

  return (
    <div className={`${heightClassName} overflow-hidden rounded-[8px] border border-[var(--hg-hairline)] bg-[var(--hg-surface)]`}>
      <svg viewBox="0 0 900 315" preserveAspectRatio={compact ? "none" : "xMidYMid meet"} className="h-full w-full" role="img" aria-label="Forhåndsvisning av terrengprofil">
        <rect width="900" height="315" fill="var(--hg-surface)" />
        {[0, 1, 2, 3, 4].map((step) => {
          const y = 38 + step * 52;
          return (
            <g key={step}>
              <line x1="58" x2="868" y1={y} y2={y} stroke="var(--hg-hairline)" strokeDasharray="4 7" />
              <text x="42" y={y + 4} textAnchor="end" fontSize="11" fill="var(--hg-muted)">
                {1200 - step * 300}
              </text>
            </g>
          );
        })}
        {[0, 1, 2, 3, 4, 5].map((step) => {
          const x = 58 + step * 162;
          return <line key={step} x1={x} x2={x} y1="38" y2="262" stroke="var(--hg-hairline-2)" />;
        })}
        <text x="17" y="32" fontSize="11" fontWeight="700" fill="var(--hg-muted)">
          moh
        </text>
        <path
          d="M58 262 L58 74 L96 132 L138 156 L180 185 L225 170 L272 198 L318 184 L360 215 L404 222 L448 196 L494 228 L536 240 L582 223 L628 238 L674 216 L716 226 L760 203 L806 218 L848 94 L868 262 Z"
          fill="url(#radio-empty-terrain-fill)"
        />
        <path
          d="M58 74 L96 132 L138 156 L180 185 L225 170 L272 198 L318 184 L360 215 L404 222 L448 196 L494 228 L536 240 L582 223 L628 238 L674 216 L716 226 L760 203 L806 218 L848 94"
          fill="none"
          stroke="#5f9d55"
          strokeWidth="2"
        />
        <path d="M58 104 C255 126 472 155 848 142" fill="none" stroke="var(--hg-accent-2)" strokeWidth="2.3" />
        <path
          d="M58 88 C250 103 460 130 848 124M58 120 C260 147 486 175 848 162"
          fill="none"
          stroke="#60a5fa"
          strokeWidth="1.5"
          strokeDasharray="6 7"
        />
        <path d="M58 246 C310 224 570 192 848 232" fill="none" stroke="var(--hg-muted)" strokeWidth="1.5" strokeDasharray="6 7" />
        <g>
          <rect x="74" y="55" width="25" height="25" rx="6" fill="var(--hg-accent-soft)" stroke="var(--hg-accent-2)" />
          <text x="86.5" y="72" textAnchor="middle" fontSize="12" fontWeight="800" fill="var(--hg-accent)">
            A
          </text>
          <rect x="824" y="125" width="25" height="25" rx="6" fill="var(--hg-warn-soft)" stroke="var(--hg-warn)" />
          <text x="836.5" y="142" textAnchor="middle" fontSize="12" fontWeight="800" fill="var(--hg-warn)">
            B
          </text>
        </g>
        {[0, 1, 2, 3, 4].map((step) => {
          const x = 58 + step * 202.5;
          return (
            <text key={step} x={x} y="292" textAnchor={step === 0 ? "start" : step === 4 ? "end" : "middle"} fontSize="11" fill="var(--hg-muted)">
              {step * 40} km
            </text>
          );
        })}
        <defs>
          <linearGradient id="radio-empty-terrain-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#dff0d7" />
            <stop offset="100%" stopColor="#f8fafc" />
          </linearGradient>
        </defs>
      </svg>
    </div>
  );
}

function ProfileChart({ analysis, compact = false }: { analysis: RadioLinkAnalysis | null; compact?: boolean }) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const isMobile = useIsMobile();
  const { t } = useLanguage();
  const isCompactDesktop = compact && !isMobile;

  if (!analysis) {
    return <EmptyProfilePreview compact={isCompactDesktop} />;
  }

  const width = isMobile ? 430 : isCompactDesktop ? 1040 : 1200;
  const height = isMobile ? 300 : isCompactDesktop ? 285 : 360;
  const padding = isMobile
    ? { top: 16, right: 8, bottom: 34, left: 36 }
    : isCompactDesktop
      ? { top: 18, right: 10, bottom: 36, left: 48 }
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
    <div className={isCompactDesktop ? "flex h-full min-h-0 flex-col" : "space-y-5"}>
      <div className={`${isCompactDesktop ? "min-h-0 flex-1" : "pt-2"} ${isMobile || isCompactDesktop ? "" : "xl:-mx-4 2xl:-mx-6"}`}>
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className={`${isCompactDesktop ? "h-full" : "h-auto"} block w-full cursor-crosshair`}
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

      <div className={`flex flex-wrap ${isCompactDesktop ? "hidden" : "gap-3"} ${workspaceMetaClassName}`} style={{ paddingLeft: isMobile ? 0 : `${(padding.left / width) * 100}%` }}>
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

function PendingMetric({ widthClassName = "w-16" }: { widthClassName?: string }) {
  return (
    <span
      className={`inline-block h-2 rounded-full bg-[var(--hg-hairline)] align-middle ${widthClassName}`}
      aria-label="Ikke beregnet"
    />
  );
}

function ResultCell({
  value,
  className = ""
}: {
  value: string;
  className?: string;
}) {
  return (
    <td className={`px-3 py-1.5 tabular-nums ${className}`}>
      {value === "-" ? <PendingMetric widthClassName="w-12" /> : value}
    </td>
  );
}

function BlueprintPanel({
  title,
  actions,
  children,
  className = ""
}: {
  eyebrow?: string;
  title: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`${radioBlueprintPanelClassName} ${className}`}>
      <div className="mb-1 flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          {typeof title === "string" ? <h2 className={radioBlueprintTitleClassName}>{title}</h2> : title}
        </div>
        {actions ? <div className="shrink-0">{actions}</div> : null}
      </div>
      {children}
    </section>
  );
}

function StatusPill({ tone, children }: { tone: "ok" | "muted"; children: ReactNode }) {
  return (
    <span
      className={`hg-mono inline-flex h-6 items-center gap-1.5 rounded-md border px-2 text-[10px] font-[var(--hg-type-weight-bold)] uppercase leading-none tracking-[0.14em] ${
        tone === "ok"
          ? "border-emerald-300 bg-emerald-50 text-emerald-800"
          : "border-[var(--hg-hairline)] bg-[var(--hg-surface-2)] text-[var(--hg-ink-2)]"
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${tone === "ok" ? "bg-emerald-700" : "bg-[var(--hg-muted)]"}`} />
      {children}
    </span>
  );
}

function BlueprintTextInput({
  label,
  value,
  placeholder,
  onChange
}: {
  label: string;
  value: string;
  placeholder?: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block min-w-0">
      <span className={radioBlueprintKickerClassName}>{label}</span>
      <div className={radioBlueprintControlLineClassName}>
        <input
          value={value}
          placeholder={placeholder}
          onChange={(event) => onChange(event.target.value)}
          className={radioBlueprintInputClassName}
        />
      </div>
    </label>
  );
}

function BlueprintNumberInput({
  label,
  unit,
  value,
  min,
  onChange
}: {
  label: string;
  unit: string;
  value: number | "";
  min?: number;
  onChange: (value: number | "") => void;
}) {
  const allowNegative = min === undefined || min < 0;
  const [draftValue, setDraftValue] = useState(() => formatNumberDraft(value));
  const isEditingRef = useRef(false);

  useEffect(() => {
    if (!isEditingRef.current) {
      setDraftValue(formatNumberDraft(value));
    }
  }, [value]);

  return (
    <label className="block min-w-0">
      <span className={radioBlueprintKickerClassName}>{label}</span>
      <span className={radioBlueprintControlLineClassName}>
        <input
          type="text"
          inputMode="decimal"
          value={draftValue}
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
            if (normalized === "" || normalized === "." || normalized === "-" || normalized === "-." || normalized.endsWith(".")) {
              onChange(normalized === "" ? "" : value);
              return;
            }
            const numericValue = Number(normalized);
            if (!Number.isNaN(numericValue)) {
              onChange(numericValue);
            }
          }}
          onBlur={() => {
            isEditingRef.current = false;
            if (draftValue === "" || draftValue === "." || draftValue === "-" || draftValue === "-.") {
              onChange("");
              setDraftValue("");
              return;
            }
            const numericValue = Number(draftValue);
            if (Number.isNaN(numericValue)) {
              setDraftValue(formatNumberDraft(value));
              return;
            }
            onChange(numericValue);
          }}
          className={radioBlueprintInputClassName}
        />
        <span className={radioBlueprintUnitClassName}>{unit}</span>
      </span>
    </label>
  );
}

function BlueprintSelect({
  label,
  value,
  options,
  onChange
}: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block min-w-0">
      <span className={radioBlueprintKickerClassName}>{label}</span>
      <div className={`${radioBlueprintControlLineClassName} items-center justify-between`}>
        <select
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className={radioBlueprintSelectClassName}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <span className="text-[var(--hg-ink-2)]">▾</span>
      </div>
    </label>
  );
}

function BlueprintReadout({
  label,
  value,
  unit,
  tone = "default"
}: {
  label: string;
  value: string;
  unit?: string;
  tone?: "default" | "good" | "bad" | "accent";
}) {
  const toneClassName =
    tone === "good" ? "text-[var(--hg-ok)]" : tone === "bad" ? "text-rose-600" : tone === "accent" ? "text-[var(--hg-accent)]" : "text-[var(--hg-ink)]";
  return (
    <div className="min-w-0">
      <p className={radioBlueprintKickerClassName}>{label}</p>
      <p className={`${radioBlueprintControlLineClassName} font-[var(--hg-type-mono-family)] text-[15px] font-[var(--hg-type-weight-extra)] tabular-nums ${toneClassName}`}>
        <span className="min-w-0 truncate">{value === "-" ? <PendingMetric widthClassName="w-14" /> : value}</span>
        {unit && value !== "-" ? <span className={radioBlueprintUnitClassName}>{unit}</span> : null}
      </p>
    </div>
  );
}

export default function RadioLinkPage() {
  const { activeDraft, saveDraftMetadata, updateConfigSectionField, updateRadioLinkEndpoint, updateCachedRadioAnalysis } = useConfigurationContext();
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

  /* ---- Shared fragments reused by mobile and desktop layouts ---- */

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
        label="Estimert margin"
        value={analysis ? `${formatNumber(analysis.estimatedMarginDb, 1)} dB` : "-"}
        tone={analysis ? (analysis.estimatedMarginDb >= 0 ? "good" : "bad") : "default"}
      />
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

  const formatHeightScale = (scale: HeightScale) => (scale === "AGL" ? t("radio.agl") : t("radio.asl"));
  const formatAntennaHeight = (endpoint: RadioLinkEndpointInput) =>
    endpoint.antennaHeight === "" ? "-" : `${formatNumber(endpoint.antennaHeight, 0)} m ${formatHeightScale(endpoint.heightScale)}`;
  const formatCoordinate = (endpoint: RadioLinkEndpointInput, point: RadioLinkPoint | null) =>
    point ? `${point.lat.toFixed(6)}, ${point.lng.toFixed(6)}` : endpoint.coordinate.trim() || "-";

  const profileSummary = (
    <div className="mt-3 grid overflow-hidden rounded-[8px] border border-[var(--hg-hairline)] bg-[var(--hg-surface-2)] sm:grid-cols-4">
      {(analysis ? [
        [t("radio.terrainDistance"), `${formatNumber(analysis.terrainDistanceKm, 2)} km`],
        [t("radio.linkDistance"), `${formatNumber(analysis.linkDistanceKm, 2)} km`],
        ["Høydeforskjell A-B", `${analysis.endAltitudeM - analysis.startAltitudeM >= 0 ? "+" : ""}${formatNumber(analysis.endAltitudeM - analysis.startAltitudeM, 0)} m`],
        ["Maks terrenghøyde", `${formatNumber(Math.max(...analysis.series.terrain), 0)} ${t("radio.masl")}`]
      ] : [
        [t("radio.terrainDistance"), "-"],
        [t("radio.linkDistance"), "-"],
        ["H\u00f8ydeforskjell A-B", "-"],
        ["Maks terrengh\u00f8yde", "-"]
      ]).map(([label, value], index) => (
        <div key={label} className="border-t border-[var(--hg-hairline)] px-3 py-2 first:border-t-0 sm:border-l sm:border-t-0 sm:first:border-l-0">
          <p className="text-[10px] font-[var(--hg-type-weight-medium)] leading-tight text-[var(--hg-muted)]">{label}</p>
          <p className="mt-1 text-[length:var(--hg-type-content-size)] font-[var(--hg-type-weight-extra)] tabular-nums text-[var(--hg-ink)]">
            {value === "-" ? <PendingMetric widthClassName={index < 2 ? "w-20" : "w-14"} /> : value}
          </p>
        </div>
      ))}
    </div>
  );

  const pointTableRows = [
    {
      key: "A",
      tone: "cool" as const,
      coordinate: formatCoordinate(form.pointA, mapPointA),
      antenna: formatAntennaHeight(form.pointA),
      azimuth: analysis ? `${formatNumber(analysis.azimuthA, 1)}\u00B0` : "-",
      elevation: analysis ? `${formatNumber(analysis.elevationA, 2)}\u00B0` : "-",
      terrainHeight: analysis ? `${formatNumber(analysis.startAltitudeM, 0)} ${t("radio.masl")}` : "-",
      los: analysis ? `${analysis.lineClearanceM >= 0 ? "+" : ""}${formatNumber(analysis.lineClearanceM, 1)} m` : "-",
      fresnel: analysis ? `${analysis.fresnelClearanceM >= 0 ? "+" : ""}${formatNumber(analysis.fresnelClearanceM, 1)} m` : "-"
    },
    {
      key: "B",
      tone: "warm" as const,
      coordinate: formatCoordinate(form.pointB, mapPointB),
      antenna: formatAntennaHeight(form.pointB),
      azimuth: analysis ? `${formatNumber(analysis.azimuthB, 1)}\u00B0` : "-",
      elevation: analysis ? `${formatNumber(analysis.elevationB, 2)}\u00B0` : "-",
      terrainHeight: analysis ? `${formatNumber(analysis.endAltitudeM, 0)} ${t("radio.masl")}` : "-",
      los: analysis ? `${analysis.lineClearanceM >= 0 ? "+" : ""}${formatNumber(analysis.lineClearanceM, 1)} m` : "-",
      fresnel: analysis ? `${analysis.fresnelClearanceM >= 0 ? "+" : ""}${formatNumber(analysis.fresnelClearanceM, 1)} m` : "-"
    }
  ];

  const pointResultsTable = (
    <div className="mt-2 overflow-x-auto rounded-[8px] border border-[var(--hg-hairline)] 2xl:mt-3">
      <table className="w-full min-w-[900px] border-collapse text-[length:var(--hg-type-content-size)]">
        <thead className="bg-[var(--hg-surface-2)]">
          <tr className={`text-left ${workspaceMetaClassName}`}>
            <th className="px-3 py-1.5">Punkt</th>
            <th className="px-3 py-1.5">Koordinat XY</th>
            <th className="px-3 py-1.5">Antennehøyde</th>
            <th className="px-3 py-1.5">Azimut</th>
            <th className="px-3 py-1.5">Elevasjon</th>
            <th className="px-3 py-1.5">Terrenghøyde</th>
            <th className="px-3 py-1.5">Klarering LOS</th>
            <th className="px-3 py-1.5">Fresnel-klarering</th>
          </tr>
        </thead>
        <tbody>
          {pointTableRows.map((row) => (
            <tr key={row.key} className="border-t border-[var(--hg-hairline-2)]">
              <td className="px-3 py-1.5">
                <span className={`hg-mono inline-flex h-6 w-6 items-center justify-center rounded-md border text-[10px] font-[var(--hg-type-weight-extra)] ${endpointBadgeClassName(row.tone)}`}>
                  {row.key}
                </span>
              </td>
              <ResultCell value={row.coordinate} className="text-[var(--hg-ink-2)]" />
              <ResultCell value={row.antenna} className="text-[var(--hg-ink-2)]" />
              <ResultCell value={row.azimuth} className="text-[var(--hg-ink-2)]" />
              <ResultCell value={row.elevation} className="text-[var(--hg-ink-2)]" />
              <ResultCell value={row.terrainHeight} className="text-[var(--hg-ink-2)]" />
              <ResultCell
                value={row.los}
                className={`font-[var(--hg-type-weight-semibold)] ${analysis && analysis.lineClearanceM >= 0 ? "text-[var(--hg-ok)]" : analysis ? "text-rose-600" : "text-[var(--hg-ink-2)]"}`}
              />
              <ResultCell
                value={row.fresnel}
                className={`font-[var(--hg-type-weight-semibold)] ${analysis && analysis.fresnelClearanceM >= 0 ? "text-[var(--hg-ok)]" : analysis ? "text-rose-600" : "text-[var(--hg-ink-2)]"}`}
              />
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  const endpointBlueprintPanel = (
    pointKey: "pointA" | "pointB",
    label: "A" | "B",
    tone: "cool" | "warm",
    point: RadioLinkPoint | null
  ) => {
    const endpoint = form[pointKey];
    return (
      <BlueprintPanel
        eyebrow={`Endepunkt ${label}`}
        className="min-h-0 overflow-hidden"
        title={
          <div className="flex min-w-0 items-center gap-3">
            <span className={`hg-mono inline-flex h-7 w-7 shrink-0 items-center justify-center border text-[11px] font-[var(--hg-type-weight-extra)] ${endpointBadgeClassName(tone)}`}>
              {label}
            </span>
            <h2 className={`${radioBlueprintTitleClassName} min-w-0 truncate`}>{label === "A" ? t("radio.pointA") : t("radio.pointB")}</h2>
            <StatusPill tone={point ? "ok" : "muted"}>{point ? t("radio.set") : t("radio.notSet")}</StatusPill>
          </div>
        }
      >
        <div className="grid gap-x-4 gap-y-2 sm:grid-cols-3">
          <div className="min-w-0 sm:col-span-3">
            <BlueprintTextInput
              label="Koordinat"
              value={endpoint.coordinate}
              placeholder="60.6293, 6.4131"
              onChange={(value) => updateRadioLinkEndpoint(pointKey, { coordinate: value })}
            />
          </div>
          <div className="min-w-0">
            <BlueprintNumberInput
              label="Mastehøgde"
              unit={endpoint.heightScale === "AGL" ? "m" : t("radio.masl")}
              value={endpoint.antennaHeight}
              min={0}
              onChange={(value) => updateRadioLinkEndpoint(pointKey, { antennaHeight: value })}
            />
          </div>
          <div className="min-w-0">
            <BlueprintSelect
              label="Høgdetype"
              value={endpoint.heightScale}
              options={[
                { value: "AGL", label: t("radio.agl") },
                { value: "ASL", label: t("radio.asl") }
              ]}
              onChange={(value) => updateRadioLinkEndpoint(pointKey, { heightScale: value as HeightScale })}
            />
          </div>
          <div className="min-w-0">
            <BlueprintNumberInput
              label="Antennegain"
              unit="dBi"
              value={endpoint.antennaGainDbi}
              onChange={(value) => updateRadioLinkEndpoint(pointKey, { antennaGainDbi: value })}
            />
          </div>
        </div>
      </BlueprintPanel>
    );
  };

  void endpointBlueprintPanel;

  const endpointCompactRow = (
    pointKey: "pointA" | "pointB",
    label: "A" | "B",
    tone: "cool" | "warm",
    point: RadioLinkPoint | null
  ) => {
    const endpoint = form[pointKey];
    return (
      <div className="flex min-w-0 flex-col border-t-2 border-[var(--hg-ink)] pt-2 first:border-t-0 first:pt-0">
        <div className="mb-1 flex min-w-0 items-center gap-2">
          <span className={`hg-mono inline-flex h-6 w-6 shrink-0 items-center justify-center border text-[10px] font-[var(--hg-type-weight-extra)] ${endpointBadgeClassName(tone)}`}>
            {label}
          </span>
          <h2 className={`${radioBlueprintTitleClassName} min-w-0 truncate`}>{label === "A" ? t("radio.pointA") : t("radio.pointB")}</h2>
          <StatusPill tone={point ? "ok" : "muted"}>{point ? t("radio.set") : t("radio.notSet")}</StatusPill>
        </div>
        <div className="grid min-w-0 gap-x-3 gap-y-1.5 sm:grid-cols-3">
          <div className="min-w-0 sm:col-span-3">
            <BlueprintTextInput
              label="Koordinat"
              value={endpoint.coordinate}
              placeholder="60.6293, 6.4131"
              onChange={(value) => updateRadioLinkEndpoint(pointKey, { coordinate: value })}
            />
          </div>
          <div className="min-w-0">
            <BlueprintNumberInput
              label="Mastehøgde"
              unit={endpoint.heightScale === "AGL" ? "m" : t("radio.masl")}
              value={endpoint.antennaHeight}
              min={0}
              onChange={(value) => updateRadioLinkEndpoint(pointKey, { antennaHeight: value })}
            />
          </div>
          <div className="min-w-0">
            <BlueprintSelect
              label="Høgdetype"
              value={endpoint.heightScale}
              options={[
                { value: "AGL", label: t("radio.agl") },
                { value: "ASL", label: t("radio.asl") }
              ]}
              onChange={(value) => updateRadioLinkEndpoint(pointKey, { heightScale: value as HeightScale })}
            />
          </div>
          <div className="min-w-0">
            <BlueprintNumberInput
              label="Antennegain"
              unit="dBi"
              value={endpoint.antennaGainDbi}
              onChange={(value) => updateRadioLinkEndpoint(pointKey, { antennaGainDbi: value })}
            />
          </div>
        </div>
      </div>
    );
  };

  const desktopEndpointPanel = (
    <section className={`${radioBlueprintPanelClassName} hg-radio-endpoints h-full min-h-0 overflow-hidden pr-3`}>
      <div className="grid h-full min-h-0 grid-rows-2 gap-0">
        {endpointCompactRow("pointA", "A", "cool", mapPointA)}
        {endpointCompactRow("pointB", "B", "warm", mapPointB)}
      </div>
    </section>
  );

  const desktopLinkParameters = (
    <BlueprintPanel eyebrow="Linkparameter" title="RF-budsjett" className="min-h-0">
      <div className="grid gap-x-5 gap-y-3 sm:grid-cols-2">
        <BlueprintNumberInput
          label={t("radio.frequency")}
          unit="MHz"
          value={form.frequencyMHz}
          min={1}
          onChange={(value) => {
            if (value !== "") updateConfigSectionField("radioLink", "frequencyMHz", value);
          }}
        />
        <BlueprintNumberInput
          label="Sendereffekt"
          unit="dBm"
          value={form.txPowerDbm}
          min={0}
          onChange={(value) => updateConfigSectionField("radioLink", "txPowerDbm", value)}
        />
        <BlueprintNumberInput
          label="RX-sensitivitet"
          unit="dBm"
          value={form.rxSensitivityDbm}
          onChange={(value) => updateConfigSectionField("radioLink", "rxSensitivityDbm", value)}
        />
        <BlueprintNumberInput
          label="Linjetap"
          unit="dB"
          value={form.lineLossDb}
          min={0}
          onChange={(value) => updateConfigSectionField("radioLink", "lineLossDb", value)}
        />
        <BlueprintSelect
          label={t("radio.kFactor")}
          value={form.kFactor}
          options={[
            { value: "4/3", label: "4/3" },
            { value: "1", label: "1" },
            { value: "2/3", label: "2/3" },
            { value: "-2/3", label: "-2/3" }
          ]}
          onChange={(value) => updateConfigSectionField("radioLink", "kFactor", value as KFactorKey)}
        />
        <BlueprintSelect
          label={t("radio.polarization")}
          value={form.polarization}
          options={[
            { value: "horizontal", label: t("radio.horizontal") },
            { value: "vertical", label: t("radio.vertical") }
          ]}
          onChange={(value) => updateConfigSectionField("radioLink", "polarization", value as "horizontal" | "vertical")}
        />
        <BlueprintNumberInput
          label={t("radio.rain")}
          unit="mm/h"
          value={form.rainFactor}
          min={0}
          onChange={(value) => {
            if (value !== "") updateConfigSectionField("radioLink", "rainFactor", value);
          }}
        />
        <div className="min-w-0">
          <div className="flex min-w-0 flex-col gap-1">
            <div className="flex items-center justify-between gap-3">
              <span className={radioBlueprintKickerClassName}>{t("radio.fresnel")}</span>
              <span className="hg-mono text-[16px] font-[var(--hg-type-weight-extra)] tabular-nums text-[var(--hg-ink)]">
                {formatNumber(form.fresnelFactor, 1)}
              </span>
            </div>
            <input
              type="range"
              min="0.6"
              max="3"
              step="0.1"
              value={form.fresnelFactor}
              onChange={(event) =>
                updateConfigSectionField("radioLink", "fresnelFactor", clampFresnelFactor(Number(event.target.value)))
              }
              className="radiolink-slider w-full"
            />
          </div>
        </div>
      </div>
    </BlueprintPanel>
  );
  const desktopAnalysisResults = (
    <BlueprintPanel title={t("radio.resultsSection")} className="hg-radio-results min-h-0">
      <div className="grid gap-x-3 gap-y-1 sm:grid-cols-2">
        <BlueprintReadout
          label={t("radio.losClearance")}
          value={analysis ? `${analysis.lineClearanceM >= 0 ? "+" : ""}${formatNumber(analysis.lineClearanceM, 1)}` : "-"}
          unit="m"
          tone={analysis ? (analysis.lineClearanceM >= 0 ? "accent" : "bad") : "default"}
        />
        <BlueprintReadout
          label={t("radio.rainAttenuation")}
          value={analysis ? formatNumber(analysis.rainAttenuationDb, 2) : "-"}
          unit="dB"
        />
        <BlueprintReadout
          label={t("radio.azimuth")}
          value={analysis ? `${formatNumber(analysis.azimuthA, 1)} / ${formatNumber(analysis.azimuthB, 1)}` : "-"}
          unit="deg"
        />
        <BlueprintReadout
          label={t("radio.terrainDistance")}
          value={analysis ? formatNumber(analysis.terrainDistanceKm, 2) : "-"}
          unit="km"
        />
        <BlueprintReadout
          label={t("radio.linkDistance")}
          value={analysis ? formatNumber(analysis.linkDistanceKm, 2) : "-"}
          unit="km"
        />
        <BlueprintReadout
          label={t("radio.freeSpaceLoss")}
          value={analysis ? formatNumber(analysis.freeSpaceLossDb, 2) : "-"}
          unit="dB"
        />
        <BlueprintReadout
          label={t("radio.elevation")}
          value={analysis ? `${formatNumber(analysis.elevationA, 2)} / ${formatNumber(analysis.elevationB, 2)}` : "-"}
          unit="deg"
        />
        <BlueprintReadout
          label={t("radio.fresnelClearance")}
          value={analysis ? `${analysis.fresnelClearanceM >= 0 ? "+" : ""}${formatNumber(analysis.fresnelClearanceM, 1)}` : "-"}
          unit="m"
          tone={analysis ? (analysis.fresnelClearanceM >= 0 ? "accent" : "bad") : "default"}
        />
        <BlueprintReadout
          label={t("radio.pointA")}
          value={analysis ? formatNumber(analysis.startAltitudeM, 0) : "-"}
          unit={t("radio.masl")}
        />
        <BlueprintReadout
          label={t("radio.pointB")}
          value={analysis ? formatNumber(analysis.endAltitudeM, 0) : "-"}
          unit={t("radio.masl")}
        />
      </div>
    </BlueprintPanel>
  );

  const submitButton = (
    <button
      type="submit"
      disabled={loading}
      className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-[var(--hg-accent)] px-4 text-[length:var(--hg-type-ui-size)] font-[var(--hg-type-weight-bold)] text-white shadow-[0_6px_16px_rgba(37,99,235,0.18)] disabled:cursor-wait disabled:opacity-75 sm:w-auto md:transition md:hover:bg-[var(--hg-accent-2)] xl:min-w-[12rem]"
    >
      <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4 stroke-current" strokeWidth="1.8" aria-hidden="true">
        <path d={workspaceHeaderActionIcons.run} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {loading ? t("radio.calculating") : t("radio.calculate")}
    </button>
  );
  const headerActions = (
    <>
      <WorkspaceHeaderActionButton
        icon={workspaceHeaderActionIcons.reset}
        label="Recalc"
        onClick={() => void calculate(form)}
        disabled={loading}
      />
      <WorkspaceHeaderActionButton icon={workspaceHeaderActionIcons.save} label={t("shared.save")} subLabel="Lagre utkast" onClick={saveDraftMetadata} primary />
    </>
  );

  return (
    <main className={`${workspacePageClassName} hg-radio-page md:flex md:h-full md:min-h-0 md:flex-col md:space-y-3 md:overflow-hidden md:pb-3`}>
      <WorkspaceHeader title={t("radio.title")} actions={headerActions} />

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
                    <label className="flex min-w-0 flex-col gap-1">
                      <span className={radioBlueprintKickerClassName}>Koordinat</span>
                      <span className={radioBlueprintControlLineClassName}>
                        <input
                          value={ep.coordinate}
                          onChange={(e) => updateRadioLinkEndpoint(key, { coordinate: e.target.value })}
                          className={radioBlueprintInputClassName}
                          placeholder="Lat, Lng"
                        />
                      </span>
                    </label>
                    <div className="flex flex-col gap-2">
                      <label className="flex min-w-0 flex-col gap-1">
                        <span className={radioBlueprintKickerClassName}>Mastehøgde</span>
                        <span className={radioBlueprintControlLineClassName}>
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
                            className={radioBlueprintInputClassName}
                            placeholder={t("radio.height")}
                          />
                          <span className={radioBlueprintUnitClassName}>{ep.heightScale === "AGL" ? "m" : t("radio.masl")}</span>
                        </span>
                      </label>
                      <label className="flex min-w-0 flex-col gap-1">
                        <span className={radioBlueprintKickerClassName}>Antennegain</span>
                        <span className={radioBlueprintControlLineClassName}>
                          <input
                            type="text"
                            inputMode="decimal"
                            value={ep.antennaGainDbi === "" ? "" : String(ep.antennaGainDbi)}
                            onChange={(e) => {
                              const raw = e.target.value.replace(",", ".");
                              if (/^-?\d*(?:\.\d*)?$/.test(raw)) {
                                updateRadioLinkEndpoint(key, { antennaGainDbi: raw === "" || raw === "-" ? "" : Number(raw) });
                              }
                            }}
                            className={radioBlueprintInputClassName}
                            placeholder="0"
                          />
                          <span className={radioBlueprintUnitClassName}>dBi</span>
                        </span>
                      </label>
                      <div className="grid grid-cols-2 rounded-md border border-[var(--hg-hairline)] bg-[var(--hg-surface)] p-0.5">
                        {(["AGL", "ASL"] as HeightScale[]).map((hs) => (
                          <button
                            key={hs}
                            type="button"
                            onClick={() => updateRadioLinkEndpoint(key, { heightScale: hs })}
                            className={`hg-mono rounded-[5px] border px-2 py-1.5 text-[10px] font-[var(--hg-type-weight-bold)] uppercase tracking-[0.14em] ${
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
                <InlineUnitInput
                  label="Sendereffekt"
                  unit="dBm"
                  min={0}
                  step={1}
                  value={form.txPowerDbm}
                  onChange={(value) => updateConfigSectionField("radioLink", "txPowerDbm", value)}
                />
                <InlineUnitInput
                  label="RX-sensitivitet"
                  unit="dBm"
                  step={1}
                  value={form.rxSensitivityDbm}
                  onChange={(value) => updateConfigSectionField("radioLink", "rxSensitivityDbm", value)}
                />
                <InlineUnitInput
                  label="Linjetap"
                  unit="dB"
                  min={0}
                  step={0.1}
                  value={form.lineLossDb}
                  onChange={(value) => updateConfigSectionField("radioLink", "lineLossDb", value)}
                />
                <label className="flex min-w-0 flex-col gap-1">
                  <span className={radioBlueprintKickerClassName}>{t("radio.kFactor")}</span>
                  <span className={`${radioBlueprintControlLineClassName} items-center justify-between`}>
                  <select
                    value={form.kFactor}
                    onChange={(event) => updateConfigSectionField("radioLink", "kFactor", event.target.value as KFactorKey)}
                    className={radioBlueprintSelectClassName}
                  >
                    <option value="4/3">4/3</option>
                    <option value="1">1</option>
                    <option value="2/3">2/3</option>
                    <option value="-2/3">-2/3</option>
                  </select>
                  <span className="text-[var(--hg-ink-2)]">▾</span>
                  </span>
                </label>
                <label className="flex min-w-0 flex-col gap-1">
                  <span className={radioBlueprintKickerClassName}>{t("radio.polarization")}</span>
                  <span className={`${radioBlueprintControlLineClassName} items-center justify-between`}>
                  <select
                    value={form.polarization}
                    onChange={(event) =>
                      updateConfigSectionField("radioLink", "polarization", event.target.value as "horizontal" | "vertical")
                    }
                    className={radioBlueprintSelectClassName}
                  >
                    <option value="horizontal">{t("radio.horizontal")}</option>
                    <option value="vertical">{t("radio.vertical")}</option>
                  </select>
                  <span className="text-[var(--hg-ink-2)]">▾</span>
                  </span>
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
        <WorkspaceSection title={t("radio.profileChartSection")}>
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
      <form
        onSubmit={handleSubmit}
        className="hidden min-h-0 flex-1 grid-cols-[minmax(0,1fr)_minmax(340px,0.54fr)] grid-rows-[280px_minmax(0,1fr)] gap-x-4 gap-y-3 overflow-hidden md:grid"
      >
          <BlueprintPanel
            eyebrow="Topografi"
            title="Kart"
            className="flex h-full min-h-0 flex-col"
            actions={
              <div className="flex flex-wrap gap-2">
                <button type="button" className="hg-radio-map-action" onClick={() => setNextMapPoint("pointA")}>
                  Sentrer A
                </button>
                <button type="button" className="hg-radio-map-action" onClick={() => setNextMapPoint("pointB")}>
                  Sentrer B
                </button>
                <button type="button" className="hg-radio-map-action" onClick={() => setMapFitVersion((current) => current + 1)}>
                  Tilpass
                </button>
              </div>
            }
          >
            <div className="min-h-0 flex-1 overflow-hidden rounded-[4px] border border-[var(--hg-hairline)] bg-[var(--hg-surface)]">
              <RadioLinkMap
                pointA={showMapMarkers ? mapPointA : null}
                pointB={showMapMarkers ? mapPointB : null}
                onMapClick={handleMapClick}
                onPointChange={handleMapPointChange}
                nextPoint={nextMapPoint}
                fitKey={mapFitVersion > 0 ? `${activeDraft.id}:${mapFitVersion}` : undefined}
              />
            </div>
          </BlueprintPanel>

        {desktopEndpointPanel}

          <BlueprintPanel
            eyebrow="Terreng"
            title={`LOS-profil A \u2192 B`}
            className="flex min-h-0 flex-col"
            actions={
              <StatusPill tone={analysis && analysis.fresnelClearanceM >= 0 ? "ok" : "muted"}>
                {analysis
                  ? analysis.fresnelClearanceM >= 0
                    ? `LOS klar · ${formatNumber(analysis.terrainDistanceKm, 2)} km`
                    : "Krev tiltak"
                  : "Ikke beregnet"}
              </StatusPill>
            }
          >
          <div className="min-h-0 flex-1 overflow-hidden rounded-[4px] border border-[var(--hg-hairline)] bg-[var(--hg-surface)]">
            <ProfileChart analysis={analysis} compact />
          </div>
          </BlueprintPanel>
          <div className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-3 overflow-hidden pr-4 pt-4">
            {desktopLinkParameters}
            {desktopAnalysisResults}
          </div>
          <div className="sr-only">{submitButton}</div>
          <div className="hidden" aria-hidden="true">
            {profileSummary}
            {pointResultsTable}
          </div>
      </form>

      {error ? (
        <div className="hidden rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-[length:var(--hg-type-ui-size)] font-[var(--hg-type-weight-semibold)] text-rose-700 md:block">{error}</div>
      ) : null}
    </main>
  );
}
