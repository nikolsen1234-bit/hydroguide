/**
 * Reliability analysis charts for hourly battery simulation results.
 * Custom SVG charts matching the existing SystemCharts.tsx pattern.
 */

import { useCallback, useRef, useState } from "react";
import { MONTH_KEYS, MONTH_LABELS } from "../constants";
import { useLanguage } from "../i18n";
import type { MonthKey, ReliabilityMetrics } from "../types";
import { formatNumber } from "../utils/format";

type BatteryTooltip = {
  monthLabel: string;
  fullPct: number;
  emptyPct: number;
  svgX: number;
  svgY: number;
};

type SocTooltip = {
  binIdx: number;
  pct: number;
  svgX: number;
};

// ---------------------------------------------------------------------------
// Battery Full/Empty Frequency (grouped bar chart, 12 months)
// ---------------------------------------------------------------------------

export function BatteryFrequencyChart({ metrics }: { metrics: ReliabilityMetrics }) {
  const { t } = useLanguage();
  const data = metrics.monthly;
  const fullLabel = t("reliability.batteryFull");
  const emptyLabel = t("reliability.batteryEmpty");

  const W = 720;
  const H = 280;
  const padL = 48;
  const padR = 16;
  const padT = 24;
  const padB = 40;
  const chartW = W - padL - padR;
  const chartH = H - padT - padB;

  const maxPct = Math.max(10, ...data.map((entry) => Math.max(entry.batteryFullPct, entry.batteryEmptyPct)));
  const yMax = Math.ceil(maxPct / 10) * 10;
  const barGroupW = chartW / 12;
  const barW = barGroupW * 0.3;
  const gap = barGroupW * 0.06;

  const svgRef = useRef<SVGSVGElement>(null);
  const [tooltip, setTooltip] = useState<BatteryTooltip | null>(null);

  const showTooltipForMonth = useCallback(
    (monthIdx: number) => {
      const entry = data[monthIdx];
      if (!entry) {
        setTooltip(null);
        return;
      }

      const gx = padL + monthIdx * barGroupW;
      const tooltipX = gx + barGroupW / 2;
      const tooltipY =
        padT + chartH - Math.max((entry.batteryFullPct / yMax) * chartH, (entry.batteryEmptyPct / yMax) * chartH) - 8;

      setTooltip({
        monthLabel: MONTH_LABELS[entry.month as MonthKey],
        fullPct: Math.round(entry.batteryFullPct * 10) / 10,
        emptyPct: Math.round(entry.batteryEmptyPct * 10) / 10,
        svgX: tooltipX,
        svgY: tooltipY
      });
    },
    [barGroupW, chartH, data, yMax]
  );

  const clearTooltip = useCallback(() => setTooltip(null), []);

  const handleMouseMove = useCallback(
    (event: React.MouseEvent<SVGSVGElement>) => {
      const svg = svgRef.current;
      if (!svg) {
        return;
      }

      const point = svg.createSVGPoint();
      point.x = event.clientX;
      point.y = event.clientY;
      const svgPoint = point.matrixTransform(svg.getScreenCTM()!.inverse());
      const relX = svgPoint.x - padL;

      if (relX < 0 || relX > chartW || svgPoint.y < padT || svgPoint.y > padT + chartH) {
        clearTooltip();
        return;
      }

      const monthIdx = Math.floor(relX / barGroupW);
      if (monthIdx < 0 || monthIdx >= 12) {
        clearTooltip();
        return;
      }

      showTooltipForMonth(monthIdx);
    },
    [barGroupW, chartH, chartW, clearTooltip, padL, padT, showTooltipForMonth]
  );

  return (
    <div>
      <p className="mb-1 text-sm font-semibold text-slate-700">{t("reliability.monthlyFrequency")}</p>
      <p className="mb-3 text-xs text-slate-500">{t("reliability.monthlyFrequencyDesc")}</p>
      <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} className="w-full" onMouseMove={handleMouseMove} onMouseLeave={clearTooltip}>
        {[0, 25, 50, 75, 100].filter((value) => value <= yMax).map((value) => {
          const y = padT + chartH - (value / yMax) * chartH;
          return (
            <g key={value}>
              <line x1={padL} y1={y} x2={W - padR} y2={y} stroke="#e2e8f0" strokeWidth={0.5} />
              <text x={padL - 6} y={y + 4} textAnchor="end" className="fill-slate-400" style={{ fontSize: 10 }}>
                {value}%
              </text>
            </g>
          );
        })}

        {data.map((entry, index) => {
          const gx = padL + index * barGroupW;
          const fullH = (entry.batteryFullPct / yMax) * chartH;
          const emptyH = (entry.batteryEmptyPct / yMax) * chartH;
          const baselineY = padT + chartH;
          const monthLabel = MONTH_LABELS[entry.month as MonthKey];
          const isActive = tooltip?.monthLabel === monthLabel;

          return (
            <g key={entry.month}>
              <rect x={gx + gap} y={baselineY - fullH} width={barW} height={fullH} fill="#22c55e" rx={2} opacity={isActive ? 1 : 0.8} />
              <rect
                x={gx + gap + barW + gap}
                y={baselineY - emptyH}
                width={barW}
                height={emptyH}
                fill="#ef4444"
                rx={2}
                opacity={isActive ? 1 : 0.8}
              />
              <text x={gx + barGroupW / 2} y={H - 8} textAnchor="middle" className="fill-slate-500" style={{ fontSize: 10 }}>
                {monthLabel}
              </text>
              <rect
                x={gx}
                y={padT}
                width={barGroupW}
                height={chartH}
                fill="transparent"
                tabIndex={0}
                focusable="true"
                role="button"
                aria-label={`${monthLabel}: ${fullLabel} ${formatNumber(entry.batteryFullPct)}%, ${emptyLabel} ${formatNumber(entry.batteryEmptyPct)}%`}
                onFocus={() => showTooltipForMonth(index)}
                onBlur={clearTooltip}
                onTouchStart={() => showTooltipForMonth(index)}
                onClick={() => showTooltipForMonth(index)}
              />
            </g>
          );
        })}

        {tooltip && (() => {
          const boxWidth = 160;
          const boxHeight = 68;
          const boxX = tooltip.svgX + 8 + boxWidth > W - padR ? tooltip.svgX - boxWidth - 8 : tooltip.svgX + 8;
          const boxY = Math.max(padT + 4, padT + chartH / 2 - boxHeight / 2);

          return (
            <g>
              <rect
                x={boxX}
                y={boxY}
                width={boxWidth}
                height={boxHeight}
                rx={4}
                fill="white"
                stroke="#e2e8f0"
                strokeWidth={1}
                style={{ filter: "drop-shadow(0 1px 3px rgba(0,0,0,0.12))" }}
              />
              <text x={boxX + 10} y={boxY + 16} fontSize={12} fontWeight={700} fill="#0f172a">
                {tooltip.monthLabel}
              </text>
              <circle cx={boxX + 14} cy={boxY + 32} r={4} fill="#22c55e" />
              <text x={boxX + 24} y={boxY + 36} fontSize={11} fontWeight={600} fill="#166534">
                {fullLabel}
              </text>
              <text x={boxX + boxWidth - 10} y={boxY + 36} fontSize={11} fontWeight={700} fill="#0f172a" textAnchor="end">
                {tooltip.fullPct}%
              </text>
              <circle cx={boxX + 14} cy={boxY + 52} r={4} fill="#ef4444" />
              <text x={boxX + 24} y={boxY + 56} fontSize={11} fontWeight={600} fill="#991b1b">
                {emptyLabel}
              </text>
              <text x={boxX + boxWidth - 10} y={boxY + 56} fontSize={11} fontWeight={700} fill="#0f172a" textAnchor="end">
                {tooltip.emptyPct}%
              </text>
            </g>
          );
        })()}
      </svg>
      <div className="mt-2 flex items-center justify-center gap-5 text-xs text-slate-500">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-4 rounded-sm bg-green-500 opacity-80" />
          {fullLabel}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-4 rounded-sm bg-red-500 opacity-80" />
          {emptyLabel}
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SOC Histogram (10-bin bar chart)
// ---------------------------------------------------------------------------

export function SocHistogramChart({ metrics }: { metrics: ReliabilityMetrics }) {
  const { t } = useLanguage();
  const bins = metrics.socHistogram;

  const W = 720;
  const H = 280;
  const padL = 48;
  const padR = 16;
  const padT = 24;
  const padB = 44;
  const chartW = W - padL - padR;
  const chartH = H - padT - padB;

  const maxFrac = Math.max(0.05, ...bins);
  const yMax = Math.ceil((maxFrac * 100) / 10) * 10;
  const binW = chartW / 10;
  const barW = binW - 4;

  const svgRef = useRef<SVGSVGElement>(null);
  const [tooltip, setTooltip] = useState<SocTooltip | null>(null);

  const showTooltipForBin = useCallback(
    (binIdx: number) => {
      const value = bins[binIdx];
      if (value === undefined) {
        setTooltip(null);
        return;
      }

      setTooltip({
        binIdx,
        pct: Math.round(value * 1000) / 10,
        svgX: padL + binIdx * binW + binW / 2
      });
    },
    [binW, bins, padL]
  );

  const clearTooltip = useCallback(() => setTooltip(null), []);

  const handleMouseMove = useCallback(
    (event: React.MouseEvent<SVGSVGElement>) => {
      const svg = svgRef.current;
      if (!svg) {
        return;
      }

      const point = svg.createSVGPoint();
      point.x = event.clientX;
      point.y = event.clientY;
      const svgPoint = point.matrixTransform(svg.getScreenCTM()!.inverse());
      const relX = svgPoint.x - padL;

      if (relX < 0 || relX > chartW || svgPoint.y < padT || svgPoint.y > padT + chartH) {
        clearTooltip();
        return;
      }

      showTooltipForBin(Math.min(9, Math.floor(relX / binW)));
    },
    [binW, chartH, chartW, clearTooltip, padL, padT, showTooltipForBin]
  );

  return (
    <div>
      <p className="mb-1 text-sm font-semibold text-slate-700">{t("reliability.socDistribution")}</p>
      <p className="mb-3 text-xs text-slate-500">{t("reliability.socDistributionDesc")}</p>
      <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} className="w-full" onMouseMove={handleMouseMove} onMouseLeave={clearTooltip}>
        {[0, yMax / 2, yMax].map((value) => {
          const y = padT + chartH - (value / yMax) * chartH;
          return (
            <g key={value}>
              <line x1={padL} y1={y} x2={W - padR} y2={y} stroke="#e2e8f0" strokeWidth={0.5} />
              <text x={padL - 6} y={y + 4} textAnchor="end" className="fill-slate-400" style={{ fontSize: 10 }}>
                {value}%
              </text>
            </g>
          );
        })}

        {bins.map((frac, index) => {
          const x = padL + index * binW + 2;
          const height = ((frac * 100) / yMax) * chartH;
          const baselineY = padT + chartH;
          const hue = Math.round((index / 9) * 120);
          const isActive = tooltip?.binIdx === index;
          const rangeLabel = `${index * 10}-${(index + 1) * 10}%`;

          return (
            <g key={index}>
              <rect x={x} y={baselineY - height} width={barW} height={height} fill={`hsl(${hue}, 65%, 50%)`} rx={2} opacity={isActive ? 1 : 0.75} />
              <text x={x + barW / 2} y={H - 10} textAnchor="middle" className="fill-slate-500" style={{ fontSize: 10 }}>
                {rangeLabel}
              </text>
              <rect
                x={padL + index * binW}
                y={padT}
                width={binW}
                height={chartH}
                fill="transparent"
                tabIndex={0}
                focusable="true"
                role="button"
                aria-label={`SOC ${rangeLabel}: ${formatNumber(frac * 100)}%`}
                onFocus={() => showTooltipForBin(index)}
                onBlur={clearTooltip}
                onTouchStart={() => showTooltipForBin(index)}
                onClick={() => showTooltipForBin(index)}
              />
            </g>
          );
        })}

        {tooltip && (() => {
          const boxWidth = 160;
          const boxHeight = 52;
          const boxX = tooltip.svgX + 8 + boxWidth > W - padR ? tooltip.svgX - boxWidth - 8 : tooltip.svgX + 8;
          const boxY = Math.max(padT + 4, padT + chartH / 2 - boxHeight / 2);
          const hue = Math.round((tooltip.binIdx / 9) * 120);
          const rangeLabel = `${tooltip.binIdx * 10}-${(tooltip.binIdx + 1) * 10}%`;

          return (
            <g>
              <rect
                x={boxX}
                y={boxY}
                width={boxWidth}
                height={boxHeight}
                rx={4}
                fill="white"
                stroke="#e2e8f0"
                strokeWidth={1}
                style={{ filter: "drop-shadow(0 1px 3px rgba(0,0,0,0.12))" }}
              />
              <text x={boxX + 10} y={boxY + 16} fontSize={12} fontWeight={700} fill="#0f172a">
                SOC {rangeLabel}
              </text>
              <circle cx={boxX + 14} cy={boxY + 34} r={4} fill={`hsl(${hue}, 65%, 50%)`} />
              <text x={boxX + boxWidth - 10} y={boxY + 38} fontSize={11} fontWeight={700} fill="#0f172a" textAnchor="end">
                {tooltip.pct}%
              </text>
            </g>
          );
        })()}
      </svg>
    </div>
  );
}

// ---------------------------------------------------------------------------
// KPI Panel (key reliability numbers)
// ---------------------------------------------------------------------------

export function ReliabilityKPIPanel({ metrics }: { metrics: ReliabilityMetrics }) {
  const { t } = useLanguage();
  const worstMonth = MONTH_LABELS[MONTH_KEYS[metrics.worstMonthIndex] as MonthKey];

  const kpis = [
    { label: t("reliability.lolh"), value: `${metrics.lolh} ${t("reliability.hours")}`, alert: metrics.lolh > 0 },
    { label: t("reliability.totalDeficit"), value: `${formatNumber(metrics.totalDeficitWh / 1000)} kWh`, alert: metrics.totalDeficitWh > 0 },
    {
      label: t("reliability.longestLowSoc"),
      value: `${metrics.longestLowSocHours} ${t("reliability.hours")} (${formatNumber(metrics.longestLowSocHours / 24)} ${t("reliability.days")})`,
      alert: metrics.longestLowSocHours > 48
    },
    { label: t("reliability.worstMonth"), value: worstMonth, alert: false },
    {
      label: t("reliability.worst7Day"),
      value: `${formatNumber(metrics.worst7Day.deficitWh / 1000)} kWh - ${metrics.worst7Day.label}`,
      alert: metrics.worst7Day.deficitWh > 0
    },
    {
      label: t("reliability.worst30Day"),
      value: `${formatNumber(metrics.worst30Day.deficitWh / 1000)} kWh - ${metrics.worst30Day.label}`,
      alert: metrics.worst30Day.deficitWh > 0
    }
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {kpis.map(({ label, value, alert }) => (
        <div key={label} className={`rounded-xl border p-3 ${alert ? "border-red-200 bg-red-50/50" : "border-slate-200 bg-slate-50/50"}`}>
          <p className="text-xs font-medium text-slate-500">{label}</p>
          <p className={`mt-1 text-sm font-semibold ${alert ? "text-red-700" : "text-slate-800"}`}>{value}</p>
        </div>
      ))}
    </div>
  );
}
