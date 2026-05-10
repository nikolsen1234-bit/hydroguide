import WorkspaceHeader from "../components/WorkspaceHeader";
import EditorialSection from "../components/EditorialSection";
import {
  workspaceBodyMutedClassName,
  workspaceContentValueClassName,
  workspacePageClassName
} from "../styles/workspace";

const teamMembers = [
  { name: "Nikolas Olsen", role: "Prosjektleder", email: "nikolas.o@live.com" },
  { name: "Dan Roald Larsen", role: "Instrumentering", email: "placeholder@epost.no" },
  { name: "Jin-Marie Bakke", role: "Kraftsystem", email: "placeholder@epost.no" },
  { name: "Espen Espeland", role: "Kommunikasjon", email: "placeholder@epost.no" }
];

const resources = [
  { name: "Kalkulator", meta: "Eksempelfil · TXT", href: "/Kalkulator.txt", download: "Kalkulator.txt" },
  { name: "HydroGuide", meta: "Eksempelfil · TXT", href: "/HydroGuide.txt", download: "HydroGuide.txt" },
  { name: "Hovedprosjektsøknad", meta: "Vedlegg · PDF", href: "/Hovedprosjektsoknad.pdf", download: "Hovedprosjektsoknad.pdf" }
];

function initials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("");
}

function Icon({ path }: { path: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4 stroke-current" strokeWidth="1.7" aria-hidden="true">
      <path d={path} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const downloadIcon =
  "M12 4.75v9.5m0 0 4-4m-4 4-4-4M5 16.75v1.5A1.75 1.75 0 0 0 6.75 20h10.5A1.75 1.75 0 0 0 19 18.25v-1.5";

export default function ContactPage() {
  return (
    <main className={workspacePageClassName}>
      <WorkspaceHeader title="Kontakt" />

      <div className="flex flex-col gap-4">
        <EditorialSection title="Teamet" description="Fagskulen Vestland · 2026">
          <div>
            <p className={`max-w-2xl ${workspaceBodyMutedClassName}`}>
              Hovedprosjekt i elektroautomasjon, utviklet av fire studenter med fagbakgrunn i hydraulikk,
              kraftsystem og kommunikasjon.
            </p>
            <div className="mt-4 grid gap-x-12 gap-y-3 sm:grid-cols-2 xl:grid-cols-4">
              {teamMembers.map((member) => (
                <div key={member.name} className="flex min-w-0 items-center gap-3">
                  <div className="hg-mono flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[var(--hg-hairline)] bg-[var(--hg-surface)] text-[length:var(--hg-type-meta-size)] font-[var(--hg-type-weight-bold)] text-[var(--hg-accent)]">
                    {initials(member.name)}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-[length:var(--hg-type-content-size)] font-[var(--hg-type-weight-bold)] leading-tight text-[var(--hg-ink)]">{member.name}</p>
                    <p className="hg-mono mt-1 truncate text-[length:var(--hg-type-overline-size)] uppercase tracking-[var(--hg-type-overline-tracking)] text-[var(--hg-muted)]">{member.role}</p>
                    <a href={`mailto:${member.email}`} className="mt-0.5 block truncate text-[length:var(--hg-type-meta-size)] font-[var(--hg-type-weight-medium)] text-[var(--hg-accent)]">{member.email}</a>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </EditorialSection>

        <EditorialSection title="Ressurser" description="Nedlastinger og referanser">
          <div>
            {resources.map((resource, index) => (
              <a
                key={resource.name}
                href={resource.href}
                download={resource.download}
                className={`flex items-center justify-between gap-4 px-1 py-3 transition hover:bg-[var(--hg-surface-2)] ${
                  index === 0 ? "" : "border-t border-[var(--hg-hairline-2)]"
                }`}
              >
                <span className="flex min-w-0 items-center gap-3">
                  <span className="text-[var(--hg-accent)]">
                    <Icon path={downloadIcon} />
                  </span>
                  <span className={workspaceContentValueClassName}>{resource.name}</span>
                </span>
                <span className="hg-mono shrink-0 text-right text-[length:var(--hg-type-meta-size)] text-[var(--hg-muted)]">
                  {resource.meta}
                </span>
              </a>
            ))}
          </div>
        </EditorialSection>

        <EditorialSection title="Ansvar">
          <p className={`max-w-2xl ${workspaceBodyMutedClassName}`}>
            HydroGuide er veiledende og erstatter ikke faglig skjønn. Resultater, anbefalinger og eksportert
            materiale må kontrolleres før de brukes i prosjektering eller myndighetsdialog.
          </p>
        </EditorialSection>
      </div>
    </main>
  );
}
