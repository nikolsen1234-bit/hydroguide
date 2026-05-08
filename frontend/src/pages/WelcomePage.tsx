import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import WorkspaceHeader, { WorkspaceHeaderActionButton, workspaceHeaderActionIcons } from "../components/WorkspaceHeader";
import { useConfigurationContext } from "../context/ConfigurationContext";
import {
  workspaceMetaClassName,
  workspaceTitleClassName
} from "../styles/workspace";
import type { EngineMode } from "../types";

const team = [
  ["Nikolas Olsen", "Prosjektleder"],
  ["Dan Roald Larsen", "Instrumentering"],
  ["Jinn-Marie Bakke", "Kraftsystem"],
  ["Espen Espenland", "Kommunikasjon"]
];

const welcomeMetaClassName =
  "hg-mono text-[length:calc(var(--hg-type-meta-size)_+_1px)] font-[var(--hg-type-weight-medium)] uppercase tracking-[0.14em] text-[var(--hg-muted)]";

function TeamList() {
  return (
    <div className="mt-6 max-w-[43.5rem] pb-5">
      <p className={welcomeMetaClassName}>Prosjektgruppe</p>
      <div className="mt-3 grid max-w-[42rem] gap-x-16 gap-y-3 sm:grid-cols-2">
        {team.map(([name, role]) => (
          <div key={name} className="flex min-w-0 items-center gap-3">
            <div className="hg-mono flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[var(--hg-hairline)] bg-[var(--hg-surface)] text-[9px] font-[var(--hg-type-weight-bold)] text-[var(--hg-accent)]">
              {name
                .split(" ")
                .map((part) => part[0])
                .slice(0, 2)
                .join("")}
            </div>
            <div className="min-w-0">
              <p className="truncate text-[length:calc(0.92rem_+_1px)] font-[var(--hg-type-weight-bold)] leading-tight text-[var(--hg-ink)]">
                {name}
              </p>
              <p className="hg-mono mt-1 truncate text-[11px] uppercase tracking-[0.14em] text-[var(--hg-muted)]">
                {role}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function EngineModeButtons({
  mode,
  onChange
}: {
  mode: EngineMode;
  onChange: (mode: EngineMode) => void;
}) {
  const modes: Array<{ value: EngineMode; title: string; text: string }> = [
    { value: "standard", title: "Kalkulator", text: "Rask dimensjonering uten prosjektgrunnlag." },
    { value: "combined", title: "HydroGuide", text: "Full arbeidsflyt med prosjektgrunnlag og NVE-data." }
  ];

  return (
    <div className="max-w-[43.5rem] border-t border-[var(--hg-hairline)] pt-5">
      <p className={workspaceMetaClassName}>Modus</p>
      <div className="mt-3 grid max-w-[42rem] gap-3 sm:grid-cols-2">
        {modes.map((item) => {
          const selected = mode === item.value;

          return (
            <button
              key={item.value}
              type="button"
              aria-pressed={selected}
              onClick={() => onChange(item.value)}
              className={`min-h-[4.75rem] rounded-lg border px-4 py-3 text-left transition ${
                selected
                  ? "border-[var(--hg-accent-2)] bg-[var(--hg-accent-soft)] text-[var(--hg-ink)]"
                  : "border-[var(--hg-hairline)] bg-[var(--hg-surface)] text-[var(--hg-ink)] hover:border-[var(--hg-accent-2)]"
              }`}
            >
              <span className="block text-[length:var(--hg-type-content-size)] font-[var(--hg-type-weight-bold)]">
                {item.title}
              </span>
              <span className="mt-1 block text-[length:var(--hg-type-ui-size)] leading-5 text-[var(--hg-muted)]">
                {item.text}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function WelcomePage() {
  const {
    activeDraft,
    createNewConfiguration,
    importConfiguration,
    updateConfigField
  } = useConfigurationContext();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  const handleStartBlank = () => {
    const selectedEngineMode = activeDraft.engineMode ?? "standard";
    createNewConfiguration();
    updateConfigField("engineMode", selectedEngineMode);
    navigate("/oversikt");
  };

  const handleImport = async (file: File | undefined) => {
    if (!file) {
      return;
    }

    setImportError(null);
    try {
      const imported = await importConfiguration(file);
      if (imported) {
        navigate("/oversikt");
      }
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "Importen feilet.");
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  return (
    <main className="relative isolate flex min-h-full flex-col bg-[var(--hg-bg)] px-4 pb-0 pt-0 text-[var(--hg-ink)] sm:px-6 lg:px-7 md:h-full md:overflow-hidden">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 z-0 hidden lg:block"
        style={{
          left: "48%",
          right: "-4.5%"
        }}
      >
          <img
            src="/hydroguide-wave-black.svg"
            alt=""
            className="hg-welcome-logo-bg-light absolute inset-y-0 right-0 h-full w-full max-w-none translate-x-0 object-cover"
            style={{
              left: "-6%",
              width: "112%",
              opacity: 0.09
            }}
          />
          <img
            src="/hydroguide-wave-white.svg"
            alt=""
            className="hg-welcome-logo-bg-dark absolute inset-y-0 right-0 h-full w-full max-w-none translate-x-0 object-cover"
            style={{
              left: "-6%",
              width: "112%",
              opacity: 0.12
            }}
          />
      </div>
      <div className="relative z-10">
        <WorkspaceHeader
          title="Velkommen til HydroGuide"
          breadcrumb="Home"
          actions={
            <>
              <WorkspaceHeaderActionButton
                icon={workspaceHeaderActionIcons.plus}
                label="Start new project"
                subLabel="Start blank"
                onClick={handleStartBlank}
                primary
              />
              <WorkspaceHeaderActionButton
                icon={workspaceHeaderActionIcons.upload}
                label="Import file"
                subLabel="Project file"
                onClick={() => fileInputRef.current?.click()}
              />
            </>
          }
        />
      </div>

      <section className="relative z-10 min-h-0 flex-1 overflow-hidden py-7">
        <div className="relative z-10 max-w-[43.5rem]">
          <h1 className={`${workspaceTitleClassName} text-[2.55rem] leading-[1.05] lg:text-[3.05rem]`}>
            HydroGuide
          </h1>
          <p className="mt-3 max-w-[43.5rem] text-[1.55rem] font-[var(--hg-type-weight-bold)] leading-[1.18] tracking-[var(--hg-type-tight-tracking)] text-[var(--hg-accent)]">
            Prosjektering av utstyrspakker for{" "}
            <span className="whitespace-nowrap">avsidesliggende småkraftinntak</span>
          </p>

          <div className="mt-5 max-w-[43.5rem] text-[length:calc(0.91rem_+_1px)] leading-[1.52] text-[var(--hg-ink-2)]">
            <h2 className="text-[length:calc(var(--hg-type-section-title-size)_+_1px)] font-[var(--hg-type-weight-bold)] leading-[var(--hg-type-section-title-leading)] text-[var(--hg-ink)]">
              Om HydroGuide
            </h2>
            <p className="mt-2">
              HydroGuide er utviklet som en del av et avsluttende hovedprosjekt ved Fagskulen Vestland.
            </p>
            <h3 className="mt-3 text-[length:calc(var(--hg-type-content-size)_+_1px)] font-[var(--hg-type-weight-bold)] text-[var(--hg-ink)]">
              Problemstilling
            </h3>
            <p className="mt-1.5">
              Hvordan kan en skalerbar og modulær utstyrspakke utvikles for vannkraftverk med avsidesliggende
              inntak uten kablet strømforsyning?
            </p>
            <h3 className="mt-3 text-[length:calc(var(--hg-type-content-size)_+_1px)] font-[var(--hg-type-weight-bold)] text-[var(--hg-ink)]">
              Vårt svar
            </h3>
            <p className="mt-1.5">
              Prosjektgruppens svar på denne problemstillingen er:{" "}
              <strong className="font-[var(--hg-type-weight-bold)] text-[var(--hg-ink)]">HydroGuide</strong>.
            </p>
            <p className="mt-2">
              HydroGuide er utviklet som et digitalt støtteverktøy for planlegging, vurdering og dokumentasjon
              av løsninger for avsidesliggende inntak.
            </p>
            <p className="mt-2">
              Verktøyet skal gjøre det enklere å strukturere prosjektgrunnlag, vurdere tekniske valg og dokumentere
              en skalerbar og modulær utstyrspakke tilpasset krevende inntaksområder.
            </p>
          </div>

          <TeamList />
          <EngineModeButtons
            mode={activeDraft.engineMode ?? "standard"}
            onChange={(nextMode) => updateConfigField("engineMode", nextMode)}
          />
        </div>
      </section>

      <input
        ref={fileInputRef}
        type="file"
        className="sr-only"
        accept=".txt,text/plain"
        onChange={(event) => void handleImport(event.target.files?.[0])}
      />
      {importError ? <p className="py-3 text-[length:var(--hg-type-content-size)] text-rose-600">{importError}</p> : null}
    </main>
  );
}
