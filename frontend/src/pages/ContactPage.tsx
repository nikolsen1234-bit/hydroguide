import WorkspaceHeader from "../components/WorkspaceHeader";
import WorkspaceSection from "../components/WorkspaceSection";
import {
  workspaceBodyMutedClassName,
  workspaceContentValueClassName,
  workspaceMetaClassName,
  workspacePageClassName
} from "../styles/workspace";

const teamMembers = [
  { name: "Nikolas Olsen", role: "Prosjektleder", email: "nikolas.o@live.com" },
  { name: "Dan Roald Larsen", role: "Hydraulikk", email: "placeholder@epost.no" },
  { name: "Jinn-Marie Bakke", role: "Kraftsystem", email: "placeholder@epost.no" },
  { name: "Espen Espenland", role: "Kommunikasjon", email: "placeholder@epost.no" }
];

const resources = [
  { name: "Kalkulator", meta: "Eksempelfil · TXT", href: "/Kalkulator.txt", download: "Kalkulator.txt" },
  { name: "HydroGuide", meta: "Eksempelfil · TXT", href: "/HydroGuide.txt", download: "HydroGuide.txt" },
  { name: "Metodegrunnlag", meta: "Dokumentasjon", href: "/dokumentasjon" },
  { name: "NVE Atlas", meta: "Ekstern lenke", href: "https://atlas.nve.no/" }
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
const infoIcon = "M11.25 11.25l.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z";

export default function ContactPage() {
  return (
    <main className={workspacePageClassName}>
      <WorkspaceHeader title="Info" />

      <div className="flex flex-col gap-4">
        <WorkspaceSection title="Teamet" description="Fagskulen Vestland · 2026">
          <div>
            <p className={`max-w-2xl ${workspaceBodyMutedClassName}`}>
              Hovedprosjekt i elektroautomasjon, utviklet av fire studenter med fagbakgrunn i hydraulikk,
              kraftsystem og kommunikasjon.
            </p>
            <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {teamMembers.map((member) => (
                <article key={member.name} className="flex min-w-0 items-center gap-4 rounded-lg border border-[var(--hg-hairline)] p-4">
                  <div className="hg-mono flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[var(--hg-accent-2)] bg-[var(--hg-accent-soft)] text-[0.82rem] font-[var(--hg-type-weight-bold)] text-[var(--hg-accent)]">
                    {initials(member.name)}
                  </div>
                  <div className="min-w-0">
                    <p className={workspaceContentValueClassName}>{member.name}</p>
                    <p className="hg-mono mt-1 text-[10px] uppercase tracking-[0.14em] text-[var(--hg-muted)]">{member.role}</p>
                    <a href={`mailto:${member.email}`} className="mt-1 block truncate text-[length:var(--hg-type-ui-size)] font-[var(--hg-type-weight-medium)] text-[var(--hg-accent)]">
                      {member.email}
                    </a>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </WorkspaceSection>

        <WorkspaceSection title="Ressurser" description="Nedlastinger og referanser">
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
        </WorkspaceSection>

        <section className="flex gap-3 rounded-lg border border-[var(--hg-hairline-2)] bg-[var(--hg-surface-2)] p-4">
          <span className="mt-0.5 text-[var(--hg-muted)]">
            <Icon path={infoIcon} />
          </span>
          <div>
            <p className={workspaceMetaClassName}>Ansvar</p>
            <p className={`mt-1 ${workspaceBodyMutedClassName}`}>
              HydroGuide er veiledende og erstatter ikke faglig skjønn. Resultater, anbefalinger og eksportert
              materiale må kontrolleres før de brukes i prosjektering eller myndighetsdialog.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
