import WorkspaceHeader from "../components/WorkspaceHeader";
import WorkspaceSection from "../components/WorkspaceSection";
import { useLanguage } from "../i18n";
import {
  workspaceBodyClassName,
  workspaceBodyStrongClassName,
  workspaceMetaClassName,
  workspacePageClassName,
  workspacePrimaryButtonClassName
} from "../styles/workspace";

const teamMembers = [
  { name: "Nikolas Olsen", titleKey: "contact.projectLeader" as const, email: "nikolas.o@live.com", imageSrc: "https://files.hydroguide.no/nikolas-olsen.jpg" },
  { name: "Dan Roald Larsen", titleKey: "contact.placeholder" as const, email: "placeholder@epost.no" },
  { name: "Jinn-Marie Bakke", titleKey: "contact.placeholder" as const, email: "placeholder@epost.no" },
  { name: "Espen Espenland", titleKey: "contact.placeholder" as const, email: "placeholder@epost.no" }
];

function TeamMemberCard({
  name,
  title,
  email,
  imageSrc
}: {
  name: string;
  title: string;
  email: string;
  imageSrc?: string;
}) {
  return (
    <article className="space-y-4">
      <div className="relative flex h-28 w-28 items-center justify-center overflow-hidden rounded-[2rem] bg-slate-100 text-slate-500">
        {imageSrc ? (
          <img src={imageSrc} alt={name} className="h-full w-full object-cover" />
        ) : (
          <svg viewBox="0 0 24 24" fill="none" className="h-14 w-14 stroke-current" strokeWidth="1.8" aria-hidden="true">
            <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M5 20a7 7 0 0 1 14 0" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </div>
      <div>
        <p className={workspaceBodyStrongClassName}>{name}</p>
        <p className={`mt-1 ${workspaceMetaClassName}`}>{title}</p>
        <a href={`mailto:${email}`} className={`mt-1.5 inline-block text-brand-700 ${workspaceBodyClassName}`}>
          {email}
        </a>
      </div>
    </article>
  );
}

function DownloadIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path
        d="M12 4.75v9.5m0 0 4-4m-4 4-4-4M5 16.75v1.5A1.75 1.75 0 0 0 6.75 20h10.5A1.75 1.75 0 0 0 19 18.25v-1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function ContactPage() {
  const { t } = useLanguage();

  return (
    <main className={workspacePageClassName}>
      <WorkspaceHeader title={t("contact.title")} />

      <WorkspaceSection title={t("contact.gettingStarted")}>
        <div className="flex flex-col gap-8 lg:flex-row lg:items-start lg:gap-12">
          <div className="w-full space-y-5 lg:w-1/2">
            <p className={`max-w-3xl ${workspaceBodyClassName}`}>
              {t("contact.gettingStartedDesc")}
            </p>
            <ol className={`space-y-2 ${workspaceBodyClassName}`}>
              <li>{t("contact.gettingStartedStep1")}</li>
              <li>{t("contact.gettingStartedStep2")}</li>
              <li>{t("contact.gettingStartedStep3")}</li>
            </ol>
          </div>
          <div className="flex w-full flex-col items-start gap-2 sm:flex-row sm:flex-wrap lg:w-auto lg:flex-shrink-0 lg:flex-col lg:pt-1">
            <a
              href="/Kalkulator.txt"
              download="Kalkulator.txt"
              className={`inline-flex ${workspacePrimaryButtonClassName} gap-2`}
            >
              <DownloadIcon className="h-4 w-4" />
              Kalkulator
            </a>
            <a
              href="/HydroGuide.txt"
              download="HydroGuide.txt"
              className={`inline-flex ${workspacePrimaryButtonClassName} gap-2`}
            >
              <DownloadIcon className="h-4 w-4" />
              HydroGuide
            </a>
            <a
              href="/PVGIS_6.0_HydroGuide_Beta.txt"
              download="PVGIS_6.0_HydroGuide_Beta.txt"
              className={`inline-flex ${workspacePrimaryButtonClassName} gap-2`}
            >
              <DownloadIcon className="h-4 w-4" />
              PVGIS 6.0 + HydroGuide (Beta)
            </a>
          </div>
        </div>
      </WorkspaceSection>

      <WorkspaceSection title={t("contact.aboutTitle")}>

        <p className={`max-w-3xl ${workspaceBodyClassName}`}>
          {t("contact.aboutDesc")}
        </p>
        <ul className={`mt-4 max-w-3xl space-y-2.5 ${workspaceBodyClassName}`}>
          <li className="flex gap-2">
            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-400" />
            <span>{t("contact.aboutBullet1")}</span>
          </li>
          <li className="flex gap-2">
            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-400" />
            <span>{t("contact.aboutBullet2")}</span>
          </li>
          <li className="flex gap-2">
            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-400" />
            <span>{t("contact.aboutBullet3")}</span>
          </li>
        </ul>
        <p className={`mt-4 max-w-3xl ${workspaceBodyClassName}`}>
          {t("contact.aboutDataIntro")}
        </p>
        <p className={`mt-3 max-w-3xl ${workspaceBodyClassName}`}>
          {t("contact.aboutDataNVE")}
        </p>
        <p className={`mt-3 max-w-3xl ${workspaceBodyClassName}`}>
          {t("contact.aboutDataSim")}
        </p>
        <p className={`mt-3 max-w-3xl ${workspaceBodyClassName}`}>
          {t("contact.aboutDataSimple")}
        </p>
      </WorkspaceSection>

      <WorkspaceSection title={t("contact.contactTitle")}>
        <div className="grid gap-8 sm:grid-cols-2 xl:grid-cols-4">
          {teamMembers.map((member) => (
            <TeamMemberCard
              key={member.name}
              name={member.name}
              title={t(member.titleKey)}
              email={member.email}
              imageSrc={member.imageSrc}
            />
          ))}
        </div>
      </WorkspaceSection>

      <WorkspaceSection title={t("contact.responsibilityTitle")}>
        <p className={`max-w-3xl ${workspaceBodyClassName}`}>
          {t("contact.responsibilityText")}
        </p>
      </WorkspaceSection>

      <WorkspaceSection title={t("contact.licenseTitle")}>
        <p className={`max-w-3xl ${workspaceBodyClassName}`}>
          {t("contact.licenseText")}
        </p>
      </WorkspaceSection>

    </main>
  );
}
