import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import WorkspaceHeader, { WorkspaceHeaderActionButton, workspaceHeaderActionIcons } from "../components/WorkspaceHeader";
import { useConfigurationContext } from "../context/ConfigurationContext";
import { workspaceTitleClassName } from "../styles/workspace";
import type { EngineMode } from "../types";

const team = [
  { name: "Nikolas Olsen", imageSrc: "/team/nikolas-olsen.jpg", imagePosition: "center 38%" },
  { name: "Dan Roald Larsen", imageSrc: "/team/dan-roald-larsen.jpg", imagePosition: "42% 34%" },
  { name: "Jin-Marie Bakke", imageSrc: "/team/jin-marie-bakke.jpg", imagePosition: "center 35%" },
  { name: "Espen Espeland", imageSrc: "/team/espen-espeland.jpg" }
];

function TeamList() {
  return (
    <div className="mt-6 max-w-[43.5rem] pb-5">
      <h3 className="text-[length:calc(var(--hg-type-content-size)_+_1px)] font-[var(--hg-type-weight-bold)] text-[var(--hg-ink)]">
        Prosjektgruppe
      </h3>
      <div className="mt-4 grid max-w-[42rem] gap-x-16 gap-y-5 sm:grid-cols-2">
        {team.map(({ name, imageSrc, imagePosition }, index) => (
          <div key={name} className={`flex min-w-0 flex-col items-center gap-2 text-center ${index < 2 ? "-translate-y-2" : ""}`}>
            <div className="hg-mono flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full border border-[var(--hg-hairline)] bg-[var(--hg-surface)] text-[length:calc(var(--hg-type-content-size)_+_1px)] font-[var(--hg-type-weight-bold)] text-[var(--hg-accent)] shadow-sm">
              {imageSrc ? (
                <img
                  src={imageSrc}
                  alt={name}
                  className="h-full w-full object-cover"
                  style={{ objectPosition: imagePosition ?? "center" }}
                />
              ) : (
                name
                  .split(" ")
                  .map((part) => part[0])
                  .slice(0, 2)
                  .join("")
              )}
            </div>
            <div className="min-w-0">
              <p className="truncate text-[length:calc(0.98rem_+_1px)] font-[var(--hg-type-weight-bold)] leading-tight text-[var(--hg-ink)]">
                {name}
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
    { value: "calculator", title: "Kalkulator", text: "Rask dimensjonering uten prosjektgrunnlag." },
    { value: "hydroguide", title: "HydroGuide", text: "Full arbeidsflyt med prosjektgrunnlag og NVE-data." }
  ];

  return (
    <div className="max-w-[43.5rem] border-t border-[var(--hg-hairline)] pt-5">
      <h3 className="text-[length:calc(var(--hg-type-content-size)_+_1px)] font-[var(--hg-type-weight-bold)] text-[var(--hg-ink)]">
        Modus
      </h3>
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
  const [selectedEngineMode, setSelectedEngineMode] = useState<EngineMode>(activeDraft.engineMode ?? "calculator");
  const selectedEngineModeRef = useRef<EngineMode>(activeDraft.engineMode ?? "calculator");

  useEffect(() => {
    const currentEngineMode = activeDraft.engineMode ?? "calculator";
    selectedEngineModeRef.current = currentEngineMode;
    setSelectedEngineMode(currentEngineMode);
  }, [activeDraft.engineMode, activeDraft.id]);

  const handleStartBlank = () => {
    createNewConfiguration(selectedEngineModeRef.current);
    navigate("/oversikt");
  };

  const handleEngineModeChange = (nextMode: EngineMode) => {
    selectedEngineModeRef.current = nextMode;
    setSelectedEngineMode(nextMode);
    updateConfigField("engineMode", nextMode);
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
    <main className="relative isolate flex min-h-full flex-col bg-[var(--hg-bg)] px-4 pb-0 pt-0 text-[var(--hg-ink)] sm:px-6 lg:min-h-screen lg:px-7">
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
            className="hg-welcome-logo-bg-light absolute inset-y-0 right-0 h-full w-full max-w-none translate-x-0 object-fill"
            style={{
              left: "-6%",
              width: "112%",
              opacity: 0.09
            }}
          />
          <img
            src="/hydroguide-wave-white.svg"
            alt=""
            className="hg-welcome-logo-bg-dark absolute inset-y-0 right-0 h-full w-full max-w-none translate-x-0 object-fill"
            style={{
              left: "-6%",
              width: "112%",
              opacity: 0.12
            }}
          />
      </div>
      <div className="relative z-10">
        <WorkspaceHeader
          title="HydroGuide"
          actions={
            <>
              <WorkspaceHeaderActionButton
                icon={workspaceHeaderActionIcons.plus}
                label="Start nytt prosjekt"
                subLabel="Tomt utkast"
                onClick={handleStartBlank}
                primary
              />
              <WorkspaceHeaderActionButton
                icon={workspaceHeaderActionIcons.upload}
                label="Importer fil"
                subLabel="Prosjektfil"
                onClick={() => fileInputRef.current?.click()}
                tone="success"
              />
            </>
          }
        />
      </div>

      <section className="relative z-10 min-h-0 flex-1 pb-5 pt-4">
        <div className="relative z-10 max-w-[43.5rem]">
          <h1 className={`${workspaceTitleClassName} text-[length:var(--hg-type-hero-title-size)] leading-[1.05] lg:text-[length:var(--hg-type-hero-title-size-lg)]`}>
            HydroGuide
          </h1>
          <p className="mt-3 max-w-[43.5rem] text-[length:var(--hg-type-hero-lead-size)] font-[var(--hg-type-weight-bold)] leading-[1.18] tracking-[var(--hg-type-tight-tracking)] text-[var(--hg-accent)]">
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
            mode={selectedEngineMode}
            onChange={handleEngineModeChange}
          />
        </div>
      </section>

      <input
        ref={fileInputRef}
        type="file"
        className="sr-only"
        tabIndex={-1}
        accept=".txt,text/plain"
        onChange={(event) => void handleImport(event.target.files?.[0])}
      />
      {importError ? <p className="py-3 text-[length:var(--hg-type-content-size)] text-rose-600">{importError}</p> : null}
    </main>
  );
}
