import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import WorkspaceHeader from "../components/WorkspaceHeader";
import { useConfigurationContext } from "../context/ConfigurationContext";
import {
  workspaceMetaClassName,
  workspaceTitleClassName
} from "../styles/workspace";

const team = [
  ["Nikolas Olsen", "Prosjektleder"],
  ["Dan Roald Larsen", "Hydraulikk"],
  ["Jinn-Marie Bakke", "Kraftsystem"],
  ["Espen Espenland", "Kommunikasjon"]
];

function Icon({ path, className = "" }: { path: string; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className={`h-4 w-4 stroke-current ${className}`}
      strokeWidth="1.7"
      aria-hidden="true"
    >
      <path d={path} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const icons = {
  plus: "M12 4.5v15m7.5-7.5h-15",
  upload: "M12 19.25v-9.5m0 0-4 4m4-4 4 4M5 7.25v-1.5A1.75 1.75 0 0 1 6.75 4h10.5A1.75 1.75 0 0 1 19 5.75v1.5"
};

function HeaderActionButton({
  icon,
  label,
  onClick,
  primary = false
}: {
  icon: string;
  label: string;
  onClick: () => void;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex h-9 shrink-0 items-center gap-2 rounded-lg px-3 text-[length:var(--hg-type-ui-size)] font-[var(--hg-type-weight-semibold)] transition ${
        primary
          ? "bg-[var(--hg-accent)] text-white hover:bg-[var(--hg-accent-2)]"
          : "border border-[var(--hg-hairline)] bg-[var(--hg-surface)] text-[var(--hg-ink)] hover:bg-[var(--hg-surface-2)]"
      }`}
    >
      <Icon path={icon} />
      <span className="whitespace-nowrap">{label}</span>
    </button>
  );
}

function TeamList() {
  return (
    <div className="mt-6 max-w-[43.5rem] border-b border-[var(--hg-hairline)] pb-5">
      <p className={workspaceMetaClassName}>Prosjektgruppe</p>
      <div className="mt-3 grid max-w-[42rem] gap-x-16 gap-y-3 sm:grid-cols-2">
        {team.map(([name, role]) => (
          <div key={name} className="flex min-w-0 items-center gap-3">
            <div className="hg-mono flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[var(--hg-hairline)] bg-[var(--hg-surface)] text-[8px] font-[var(--hg-type-weight-bold)] text-[var(--hg-accent)]">
              {name
                .split(" ")
                .map((part) => part[0])
                .slice(0, 2)
                .join("")}
            </div>
            <div className="min-w-0">
              <p className="truncate text-[0.92rem] font-[var(--hg-type-weight-bold)] leading-tight text-[var(--hg-ink)]">
                {name}
              </p>
              <p className="hg-mono mt-1 truncate text-[10px] uppercase tracking-[0.14em] text-[var(--hg-muted)]">
                {role}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function WelcomePage() {
  const {
    createNewConfiguration,
    importConfiguration
  } = useConfigurationContext();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  const handleStartBlank = () => {
    createNewConfiguration();
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
      <WorkspaceHeader
        title="Velkommen til HydroGuide"
        breadcrumb="Home"
        actions={
          <>
            <HeaderActionButton icon={icons.plus} label="Start tomt prosjekt" onClick={handleStartBlank} primary />
            <HeaderActionButton icon={icons.upload} label="Importer prosjekt" onClick={() => fileInputRef.current?.click()} />
          </>
        }
      />

      <section className="relative min-h-0 flex-1 overflow-hidden border-b border-[var(--hg-hairline)] bg-[var(--hg-bg)] py-7">
        <img
          src="/hydroguide-logo-black.svg"
          alt=""
          aria-hidden="true"
          className="pointer-events-none absolute -right-[28rem] bottom-[-3rem] top-4 z-0 hidden h-[calc(100%+2rem)] w-auto max-w-none object-contain opacity-[0.045] dark:hidden lg:block"
        />
        <img
          src="/hydroguide-logo-white.svg"
          alt=""
          aria-hidden="true"
          className="pointer-events-none absolute -right-[28rem] bottom-[-3rem] top-4 z-0 hidden h-[calc(100%+2rem)] w-auto max-w-none object-contain opacity-[0.035] dark:lg:block"
        />

        <div className="relative z-10 max-w-[43.5rem]">
          <h1 className={`${workspaceTitleClassName} text-[2.55rem] leading-[1.05] lg:text-[3.05rem]`}>
            Digitalt støtteverktøy
            <span className="block">for minstevannføring ved</span>
            <span className="block">avsidesliggende inntak</span>
          </h1>

          <p className="mt-4 max-w-[42rem] text-[0.94rem] leading-6 text-[var(--hg-ink-2)]">
            HydroGuide er et digitalt hjelpemiddel for prosjektering av minstevannføringsarrangementer i
            småkraft. Løsningen er laget med fokus på avsidesliggende inntak og forholdene rundt disse.
          </p>

          <div className="mt-6 max-w-[43.5rem] border-t border-[var(--hg-hairline)] pt-6 text-[0.94rem] leading-6 text-[var(--hg-ink-2)]">
            <p>
              HydroGuide er utviklet som en del av et avsluttende hovedprosjekt ved Fagskulen Vestland.
              Prosjektet tar for seg utfordringer knyttet til vannkraftverk med avsidesliggende inntak,
              der manglende strømforsyning, ustabil kommunikasjon og utilstrekkelig instrumentering gjør det
              krevende å oppfylle krav til minstevannføring.
            </p>
            <p className="mt-3">Problemstillingen har vært:</p>
            <p className="mt-3">
              Hvordan kan en skalerbar og modulær utstyrspakke utvikles for vannkraftverk med avsidesliggende
              inntak uten kablet strømforsyning?
            </p>
            <p className="mt-3">
              <strong className="font-[var(--hg-type-weight-bold)] text-[var(--hg-ink)]">HydroGuide</strong> er vårt svar på dette.
            </p>
          </div>

          <TeamList />
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
