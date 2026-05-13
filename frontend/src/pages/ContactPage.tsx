import WorkspaceHeader from "../components/WorkspaceHeader";
import EditorialSection from "../components/EditorialSection";
import {
  workspaceBodyMutedClassName,
  workspaceContentValueClassName,
  workspacePageClassName
} from "../styles/workspace";

const teamMembers = [
  { name: "Nikolas Olsen", email: "nikolas.o@live.com", imageSrc: "/team/nikolas-olsen.jpg", imagePosition: "center 38%" },
  { name: "Dan Roald Larsen", email: "larsedr@gmail.com", imageSrc: "/team/dan-roald-larsen.jpg", imagePosition: "42% 34%" },
  { name: "Jin-Marie Bakke", email: "jinm97@hotmail.com" },
  { name: "Espen Espeland", email: "Espenask.espeland@gmail.com", imageSrc: "/team/espen-espeland.jpg" }
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
            <div className="mt-4 grid gap-x-12 gap-y-6 sm:grid-cols-2 xl:grid-cols-4">
              {teamMembers.map((member) => (
                <div key={member.name} className="flex min-w-0 flex-col items-center gap-2 text-center">
                  <div className="hg-mono flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full border border-[var(--hg-hairline)] bg-[var(--hg-surface)] text-[length:calc(var(--hg-type-content-size)_+_1px)] font-[var(--hg-type-weight-bold)] text-[var(--hg-accent)] shadow-sm">
                    {member.imageSrc ? (
                      <img
                        src={member.imageSrc}
                        alt={member.name}
                        className="h-full w-full object-cover"
                        style={{ objectPosition: member.imagePosition ?? "center" }}
                      />
                    ) : (
                      initials(member.name)
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-[length:calc(0.98rem_+_1px)] font-[var(--hg-type-weight-bold)] leading-tight text-[var(--hg-ink)]">{member.name}</p>
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
