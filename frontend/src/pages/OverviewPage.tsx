import { type ReactNode, useEffect, useMemo, useState } from "react";
import WorkspaceHeader, { WorkspaceHeaderActionButton, workspaceHeaderActionIcons } from "../components/WorkspaceHeader";
import EditorialSection from "../components/EditorialSection";
import KpiStrip, { type KpiStripItem } from "../components/KpiStrip";
import { useConfigurationContext } from "../context/ConfigurationContext";
import { useLanguage } from "../i18n";
import {
  workspaceBodyMutedClassName,
  workspaceContentValueClassName,
  workspacePageClassName
} from "../styles/workspace";
import type { MonthlyEnergyBalanceRow, NvePlantDetails } from "../types";
import { formatNumber } from "../utils/format";
import { fetchNvePlantDetails } from "../utils/nvePlantDetails";
import { calculateConfigurationOutputs } from "../utils/systemResults";
import { validateConfiguration } from "../utils/validation";

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
        <div className="flex aspect-[16/10] items-center justify-center px-4 text-center text-[length:var(--hg-type-content-size)] text-[var(--hg-ink-2)]">
          Stasjonsbilde er ikke tilgjengelig.
        </div>
      )}
      <figcaption className="flex items-center justify-between gap-3 border-t border-[var(--hg-hairline)] px-3 py-2 text-[length:var(--hg-type-content-size)] text-[var(--hg-ink-2)]">
        <span className="min-w-0 truncate">{title}</span>
        {details.concessionUrl ? (
          <a
            href={details.concessionUrl}
            target="_blank"
            rel="noreferrer"
            className="shrink-0 text-[length:var(--hg-type-meta-size)] font-[var(--hg-type-weight-semibold)] uppercase tracking-[var(--hg-type-unit-tracking)] text-[var(--hg-accent)] hover:underline"
          >
            Konsesjonssak
          </a>
        ) : null}
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
      <div className="flex aspect-[16/10] items-center justify-center px-4 text-center text-[length:var(--hg-type-content-size)] text-[var(--hg-ink-2)]">
        {loading ? "Henter stasjonsbilde." : "Velg stasjon i prosjektgrunnlag."}
      </div>
      <figcaption className="border-t border-[var(--hg-hairline)] px-3 py-2 text-[length:var(--hg-type-content-size)] text-[var(--hg-ink-2)]">
        Stasjonsbilde
      </figcaption>
    </figure>
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

const OVERVIEW_GRID_LINES = [0.25, 0.5, 0.75, 1];

function MonthlyOverviewChart({ rows }: { rows: MonthlyEnergyBalanceRow[] }) {
  if (!rows.length) {
    return <p className={workspaceContentValueClassName}>Månedsgraf vises når prosjektdataene er komplette.</p>;
  }

  const maxValue = Math.max(...rows.map((row) => Math.max(row.solarProductionKWh, row.loadDemandKWh)), 1);
  const niceMax = Math.ceil(maxValue);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mb-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-[length:var(--hg-type-content-size)] font-[var(--hg-type-weight-semibold)] text-[var(--hg-ink)]">
        <span className="inline-flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-sm bg-[var(--hg-accent-2)]" />
          Energiproduksjon
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-sm bg-[var(--hg-muted)]" />
          Forbruk
        </span>
      </div>
      <div className="relative h-[320px] flex-1 pl-8 md:h-auto">
        <div className="pointer-events-none absolute inset-x-0 left-8 top-[18px] bottom-[19px]">
          {OVERVIEW_GRID_LINES.map((g) => (
            <div
              key={g}
              className="absolute inset-x-0 border-t-2 border-[var(--hg-hairline-2)]"
              style={{ bottom: `${g * 100}%` }}
            >
              <span className="hg-mono absolute -left-8 -top-[7px] bg-[var(--hg-bg)] pr-1 text-[length:var(--hg-type-overline-size)] font-[var(--hg-type-weight-bold)] text-[var(--hg-ink)]">
                {(niceMax * g).toFixed(0)}
              </span>
            </div>
          ))}
          <div className="absolute inset-x-0 bottom-0 border-t-2 border-[var(--hg-ink)]" />
        </div>
        <div className="relative grid h-full items-end gap-2" style={{ gridTemplateColumns: `repeat(${rows.length}, minmax(0, 1fr))` }}>
          {rows.map((row) => {
            const solarRatio = row.solarProductionKWh / niceMax;
            const loadRatio = row.loadDemandKWh / niceMax;
            return (
              <div key={row.month} className="flex h-full min-w-0 flex-col items-stretch justify-end gap-0">
                <div className="flex flex-1 items-end justify-center gap-1">
                  <div
                    className="w-[42%] rounded-t-[2px]"
                    style={{ height: `${Math.max(solarRatio * 100, row.solarProductionKWh > 0 ? 2 : 0)}%`, background: "var(--hg-accent-2)" }}
                    aria-label={`${row.label} energiproduksjon: ${formatNumber(row.solarProductionKWh)} kWh`}
                  />
                  <div
                    className="w-[42%] rounded-t-[2px]"
                    style={{ height: `${Math.max(loadRatio * 100, row.loadDemandKWh > 0 ? 2 : 0)}%`, background: "var(--hg-muted)" }}
                    aria-label={`${row.label} forbruk: ${formatNumber(row.loadDemandKWh)} kWh`}
                  />
                </div>
                <span className="hg-mono mt-1 text-center text-[length:var(--hg-type-overline-size)] font-[var(--hg-type-weight-bold)] uppercase text-[var(--hg-ink)]">
                  {row.label.toUpperCase()}
                </span>
              </div>
            );
          })}
        </div>
      </div>
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

  const isAutonomyMode = activeDraft.systemParameters.batteryMode === "autonomyDays";
  const reservePct = outputs
    ? (outputs.derivedResults.annualTotals.annualSecondaryRuntimeHours / (365 * 24)) * 100
    : null;
  const overviewKpiItems: KpiStripItem[] = [
    {
      kicker: "SOLPRODUKSJON · ÅR",
      value: outputs ? formatNumber(outputs.derivedResults.annualTotals.annualSolarProductionKWh, 0) : "-",
      unit: "kWh"
    },
    {
      kicker: "LAST · ÅR",
      value: outputs ? formatNumber(outputs.derivedResults.annualTotals.annualLoadDemandKWh, 0) : "-",
      unit: "kWh"
    },
    {
      kicker: "RESERVEKJØRING · ÅR",
      value: reservePct !== null ? formatNumber(reservePct, 1) : "-",
      unit: "%"
    },
    isAutonomyMode
      ? {
          kicker: "BANKSTØRRELSE",
          value: outputs ? formatNumber(outputs.derivedResults.systemRecommendation.batteryCapacityAh) : "-",
          unit: "Ah"
        }
      : {
          kicker: "AUTONOMI",
          value: outputs ? formatNumber(outputs.derivedResults.systemRecommendation.batteryAutonomyDays, 1) : "-",
          unit: "dager"
        }
  ];

  const siteRows: Array<[string, ReactNode, boolean?]> = [
    ["Stasjon", locationText],
    ["Koordinater", coordinates],
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
    <main className={`${workspacePageClassName} md:flex md:h-full md:max-h-full md:min-h-0 md:flex-col md:overflow-hidden md:pb-0`}>
      <WorkspaceHeader title={t("overview.title")} actions={headerActions} />

      <KpiStrip items={overviewKpiItems} />

      <EditorialSection title="Stasjon" description={stationMeta}>
        <StationOverviewPanel
          siteRows={siteRows}
          details={plantDetails}
          loading={plantDetailsLoading}
        />
      </EditorialSection>

      {outputs ? (
        <EditorialSection title="Energibalanse" className="md:flex md:flex-1 md:min-h-0 md:flex-col">
          <MonthlyOverviewChart rows={outputs.derivedResults.monthlyEnergyBalance} />
        </EditorialSection>
      ) : (
        <EditorialSection title="Energibalanse" className="md:flex md:flex-1 md:min-h-0 md:flex-col">
          <p className={workspaceBodyMutedClassName}>Energigraf vises når prosjektdataene er komplette.</p>
        </EditorialSection>
      )}
    </main>
  );
}
