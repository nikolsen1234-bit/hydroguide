import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode, type PointerEvent as ReactPointerEvent } from "react";
import RadioLinkMap from "../components/RadioLinkMap";
import WorkspaceHeader, { WorkspaceHeaderActionButton, workspaceHeaderActionIcons } from "../components/WorkspaceHeader";
import EditorialSection from "../components/EditorialSection";
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
  workspaceOverlineClassName,
  workspacePageClassName,
  workspaceSectionTitleClassName,
  workspaceSubsectionTitleClassName
} from "../styles/workspace";
import type { HeightScale, KFactorKey } from "../types";
import { formatNumber, formatNumberDraft } from "../utils/format";
import {
  clampFresnelFactor,
  parseCoordinateInput,
  runRadioLinkAnalysis,
  type RadioLinkAnalysis,
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
const radioBlueprintKickerClassName = `${workspaceOverlineClassName} whitespace-nowrap tracking-[var(--hg-type-overline-tracking)] text-[var(--hg-ink-2)]`;
const radioBlueprintTitleClassName = workspaceSectionTitleClassName;
const radioBlueprintControlLineClassName =
  "mt-0.5 flex items-baseline gap-2 border-b-2 border-[var(--hg-hairline)] pb-0.5 transition-colors focus-within:border-[var(--hg-accent)]";
const radioBlueprintInputClassName =
  "hg-mono min-w-0 flex-1 border-0 bg-transparent p-0 text-[length:var(--hg-type-control-value-size)] font-[var(--hg-type-weight-extra)] text-[var(--hg-ink)] outline-none placeholder:text-[var(--hg-muted)] focus:text-[var(--hg-accent)]";
const radioBlueprintSelectClassName =
  "hg-mono min-w-0 flex-1 appearance-none border-0 bg-transparent p-0 text-[length:var(--hg-type-control-value-size)] font-[var(--hg-type-weight-bold)] text-[var(--hg-ink)] outline-none focus:text-[var(--hg-accent)]";
const radioBlueprintUnitClassName =
  "hg-mono shrink-0 text-[length:var(--hg-type-meta-size)] font-[var(--hg-type-weight-bold)] uppercase tracking-[var(--hg-type-unit-tracking)] text-[var(--hg-ink-2)]";
const mapActionButtonClassName =
  "hg-mono inline-flex min-h-[26px] items-center border border-[var(--hg-hairline)] bg-[var(--hg-surface)] px-3 text-[length:var(--hg-type-meta-size)] font-[var(--hg-type-weight-bold)] leading-none text-[var(--hg-ink)] transition hover:border-[var(--hg-accent-2)] hover:text-[var(--hg-accent)] disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:border-[var(--hg-hairline)] disabled:hover:text-[var(--hg-ink)]";

type LegacyMediaQueryList = MediaQueryList & {
  addListener: (listener: (event: MediaQueryListEvent) => void) => void;
  removeListener: (listener: (event: MediaQueryListEvent) => void) => void;
};

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mql = window.matchMedia("(max-width: 767px)");
    setIsMobile(mql.matches);
    const handler = (event: MediaQueryListEvent) => setIsMobile(event.matches);
    if ("addEventListener" in mql) {
      mql.addEventListener("change", handler);
      return () => mql.removeEventListener("change", handler);
    }

    const legacyMql = mql as LegacyMediaQueryList;
    legacyMql.addListener(handler);
    return () => legacyMql.removeListener(handler);
  }, []);
  return isMobile;
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

function useMeasuredChartViewport(isCompactDesktop: boolean) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [viewport, setViewport] = useState<{ width: number; height: number } | null>(null);

  useEffect(() => {
    if (!isCompactDesktop) {
      setViewport(null);
      return;
    }

    const node = containerRef.current;
    if (!node) return;

    const updateViewport = () => {
      const rect = node.getBoundingClientRect();
      const nextWidth = Math.round(rect.width);
      const nextHeight = Math.round(rect.height);

      if (nextWidth <= 0 || nextHeight <= 0) return;

      setViewport((current) =>
        current?.width === nextWidth && current?.height === nextHeight
          ? current
          : { width: nextWidth, height: nextHeight }
      );
    };

    updateViewport();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", updateViewport);
      return () => window.removeEventListener("resize", updateViewport);
    }

    const observer = new ResizeObserver(updateViewport);
    observer.observe(node);
    return () => observer.disconnect();
  }, [isCompactDesktop]);

  return { containerRef, viewport };
}

function EmptyProfilePreview({ compact = false }: { compact?: boolean }) {
  const isMobile = useIsMobile();
  const isCompactDesktop = compact && !isMobile;
  const { containerRef, viewport } = useMeasuredChartViewport(isCompactDesktop);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const width = isMobile ? 430 : isCompactDesktop ? Math.max(320, viewport?.width ?? 640) : 1200;
  const height = isMobile ? 300 : isCompactDesktop ? Math.max(220, viewport?.height ?? 300) : 360;
  const padding = isMobile
    ? { top: 16, right: 8, bottom: 34, left: 36 }
      : isCompactDesktop
        ? {
          top: Math.max(8, Math.round(height * 0.035)),
          right: 10,
          bottom: Math.max(30, Math.round(height * 0.12)),
          left: 50
        }
      : { top: 22, right: 12, bottom: 42, left: 56 };

  const yAxisFontSize = isCompactDesktop ? "16px" : isMobile ? "13px" : "var(--hg-type-chart-size)";
  const distanceTickFontSize = isCompactDesktop ? "16px" : isMobile ? "13px" : "var(--hg-type-chart-size)";
  const innerLeft = padding.left;
  const innerRight = width - padding.right;
  const innerTop = padding.top;
  const innerBottom = height - padding.bottom;
  const emptyYTicks = [0, 1, 2, 3, 4].map((step) => ({
    key: step,
    y: innerTop + ((innerBottom - innerTop) * (4 - step)) / 4
  }));
  const emptyDistanceTicks = [0, 1, 2, 3, 4].map((step) => ({
    key: step,
    x: innerLeft + ((innerRight - innerLeft) * step) / 4,
    isFirst: step === 0,
    isLast: step === 4
  }));

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = "100%";
    canvas.style.height = isCompactDesktop ? "100%" : "auto";

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const styles = getComputedStyle(canvas);
    const css = (name: string, fallback: string) => styles.getPropertyValue(name).trim() || fallback;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.lineWidth = 1.75;
    ctx.strokeStyle = css("--hg-hairline", "rgba(148, 163, 184, 0.4)");
    ctx.setLineDash([4, 6]);
    emptyYTicks.forEach(({ y }) => {
      ctx.beginPath();
      ctx.moveTo(innerLeft, y);
      ctx.lineTo(innerRight, y);
      ctx.stroke();
    });

    ctx.strokeStyle = css("--hg-hairline-2", "rgba(148, 163, 184, 0.28)");
    ctx.setLineDash([]);
    emptyDistanceTicks.forEach(({ x }) => {
      ctx.beginPath();
      ctx.moveTo(x, innerTop);
      ctx.lineTo(x, innerBottom);
      ctx.stroke();
    });
  });

  return (
    <div className={isCompactDesktop ? "flex h-full min-h-0 flex-col" : "space-y-5"}>
      <div
        ref={containerRef}
        className={`relative ${isCompactDesktop ? "min-h-0 flex-1" : "pt-2"} ${isMobile || isCompactDesktop ? "" : "xl:-mx-4 2xl:-mx-6"}`}
      >
        <canvas
          ref={canvasRef}
          width={width}
          height={height}
          className={`${isCompactDesktop ? "h-full" : "h-auto"} block w-full`}
          role="img"
          aria-label="Tom terrengprofil — venter på beregning"
        />
        <div className="pointer-events-none absolute inset-0">
          {emptyYTicks.map(({ key, y }) => (
            <span
              key={`y-${key}`}
              className="hg-mono absolute font-[var(--hg-type-weight-semibold)] text-[var(--hg-muted)]"
              style={{ left: 4, top: `${(y / height) * 100}%`, transform: "translateY(-60%)", fontSize: yAxisFontSize }}
            >
              &mdash;
            </span>
          ))}
          {emptyDistanceTicks.map(({ key, x, isFirst, isLast }) => {
            return (
              <span
                key={`dist-${key}`}
                className="hg-mono absolute whitespace-nowrap font-[var(--hg-type-weight-semibold)] text-[var(--hg-muted)]"
                style={{
                  left: `${(x / width) * 100}%`,
                  bottom: 2,
                  transform: isFirst ? "none" : isLast ? "translateX(-100%)" : "translateX(-50%)",
                  fontSize: distanceTickFontSize
                }}
              >
                &mdash; KM
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
}
function ProfileChart({ analysis, compact = false }: { analysis: RadioLinkAnalysis | null; compact?: boolean }) {
  const isMobile = useIsMobile();
  const isCompactDesktop = compact && !isMobile;

  if (!analysis) {
    return <EmptyProfilePreview compact={isCompactDesktop} />;
  }

  return <ProfileChartCanvas analysis={analysis} isMobile={isMobile} isCompactDesktop={isCompactDesktop} />;
}

function ProfileChartCanvas({
  analysis,
  isMobile,
  isCompactDesktop
}: {
  analysis: RadioLinkAnalysis;
  isMobile: boolean;
  isCompactDesktop: boolean;
}) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const { t } = useLanguage();
  const { containerRef, viewport } = useMeasuredChartViewport(isCompactDesktop);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const width = isMobile ? 430 : isCompactDesktop ? Math.max(320, viewport?.width ?? 640) : 1200;
  const height = isMobile ? 300 : isCompactDesktop ? Math.max(220, viewport?.height ?? 300) : 360;
  const padding = isMobile
    ? { top: 16, right: 8, bottom: 34, left: 36 }
      : isCompactDesktop
        ? {
          top: Math.max(8, Math.round(height * 0.035)),
          right: 10,
          bottom: Math.max(30, Math.round(height * 0.12)),
          left: 50
        }
      : { top: 22, right: 12, bottom: 42, left: 56 };

  const compactAxisFontSize = `${Math.max(13, Math.min(16, Math.round(height * 0.06)))}px`;
  const compactDistanceFontSize = `${Math.max(13, Math.min(16, Math.round(height * 0.055)))}px`;
  const yAxisFontSize = isCompactDesktop ? compactAxisFontSize : isMobile ? "13px" : "var(--hg-type-chart-size)";
  const tooltipTitleFontSize = isCompactDesktop || isMobile ? "13px" : workspaceChartTooltipTitleFontSize;
  const tooltipBodyFontSize = isCompactDesktop || isMobile ? "12px" : workspaceChartTooltipTextFontSize;
  const distanceTickFontSize = isCompactDesktop ? compactDistanceFontSize : isMobile ? "13px" : "var(--hg-type-chart-size)";
  const tooltipWidth = isMobile ? 158 : isCompactDesktop ? Math.max(142, Math.min(176, Math.round(width * 0.32))) : 200;
  const tooltipHeight = isMobile ? 116 : isCompactDesktop ? Math.max(104, Math.min(122, Math.round(height * 0.38))) : 126;

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

  const distancesKm = indexes.map((index) =>
    Number(((analysis.terrainDistanceKm * index) / Math.max(analysis.series.terrain.length - 1, 1)).toFixed(2))
  );
  const valueTicks = [0, 1, 2, 3, 4].map((step) => {
    const value = chartMin + (chartRange * step) / 4;
    return { key: step, value, y: toY(value) };
  });

  const hasHover = activeIndex !== null;
  const hoveredIndex = activeIndex ?? Math.max(0, indexes.length - 1);
  const hoverX = toX(hoveredIndex);
  const hoverTerrainY = toY(terrain[hoveredIndex]);
  const hoverLineOfSightY = toY(lineOfSight[hoveredIndex]);
  const hoverTooltipX = Math.min(Math.max(hoverX + 12, 16), width - tooltipWidth - 8);
  const hoverTooltipY = Math.max(18, Math.min(hoverTerrainY - tooltipHeight - 6, height - tooltipHeight - 38));

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = "100%";
    canvas.style.height = isCompactDesktop ? "100%" : "auto";

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const styles = getComputedStyle(canvas);
    const css = (name: string, fallback: string) => styles.getPropertyValue(name).trim() || fallback;

    const drawLine = (values: number[], stroke: string, lineWidth: number, dash: number[] = []) => {
      ctx.beginPath();
      values.forEach((value, index) => {
        const x = toX(index);
        const y = toY(value);
        if (index === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.strokeStyle = stroke;
      ctx.lineWidth = lineWidth;
      ctx.setLineDash(dash);
      ctx.stroke();
    };

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    ctx.lineWidth = 1.75;
    ctx.strokeStyle = css("--hg-hairline", "rgba(148, 163, 184, 0.4)");
    ctx.setLineDash([4, 6]);
    valueTicks.forEach(({ y }) => {
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(width - padding.right, y);
      ctx.stroke();
    });

    ctx.strokeStyle = css("--hg-hairline-2", "rgba(148, 163, 184, 0.28)");
    ctx.setLineDash([]);
    [0, 1, 2, 3, 4].forEach((step) => {
      const x = padding.left + ((width - padding.left - padding.right) * step) / 4;
      ctx.beginPath();
      ctx.moveTo(x, padding.top);
      ctx.lineTo(x, height - padding.bottom);
      ctx.stroke();
    });

    ctx.beginPath();
    terrain.forEach((value, index) => {
      const x = toX(index);
      const y = toY(value);
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.lineTo(toX(terrain.length - 1), height - padding.bottom);
    ctx.lineTo(toX(0), height - padding.bottom);
    ctx.closePath();
    const terrainFill = ctx.createLinearGradient(0, padding.top, 0, height - padding.bottom);
    terrainFill.addColorStop(0, css("--hg-accent-soft", "rgba(148, 163, 184, 0.28)"));
    terrainFill.addColorStop(1, css("--hg-surface", "rgba(148, 163, 184, 0.04)"));
    ctx.fillStyle = terrainFill;
    ctx.fill();

    drawLine(terrain, css("--hg-ink-2", "#64748b"), 2.6);
    drawLine(earthCurve, css("--hg-accent-2", "#2563eb"), 2);
    drawLine(fresnelUpper, css("--hg-warn", "#f59e0b"), 1.8, [5, 7]);
    drawLine(fresnelLower, css("--hg-warn", "#f59e0b"), 1.8, [5, 7]);
    drawLine(lineOfSight, css("--hg-ok", "#22c55e"), 2.2);

    const drawCircle = (x: number, y: number, radius: number, fill: string, stroke: string, lineWidth: number) => {
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.strokeStyle = stroke;
      ctx.lineWidth = lineWidth;
      ctx.stroke();
    };

    drawCircle(toX(0), toY(lineOfSight[0]), 5.5, css("--hg-accent-soft", "#dbeafe"), css("--hg-accent-2", "#2563eb"), 2);
    drawCircle(toX(indexes.length - 1), toY(lineOfSight[lineOfSight.length - 1]), 5.5, css("--hg-warn-soft", "#fef3c7"), css("--hg-warn", "#f59e0b"), 2);

    if (hasHover) {
      ctx.setLineDash([4, 6]);
      ctx.strokeStyle = css("--hg-muted", "#94a3b8");
      ctx.beginPath();
      ctx.moveTo(hoverX, padding.top);
      ctx.lineTo(hoverX, height - padding.bottom);
      ctx.stroke();
      drawCircle(hoverX, hoverTerrainY, 4.5, css("--hg-ink-2", "#64748b"), css("--hg-surface", "#ffffff"), 2);
      drawCircle(hoverX, hoverLineOfSightY, 4, css("--hg-ok", "#22c55e"), css("--hg-surface", "#ffffff"), 2);
    }
  });

  function handlePointerMove(event: ReactPointerEvent<HTMLCanvasElement>) {
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
      <div
        ref={containerRef}
        className={`relative ${isCompactDesktop ? "min-h-0 flex-1" : "pt-2"} ${isMobile || isCompactDesktop ? "" : "xl:-mx-4 2xl:-mx-6"}`}
      >
        <canvas
          ref={canvasRef}
          width={width}
          height={height}
          className={`${isCompactDesktop ? "h-full" : "h-auto"} block w-full cursor-crosshair`}
          role="img"
          aria-label={t("radio.terrainProfile")}
          onPointerMove={handlePointerMove}
          onPointerLeave={() => setActiveIndex(null)}
        />
        <div className="pointer-events-none absolute inset-0">
          {hasHover ? (
            <div
              className="absolute rounded-md border border-[var(--hg-hairline)] bg-[var(--hg-surface)] px-3 py-2 shadow-sm"
              style={{
                left: hoverTooltipX,
                top: hoverTooltipY,
                width: tooltipWidth,
                minHeight: tooltipHeight
              }}
            >
              <div className="font-[var(--hg-type-weight-bold)] text-[var(--hg-ink)]" style={{ fontSize: tooltipTitleFontSize }}>
                {t("radio.distance")} {formatNumber(distancesKm[hoveredIndex], 2)} km
              </div>
              <div className="text-[var(--hg-ink-2)]" style={{ fontSize: tooltipBodyFontSize }}>
                {t("radio.terrain")} {formatNumber(terrain[hoveredIndex], 1)} m
              </div>
              <div className="text-[var(--hg-accent-2)]" style={{ fontSize: tooltipBodyFontSize }}>
                {t("radio.earthCurve")} {formatNumber(earthCurve[hoveredIndex], 2)} m
              </div>
              <div className="text-[var(--hg-ok)]" style={{ fontSize: tooltipBodyFontSize }}>
                {t("radio.lineOfSight")} {formatNumber(lineOfSight[hoveredIndex], 1)} m
              </div>
              <div className="text-[var(--hg-warn)]" style={{ fontSize: tooltipBodyFontSize }}>
                {t("radio.fresnelLower")} {formatNumber(fresnelLower[hoveredIndex], 1)} m
              </div>
              <div className="text-[var(--hg-warn)]" style={{ fontSize: tooltipBodyFontSize }}>
                {t("radio.fresnelUpper")} {formatNumber(fresnelUpper[hoveredIndex], 1)} m
              </div>
            </div>
          ) : null}
          {valueTicks.map(({ key, value, y }) => (
            <span
              key={`y-${key}`}
              className="hg-mono absolute font-[var(--hg-type-weight-semibold)] text-[var(--hg-muted)]"
              style={{ left: 4, top: `${(y / height) * 100}%`, transform: "translateY(-60%)", fontSize: yAxisFontSize }}
            >
              {formatNumber(value, 0)} m
            </span>
          ))}
          {analysis.distanceTicksKm.map((tick, index) => {
            const isFirst = index === 0;
            const isLast = index === analysis.distanceTicksKm.length - 1;
            const x = padding.left + (index / (analysis.distanceTicksKm.length - 1)) * (width - padding.left - padding.right);
            return (
              <span
                key={`dist-${tick}-${index}`}
                className="hg-mono absolute whitespace-nowrap font-[var(--hg-type-weight-semibold)] text-[var(--hg-muted)]"
                style={{
                  left: `${(x / width) * 100}%`,
                  bottom: 2,
                  transform: isFirst ? "none" : isLast ? "translateX(-100%)" : "translateX(-50%)",
                  fontSize: distanceTickFontSize
                }}
              >
                {formatNumber(tick, 2)} KM
              </span>
            );
          })}
        </div>
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
      className={`hg-mono inline-flex h-6 items-center gap-1.5 rounded-md border px-2 text-[length:var(--hg-type-overline-size)] font-[var(--hg-type-weight-bold)] uppercase leading-none tracking-[var(--hg-type-overline-tracking)] ${
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
      <p className={`${radioBlueprintControlLineClassName} font-[var(--hg-type-mono-family)] text-[length:var(--hg-type-control-value-size)] font-[var(--hg-type-weight-extra)] tabular-nums ${toneClassName}`}>
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
  const canFitMap = !!mapPointA && !!mapPointB;

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

  function handleFitMap() {
    if (!canFitMap) {
      return;
    }

    setShowMapMarkers(true);
    setMapFitVersion((current) => current + 1);
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
          <span className={`hg-mono inline-flex h-6 w-6 shrink-0 items-center justify-center border text-[length:var(--hg-type-overline-size)] font-[var(--hg-type-weight-extra)] ${endpointBadgeClassName(tone)}`}>
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
              label="Antennehøgde"
              unit={endpoint.heightScale === "AGL" ? t("radio.agl") : t("radio.masl")}
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
    <section className={`${radioBlueprintPanelClassName} h-full min-h-0 overflow-hidden pr-3`}>
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
              <span className="hg-mono text-[length:var(--hg-type-empty-title-size)] font-[var(--hg-type-weight-extra)] tabular-nums text-[var(--hg-ink)]">
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
    <BlueprintPanel title={t("radio.resultsSection")} className="h-full min-h-0 overflow-hidden">
      <div className="grid h-[calc(100%-2rem)] min-h-0 grid-cols-2 grid-rows-4 gap-x-3 gap-y-0 overflow-hidden">
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
        <BlueprintReadout
          label={t("radio.linkDistance")}
          value={analysis ? formatNumber(analysis.linkDistanceKm, 2) : "-"}
          unit="km"
        />
        <BlueprintReadout
          label={t("radio.terrainDistance")}
          value={analysis ? formatNumber(analysis.terrainDistanceKm, 2) : "-"}
          unit="km"
        />
        <BlueprintReadout
          label={t("radio.elevation")}
          value={analysis ? `${formatNumber(analysis.elevationA, 2)} / ${formatNumber(analysis.elevationB, 2)}` : "-"}
          unit="°"
        />
        <BlueprintReadout
          label={t("radio.azimuth")}
          value={analysis ? `${formatNumber(analysis.azimuthA, 1)} / ${formatNumber(analysis.azimuthB, 1)}` : "-"}
          unit="°"
        />
        <BlueprintReadout
          label={t("radio.freeSpaceLoss")}
          value={analysis ? formatNumber(analysis.freeSpaceLossDb, 2) : "-"}
          unit="dB"
        />
        <BlueprintReadout
          label={t("radio.rainAttenuation")}
          value={analysis ? formatNumber(analysis.rainAttenuationDb, 2) : "-"}
          unit="dB"
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
        label="Beregn"
        subLabel="Beregn på nytt"
        onClick={() => void calculate(form)}
        disabled={loading}
      />
      <WorkspaceHeaderActionButton icon={workspaceHeaderActionIcons.save} label={t("shared.save")} subLabel="Lagre utkast" onClick={saveDraftMetadata} primary />
    </>
  );

  return (
    <main className={`${workspacePageClassName} md:flex md:h-full md:max-h-full md:min-h-0 md:flex-col md:space-y-3 md:overflow-hidden md:pb-3`}>
      <WorkspaceHeader title={t("radio.title")} actions={headerActions} />

      {/* ==================== MOBILE LAYOUT ==================== */}
      <div className="space-y-5 md:hidden">
        <form onSubmit={handleSubmit}>
          <div className="space-y-5">
            {/* Compact map */}
            <div className="-mt-2 mb-5">
              <div className="h-[34vh] min-h-[240px] max-h-[320px]">
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
                    className={`${endpointPanelClassName} space-y-2`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className={`hg-mono inline-flex h-7 w-7 items-center justify-center rounded-md border text-[length:var(--hg-type-meta-size)] font-[var(--hg-type-weight-extra)] ${endpointBadgeClassName(tone)}`}>
                          {lbl}
                        </span>
                        <span className={workspaceSubsectionTitleClassName}>{t("radio.location")} {lbl}</span>
                      </div>
                      <button
                        type="button"
                        aria-pressed={isSelectedForMap}
                        onClick={() => setNextMapPoint(key)}
                        className={`rounded-md border px-2 py-1 text-[length:var(--hg-type-meta-size)] font-[var(--hg-type-weight-semibold)] transition ${
                          isSelectedForMap
                            ? "border-[var(--hg-accent-2)] bg-[var(--hg-accent-soft)] text-[var(--hg-accent)]"
                            : parsed
                              ? "border-[var(--hg-ok)] text-[var(--hg-ok)]"
                              : "border-[var(--hg-hairline)] text-[var(--hg-muted)]"
                        }`}
                      >
                        {parsed ? t("radio.set") : t("radio.notSet")}
                      </button>
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
                        <span className={radioBlueprintKickerClassName}>Antennehøgde</span>
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
                          <span className={radioBlueprintUnitClassName}>{ep.heightScale === "AGL" ? t("radio.agl") : t("radio.masl")}</span>
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
                            className={`hg-mono min-h-8 rounded-[5px] border px-2 py-1.5 text-[length:var(--hg-type-overline-size)] font-[var(--hg-type-weight-bold)] uppercase tracking-[var(--hg-type-overline-tracking)] ${
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
        <EditorialSection title={t("radio.profileChartSection")}>
          <div>
            <ProfileChart analysis={analysis} />
          </div>
        </EditorialSection>

        {/* Mobile full results (shown only after calculation) */}
        {analysis ? (
          <EditorialSection title={t("radio.allResultsSection")}>
            <div>{resultRows}</div>
          </EditorialSection>
        ) : null}
      </div>

      {/* ==================== DESKTOP LAYOUT ==================== */}
      <form
        onSubmit={handleSubmit}
        className="hidden min-h-0 flex-1 grid-cols-[minmax(0,1fr)_minmax(340px,0.54fr)] grid-rows-[247px_minmax(0,1fr)] gap-x-4 gap-y-3 overflow-hidden md:grid"
      >
          <BlueprintPanel
            eyebrow="Terreng"
            title={`LOS-profil A → B`}
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
            <div className="min-h-0 flex-1 overflow-hidden">
              <ProfileChart analysis={analysis} compact />
            </div>
          </BlueprintPanel>

          <div className="h-full min-h-0 overflow-hidden pr-4">
            {desktopAnalysisResults}
          </div>

          <BlueprintPanel
            eyebrow="Topografi"
            title="Kart"
            className="flex min-h-0 flex-col"
            actions={
              <div className="flex flex-wrap gap-2">
                <button type="button" className={mapActionButtonClassName} onClick={() => setNextMapPoint("pointA")}>
                  Sentrer A
                </button>
                <button type="button" className={mapActionButtonClassName} onClick={() => setNextMapPoint("pointB")}>
                  Sentrer B
                </button>
                <button type="button" className={mapActionButtonClassName} onClick={handleFitMap} disabled={!canFitMap}>
                  Tilpass
                </button>
              </div>
            }
          >
            <div className="hg-radio-map-frame min-h-0 flex-1 overflow-hidden rounded-[4px] bg-[var(--hg-surface)]">
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

          <div className="flex min-h-0 flex-col gap-3 overflow-hidden pr-4">
            <div className="shrink-0">{desktopLinkParameters}</div>
            <div className="min-h-0 flex-1">{desktopEndpointPanel}</div>
          </div>

          <div className="hidden">{submitButton}</div>
      </form>

    </main>
  );
}
