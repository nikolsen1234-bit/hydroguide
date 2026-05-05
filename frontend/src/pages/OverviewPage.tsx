import { useEffect, useMemo, useRef, useState } from "react";
import { BalanceBarChart } from "../components/SystemCharts";
import NveStandaloneMap from "../components/NveStandaloneMap";
import WorkspaceActions from "../components/WorkspaceActions";
import WorkspaceHeader from "../components/WorkspaceHeader";
import WorkspaceSection from "../components/WorkspaceSection";
import { useConfigurationContext } from "../context/ConfigurationContext";
import { useLanguage } from "../i18n";
import {
  workspaceInputClassName,
  workspacePageClassName,
  workspaceSubsectionTitleClassName,
  workspaceSectionTitleClassName
} from "../styles/workspace";
import { formatNumber } from "../utils/format";
import { calculateConfigurationOutputs } from "../utils/systemResults";
import { validateConfiguration } from "../utils/validation";

function OverviewMetricColumn({
  items,
  className = ""
}: {
  items: Array<{ label: string; number: string | null; unit: string; icon: JSX.Element }>;
  className?: string;
}) {
  return (
    <div className={`divide-y divide-slate-200 ${className}`.trim()}>
      {items.map((item) => (
        <div key={item.label} className="flex flex-col items-center justify-center gap-1 px-4 py-4 sm:px-5">
          {item.icon}
          <p className={`${workspaceSubsectionTitleClassName} text-center`}>{item.label}</p>
          <p className="text-sm font-semibold leading-tight tracking-[-0.01em] text-slate-950">
            {item.number ?? "—"}
            <span className="ml-1 text-sm font-semibold leading-tight tracking-[-0.01em] text-slate-950">{item.unit}</span>
          </p>
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
      <div className="w-full max-w-xl">
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
          className={`max-w-xl ring-sky-200 ${workspaceInputClassName}`}
        />
      </div>
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
        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-slate-500 transition group-hover:border-sky-300 group-hover:bg-sky-50 group-hover:text-sky-700"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          className="h-4 w-4"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
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

  const summaryItems = [
    {
      label: t("overview.whPerDay"),
      number: outputs ? formatNumber(outputs.derivedResults.totalWhPerDay) : null,
      unit: t("overview.whPerDayUnit"),
      icon: (
        <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5 shrink-0 stroke-slate-400" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z" />
        </svg>
      )
    },
    {
      label: t("overview.solarPanel"),
      number: formatNumber(totalPanelPowerWp, 0),
      unit: "Wp",
      icon: (
        <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5 shrink-0 stroke-slate-400" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="3" width="20" height="13" rx="2" /><line x1="9" y1="3" x2="9" y2="16" /><line x1="15" y1="3" x2="15" y2="16" /><line x1="2" y1="9.5" x2="22" y2="9.5" /><line x1="12" y1="16" x2="12" y2="19" /><line x1="8" y1="19" x2="16" y2="19" />
        </svg>
      )
    },
    {
      label: t("overview.battery"),
      number: outputs ? formatNumber(outputs.derivedResults.systemRecommendation.batteryCapacityAh) : null,
      unit: "Ah",
      icon: (
        <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6 shrink-0 stroke-slate-400" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="3" y="7" width="16" height="10" rx="2" /><path d="M19 10h2v4h-2" /><path d="M7 10.5v3" /><path d="M10 10.5v3" /><path d="M13 10.5v3" />
        </svg>
      )
    },
    {
      label: t("overview.reserveSource"),
      number: outputs ? formatNumber(secondaryPowerW, 0) : null,
      unit: "W",
      icon: (
        <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6 shrink-0 stroke-slate-400" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <rect x="4" y="7" width="11" height="10" rx="2" /><path d="M15 10h1.5A3.5 3.5 0 0 1 20 13.5v0A3.5 3.5 0 0 1 16.5 17H15" /><path d="M9.5 10 7.5 13h2l-1 3 3-4h-2z" />
        </svg>
      )
    }
  ];
  const summaryColumns = [
    [summaryItems[0], summaryItems[2]],
    [summaryItems[1], summaryItems[3]]
  ];

  return (
    <main className={workspacePageClassName}>
      <WorkspaceHeader title={t("overview.title")} />

      <NveStandaloneMap
        key={`${activeDraft.id}-${activeDraft.location || "empty"}`}
        value={activeDraft.location}
        lat={activeDraft.locationLat}
        lng={activeDraft.locationLng}
        nveId={activeDraft.locationPlaceId}
        onChange={updateConfigurationLocation}
        startCollapsed={false}
      />

      <WorkspaceSection title={<EditableProjectName value={activeDraft.name} onCommit={updateConfigurationName} />}>
        <div className="space-y-5">
          <div className="hidden md:grid md:grid-cols-2 md:divide-x md:divide-slate-200">
            <OverviewMetricColumn items={summaryColumns[0]} className="md:pr-6" />
            <OverviewMetricColumn items={summaryColumns[1]} className="md:pl-6" />
          </div>

          <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 md:hidden">
            {summaryItems.map((item) => (
              <div key={item.label} className="rounded-2xl border border-slate-200 px-3 py-3 text-center">
                <div className="flex items-center justify-center gap-1.5">
                  {item.icon}
                  <p className="text-sm font-semibold leading-tight tracking-[-0.01em] text-slate-950">{item.label}</p>
                </div>
                <p className="mt-1.5 break-words text-sm font-semibold leading-tight tracking-[-0.01em] text-slate-950">
                  {item.number ?? "—"}
                  <span className="ml-1 text-sm font-semibold leading-tight tracking-[-0.01em] text-slate-950">{item.unit}</span>
                </p>
              </div>
            ))}
          </div>

        </div>
      </WorkspaceSection>

      {outputs ? (
        <BalanceBarChart rows={outputs.derivedResults.monthlyEnergyBalance} />
      ) : null}

      <WorkspaceActions onReset={resetDraft} onSave={saveDraftMetadata} />
    </main>
  );
}
