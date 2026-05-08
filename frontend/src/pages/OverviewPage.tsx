import { type ReactNode, useEffect, useMemo, useState } from "react";
import WorkspaceHeader, { WorkspaceHeaderActionButton, workspaceHeaderActionIcons } from "../components/WorkspaceHeader";
import WorkspaceSection from "../components/WorkspaceSection";
import { useConfigurationContext } from "../context/ConfigurationContext";
import { useLanguage } from "../i18n";
import {
  workspaceContentValueClassName,
  workspacePageClassName
} from "../styles/workspace";
import type { MonthlyEnergyBalanceRow, NvePlantDetails } from "../types";
import { formatNumber } from "../utils/format";
import { fetchNvePlantDetails } from "../utils/nvePlantDetails";
import { calculateConfigurationOutputs } from "../utils/systemResults";
import { validateConfiguration } from "../utils/validation";

function KpiTile({
  label,
  value,
  unit,
  note
}: {
  label: string;
  value: string;
  unit: string;
  note: string;
}) {
  return (
    <div className="border-b border-r border-[var(--hg-hairline-2)] p-4 last:border-r-0 md:border-b-0">
      <p className="text-[10px] font-[var(--hg-type-weight-semibold)] uppercase tracking-[0.16em] text-[var(--hg-muted)]">
        {label}
      </p>
      <div className="mt-2 flex items-baseline gap-1">
        <span className="text-[1.55rem] font-[var(--hg-type-weight-bold)] tracking-[-0.03em] text-[var(--hg-ink)]">
          {value}
        </span>
        <span className="text-[length:var(--hg-type-meta-size)] font-[var(--hg-type-weight-semibold)] text-[var(--hg-muted)]">
          {unit}
        </span>
      </div>
      <p className="mt-1 text-[length:var(--hg-type-meta-size)] text-[var(--hg-muted)]">{note}</p>
    </div>
  );
}

function KeyValueGrid({ rows }: { rows: Array<[string, ReactNode, boolean?]> }) {
  return (
    <div className="grid gap-x-6 md:grid-cols-2">
      {rows.map(([label, value, wide]) => (
        <div
          key={label}
          className={`grid min-w-0 gap-4 border-b border-[var(--hg-hairline-2)] py-3 ${
            wide
              ? "grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] md:col-span-2 md:grid-cols-[minmax(0,10rem)_minmax(0,1fr)]"
              : "grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]"
          }`}
        >
          <span className="min-w-0 text-[length:var(--hg-type-content-size)] text-[var(--hg-muted)]">{label}</span>
          <span className="min-w-0 text-right text-[length:var(--hg-type-content-size)] font-[var(--hg-type-weight-semibold)] text-[var(--hg-ink)] [overflow-wrap:anywhere]">
            {value}
          </span>
        </div>
      ))}
    </div>
  );
}

function formatPlantTitle(name: string) {
  return /kraftverk/i.test(name) ? name : `${name} kraftverk`;
}

function DetailList({ items }: { items: string[] }) {
  if (!items.length) {
    return <span>-</span>;
  }

  return (
    <span className="flex flex-col gap-1">
      {items.map((item) => (
        <span key={item}>{item}</span>
      ))}
    </span>
  );
}

function StationImage({ details }: { details: NvePlantDetails }) {
  const title = formatPlantTitle(details.name);

  return (
    <figure className="overflow-hidden rounded-lg border border-[var(--hg-hairline)] bg-[var(--hg-surface-2)]">
      {details.imageUrl ? (
        <img src={details.imageUrl} alt={title} loading="lazy" className="aspect-[16/10] w-full object-cover" />
      ) : (
        <div className="flex aspect-[16/10] items-center justify-center px-4 text-center text-[length:var(--hg-type-meta-size)] text-[var(--hg-muted)]">
          Stasjonsbilde er ikke tilgjengelig.
        </div>
      )}
      <figcaption className="border-t border-[var(--hg-hairline)] px-3 py-2 text-[length:var(--hg-type-meta-size)] text-[var(--hg-muted)]">
        {title}
      </figcaption>
    </figure>
  );
}

function StationVisual({
  details,
  loading
}: {
  details: NvePlantDetails | null;
  loading: boolean;
}) {
  if (details) {
    return <StationImage details={details} />;
  }

  return (
    <figure className="overflow-hidden rounded-lg border border-[var(--hg-hairline)] bg-[var(--hg-surface-2)]">
      <div className="flex aspect-[16/10] items-center justify-center px-4 text-center text-[length:var(--hg-type-meta-size)] text-[var(--hg-muted)]">
        {loading ? "Henter stasjonsbilde." : "Velg stasjon i prosjektgrunnlag."}
      </div>
      <figcaption className="border-t border-[var(--hg-hairline)] px-3 py-2 text-[length:var(--hg-type-meta-size)] text-[var(--hg-muted)]">
        Stasjonsbilde
      </figcaption>
    </figure>
  );
}

function StationActions({ details }: { details: NvePlantDetails | null }) {
  if (!details) {
    return null;
  }

  if (!details.wikiUrl && !details.concessionUrl) {
    return null;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {details.wikiUrl ? (
        <a className="inline-flex h-8 items-center rounded-lg border border-[var(--hg-hairline)] bg-[var(--hg-surface)] px-3 text-[length:var(--hg-type-ui-size)] font-[var(--hg-type-weight-semibold)] text-[var(--hg-accent)] transition hover:bg-[var(--hg-accent-soft)]" href={details.wikiUrl} target="_blank" rel="noreferrer">
          Wikipedia
        </a>
      ) : null}
      {details.concessionUrl ? (
        <a className="inline-flex h-8 items-center rounded-lg border border-[var(--hg-hairline)] bg-[var(--hg-surface)] px-3 text-[length:var(--hg-type-ui-size)] font-[var(--hg-type-weight-semibold)] text-[var(--hg-accent)] transition hover:bg-[var(--hg-accent-soft)]" href={details.concessionUrl} target="_blank" rel="noreferrer">
          Konsesjonssak
        </a>
      ) : null}
    </div>
  );
}

function StationOverviewPanel({
  siteRows,
  details,
  loading
}: {
  siteRows: Array<[string, ReactNode, boolean?]>;
  details: NvePlantDetails | null;
  loading: boolean;
}) {
  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="min-w-0">
        <KeyValueGrid rows={siteRows} />
      </div>
      <aside className="min-w-0">
        <StationVisual details={details} loading={loading} />
      </aside>
    </div>
  );
}

function MonthlyOverviewChart({ rows }: { rows: MonthlyEnergyBalanceRow[] }) {
  if (!rows.length) {
    return <p className={workspaceContentValueClassName}>Månedsgraf vises når prosjektdataene er komplette.</p>;
  }

  const width = 520;
  const chartHeight = 160;
  const labelHeight = 18;
  const maxValue = Math.max(...rows.map((row) => Math.max(row.solarProductionKWh, row.loadDemandKWh)), 1);
  const bandWidth = width / rows.length;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-[length:var(--hg-type-content-size)] font-[var(--hg-type-weight-semibold)] text-[var(--hg-ink)]">
        <span className="inline-flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-sm bg-[var(--hg-accent-2)]" />
          Solproduksjon
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-sm bg-[#94a3b8]" />
          Forbruk
        </span>
      </div>
      <div className="-mx-1 overflow-x-auto px-1 pb-2 [scrollbar-width:thin]">
        <svg viewBox={`0 0 ${width} ${chartHeight + labelHeight}`} className="block h-auto w-full min-w-[520px] overflow-visible" role="img" aria-label="Månedlig solproduksjon og forbruk">
          {rows.map((row, index) => {
            const x = index * bandWidth + bandWidth * 0.18;
            const barWidth = bandWidth * 0.32;
            const solarHeight = (row.solarProductionKWh / maxValue) * chartHeight;
            const loadHeight = (row.loadDemandKWh / maxValue) * chartHeight;
            const label = row.label.toUpperCase();

            return (
              <g key={row.month}>
                <rect
                  x={x}
                  y={chartHeight - solarHeight}
                  width={barWidth}
                  height={Math.max(solarHeight, 2)}
                  rx="1"
                  fill="var(--hg-accent-2)"
                />
                <rect
                  x={x + barWidth + 2}
                  y={chartHeight - loadHeight}
                  width={barWidth}
                  height={Math.max(loadHeight, 2)}
                  rx="1"
                  fill="#94a3b8"
                />
                <text x={index * bandWidth + bandWidth / 2} y={chartHeight + 12} textAnchor="middle" className="fill-[var(--hg-muted)] text-[9px]">
                  {label}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
      <p className="mt-2 text-[length:var(--hg-type-meta-size)] text-[var(--hg-muted)]">kWh per måned</p>
    </div>
  );
}

export default function OverviewPage() {
  const { t, language } = useLanguage();
  const {
    activeDraft,
    resetDraft,
    saveDraftMetadata
  } = useConfigurationContext();
  const [loadedPlantDetails, setLoadedPlantDetails] = useState<NvePlantDetails | null>(null);
  const [plantDetailsLoading, setPlantDetailsLoading] = useState(false);
  const validationErrors = useMemo(() => validateConfiguration(activeDraft), [activeDraft, language]);
  const hasCompleteConfiguration = Object.keys(validationErrors).length === 0;
  const outputs = useMemo(
    () => (hasCompleteConfiguration ? calculateConfigurationOutputs(activeDraft) : null),
    [activeDraft, hasCompleteConfiguration]
  );

  const totalPanelPowerWp =
    (typeof activeDraft.solar.panelCount === "number" && Number.isFinite(activeDraft.solar.panelCount)
      ? activeDraft.solar.panelCount
      : 0) *
    (typeof activeDraft.solar.panelPowerWp === "number" && Number.isFinite(activeDraft.solar.panelPowerWp)
      ? activeDraft.solar.panelPowerWp
      : 0);
  const secondaryPowerW = outputs?.derivedResults.systemRecommendation.secondarySourcePowerW ?? 0;
  const locationText = activeDraft.location.trim() || "Ingen stasjon valgt";
  const coordinates =
    typeof activeDraft.locationLat === "number" && typeof activeDraft.locationLng === "number"
      ? `${formatNumber(activeDraft.locationLat, 5)}, ${formatNumber(activeDraft.locationLng, 5)}`
      : "Ikke valgt";
  const plantDetails = loadedPlantDetails ?? activeDraft.nvePlantDetails;
  const nveId = plantDetails?.stationId ?? activeDraft.locationPlaceId;
  const stationMeta = nveId ? `NVEID ${nveId}` : undefined;

  useEffect(() => {
    const nveId = activeDraft.locationPlaceId;
    setLoadedPlantDetails(null);
    if (!nveId) {
      setPlantDetailsLoading(false);
      return;
    }

    let cancelled = false;
    setPlantDetailsLoading(true);
    fetchNvePlantDetails(nveId)
      .then((details) => {
        if (!cancelled) {
          setLoadedPlantDetails(details);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLoadedPlantDetails(null);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setPlantDetailsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activeDraft.locationPlaceId]);

  const handleReset = () => {
    const configurationName = activeDraft.name.trim() || t("shared.thisConfiguration");
    if (window.confirm(t("shared.resetConfirm").replace("{name}", configurationName))) {
      resetDraft();
    }
  };
  const headerActions = (
    <>
      <WorkspaceHeaderActionButton icon={workspaceHeaderActionIcons.reset} label={t("shared.reset")} subLabel="Tilbakestill" onClick={handleReset} />
      <WorkspaceHeaderActionButton icon={workspaceHeaderActionIcons.save} label={t("shared.save")} subLabel="Lagre utkast" onClick={saveDraftMetadata} primary />
    </>
  );

  const siteRows: Array<[string, ReactNode, boolean?]> = [
    ["Stasjon", locationText],
    ["Koordinater", coordinates],
    ["Daglig energibehov", outputs ? `${formatNumber(outputs.derivedResults.totalWhPerDay)} Wh` : "Ikke beregnet"],
    ["Solcellepanel", `${formatNumber(totalPanelPowerWp, 0)} Wp`],
    ["Batteribank", outputs ? `${formatNumber(outputs.derivedResults.systemRecommendation.batteryCapacityAh)} Ah` : "Ikke beregnet"],
    ["Reservekilde", outputs ? `${formatNumber(secondaryPowerW, 0)} W` : "Ikke beregnet"],
    ["Modus", activeDraft.engineMode === "combined" ? "HydroGuide" : "Kalkulator"],
    ["Datagrunnlag", nveId ? "NVE kraftverkregister" : "Ikke valgt"],
    ...(plantDetails
      ? [
          ["Eier", plantDetails.owner ?? "-"],
          ["Maks ytelse", plantDetails.maxOutputMW !== null ? `${formatNumber(plantDetails.maxOutputMW)} MW` : "-"],
          ["Produksjon", plantDetails.productionGWh !== null ? `${formatNumber(plantDetails.productionGWh)} GWh/år` : "-"],
          [
            "Minstevannføring",
            plantDetails.minFlowItems.length ? <DetailList items={plantDetails.minFlowItems} /> : plantDetails.minFlowText ?? "-"
          ],
          [`Magasin${plantDetails.reservoirCount !== null ? ` (${plantDetails.reservoirCount})` : ""}`, <DetailList items={plantDetails.reservoirItems} />],
          ["Sted", `${plantDetails.municipality ?? "-"}${plantDetails.county ? `, ${plantDetails.county}` : ""}`],
          ["Bruttofallhøyde", plantDetails.grossHeadM !== null ? `${formatNumber(plantDetails.grossHeadM, 0)} m` : "-"],
          ["Idriftsatt", plantDetails.commissionedYear ?? "-"],
          [`Inntak${plantDetails.intakeCount !== null ? ` (${plantDetails.intakeCount})` : ""}`, <DetailList items={plantDetails.intakeItems} />, true]
        ] satisfies Array<[string, ReactNode, boolean?]>
      : [])
  ];

  return (
    <main className={workspacePageClassName}>
      <WorkspaceHeader title={t("overview.title")} actions={headerActions} />

      <div className="hg-card overflow-hidden">
        <div className="grid md:grid-cols-4">
          <KpiTile
            label={t("overview.whPerDay")}
            value={outputs ? formatNumber(outputs.derivedResults.totalWhPerDay) : "-"}
            unit={t("overview.whPerDayUnit")}
            note="Samlet for aktivt utstyr"
          />
          <KpiTile label={t("overview.solarPanel")} value={formatNumber(totalPanelPowerWp, 0)} unit="Wp" note="Paneloppsett" />
          <KpiTile
            label={t("overview.battery")}
            value={outputs ? formatNumber(outputs.derivedResults.systemRecommendation.batteryCapacityAh) : "-"}
            unit="Ah"
            note="Anbefalt kapasitet"
          />
          <KpiTile
            label={t("overview.reserveSource")}
            value={outputs ? formatNumber(secondaryPowerW, 0) : "-"}
            unit="W"
            note="Beregnet reserveeffekt"
          />
        </div>
      </div>

      <WorkspaceSection title="Stasjon" description={stationMeta} actions={<StationActions details={plantDetails} />}>
        <StationOverviewPanel
          siteRows={siteRows}
          details={plantDetails}
          loading={plantDetailsLoading}
        />
      </WorkspaceSection>

      {outputs ? (
        <WorkspaceSection title="Månedlig energigraf" description="Solproduksjon og forbruk per måned.">
          <MonthlyOverviewChart rows={outputs.derivedResults.monthlyEnergyBalance} />
        </WorkspaceSection>
      ) : (
        <div className="hg-card p-4">
          <p className={workspaceContentValueClassName}>Energigraf vises når prosjektdataene er komplette.</p>
        </div>
      )}
    </main>
  );
}
