import { useEffect, useMemo, useRef, useState } from "react";
import { BalanceBarChart } from "../components/SystemCharts";
import NveStandaloneMap from "../components/NveStandaloneMap";
import WorkspaceHeader from "../components/WorkspaceHeader";
import WorkspaceSection from "../components/WorkspaceSection";
import { useConfigurationContext } from "../context/ConfigurationContext";
import { useLanguage } from "../i18n";
import {
  workspaceBodyClassName,
  workspaceContentValueClassName,
  workspaceInputClassName,
  workspacePageClassName,
  workspacePrimaryButtonClassName,
  workspaceSecondaryButtonClassName,
  workspaceSectionTitleClassName
} from "../styles/workspace";
import { formatNumber } from "../utils/format";
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
      <p className="hg-mono text-[10px] font-[var(--hg-type-weight-semibold)] uppercase tracking-[0.16em] text-[var(--hg-muted)]">
        {label}
      </p>
      <div className="mt-2 flex items-baseline gap-1">
        <span className="hg-mono text-[1.55rem] font-[var(--hg-type-weight-bold)] tracking-[-0.03em] text-[var(--hg-ink)]">
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

function KeyValueGrid({ rows }: { rows: Array<[string, string]> }) {
  return (
    <div className="grid gap-x-6 md:grid-cols-2">
      {rows.map(([label, value]) => (
        <div key={label} className="grid grid-cols-[minmax(0,1fr)_auto] gap-4 border-b border-[var(--hg-hairline-2)] py-3">
          <span className="text-[length:var(--hg-type-content-size)] text-[var(--hg-muted)]">{label}</span>
          <span className="hg-mono max-w-[15rem] truncate text-right text-[length:var(--hg-type-content-size)] font-[var(--hg-type-weight-semibold)] text-[var(--hg-ink)]">
            {value}
          </span>
        </div>
      ))}
    </div>
  );
}

function EditableProjectName({
  value,
  onCommit
}: {
  value: string;
  onCommit: (value: string) => void;
}) {
  const { t } = useLanguage();
  const [isEditing, setIsEditing] = useState(false);
  const [draftValue, setDraftValue] = useState(value);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const displayValue = value.trim() || t("overview.unnamed");

  useEffect(() => {
    if (!isEditing) {
      setDraftValue(value);
    }
  }, [isEditing, value]);

  useEffect(() => {
    if (!isEditing) {
      return;
    }

    window.setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 0);
  }, [isEditing]);

  const commitChanges = () => {
    onCommit(draftValue);
    setIsEditing(false);
  };

  const cancelChanges = () => {
    setDraftValue(value);
    setIsEditing(false);
  };

  if (isEditing) {
    return (
      <input
        ref={inputRef}
        value={draftValue}
        onChange={(event) => setDraftValue(event.target.value)}
        onBlur={commitChanges}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            commitChanges();
          }

          if (event.key === "Escape") {
            event.preventDefault();
            cancelChanges();
          }
        }}
        aria-label={t("overview.projectName")}
        className={`max-w-xl ${workspaceInputClassName}`}
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => setIsEditing(true)}
      className="group inline-flex min-w-0 items-center gap-2 text-left"
      aria-label={t("overview.editProjectName")}
      title={t("overview.editProjectName")}
    >
      <span className={`${workspaceSectionTitleClassName} break-words`}>{displayValue}</span>
      <span
        aria-hidden="true"
        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[var(--hg-hairline)] bg-[var(--hg-surface-2)] text-[var(--hg-muted)] transition group-hover:border-[var(--hg-accent-2)] group-hover:text-[var(--hg-accent)]"
      >
        <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 20h9" />
          <path d="M16.5 3.5a2.12 2.12 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
        </svg>
      </span>
    </button>
  );
}

export default function OverviewPage() {
  const { t, language } = useLanguage();
  const {
    activeDraft,
    resetDraft,
    saveDraftMetadata,
    updateConfigurationName,
    updateConfigurationLocation
  } = useConfigurationContext();
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
  const handleReset = () => {
    const configurationName = activeDraft.name.trim() || t("shared.thisConfiguration");
    if (window.confirm(t("shared.resetConfirm").replace("{name}", configurationName))) {
      resetDraft();
    }
  };
  const headerActions = (
    <>
      <button type="button" onClick={handleReset} className={workspaceSecondaryButtonClassName}>
        {t("shared.reset")}
      </button>
      <button type="button" onClick={saveDraftMetadata} className={workspacePrimaryButtonClassName}>
        {t("shared.save")}
      </button>
    </>
  );

  const siteRows: Array<[string, string]> = [
    ["Stasjon", locationText],
    ["NVE-id", activeDraft.locationPlaceId ?? "Ikke valgt"],
    ["Koordinater", coordinates],
    ["Daglig energibehov", outputs ? `${formatNumber(outputs.derivedResults.totalWhPerDay)} Wh` : "Ikke beregnet"],
    ["Solcellepanel", `${formatNumber(totalPanelPowerWp, 0)} Wp`],
    ["Batteribank", outputs ? `${formatNumber(outputs.derivedResults.systemRecommendation.batteryCapacityAh)} Ah` : "Ikke beregnet"],
    ["Reservekilde", outputs ? `${formatNumber(secondaryPowerW, 0)} W` : "Ikke beregnet"],
    ["Modus", activeDraft.engineMode === "combined" ? "HydroGuide" : "Kalkulator"]
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

      <WorkspaceSection title={<EditableProjectName value={activeDraft.name} onCommit={updateConfigurationName} />} description="Stasjon, nøkkeltall og kartgrunnlag for valgt prosjekt.">
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(22rem,0.85fr)]">
          <div>
            <KeyValueGrid rows={siteRows} />
            <p className={`mt-4 max-w-3xl ${workspaceBodyClassName} text-[var(--hg-muted)]`}>
              Kartet bruker dagens NVE-stasjonsvelger og oppdaterer prosjektets lokasjon, koordinater og NVE-id direkte.
            </p>
          </div>

          <div className="min-h-[22rem] overflow-hidden rounded-lg border border-[var(--hg-hairline)] bg-[var(--hg-surface-2)]">
            <NveStandaloneMap
              key={`${activeDraft.id}-${activeDraft.location || "empty"}`}
              value={activeDraft.location}
              lat={activeDraft.locationLat}
              lng={activeDraft.locationLng}
              nveId={activeDraft.locationPlaceId}
              onChange={updateConfigurationLocation}
              startCollapsed={false}
            />
          </div>
        </div>
      </WorkspaceSection>

      {outputs ? (
        <WorkspaceSection title="Månedlig energibalanse" description="Beregnet produksjon, forbruk og reservebehov per måned.">
          <BalanceBarChart rows={outputs.derivedResults.monthlyEnergyBalance} />
        </WorkspaceSection>
      ) : (
        <div className="hg-card p-4">
          <p className={workspaceContentValueClassName}>Energibalanse vises når prosjektdataene er komplette.</p>
        </div>
      )}
    </main>
  );
}
