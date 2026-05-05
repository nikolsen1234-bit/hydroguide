import { CSSProperties } from "react";
import { useConfigurationContext } from "../context/ConfigurationContext";
import { useLanguage } from "../i18n";
import type { EngineMode } from "../types";
import { workspaceBodyClassName, workspaceMetaClassName, workspaceTitleClassName } from "../styles/workspace";

const leftFadeStyle: CSSProperties = {
  background:
    "linear-gradient(90deg, rgba(255,255,255,0.998) 0%, rgba(255,255,255,0.992) 14%, rgba(255,255,255,0.965) 28%, rgba(255,255,255,0.88) 40%, rgba(255,255,255,0.68) 50%, rgba(255,255,255,0.36) 61%, rgba(255,255,255,0.12) 73%, rgba(255,255,255,0) 100%)"
};

const topGlowStyle: CSSProperties = {
  background:
    "radial-gradient(circle at 22% 20%, rgba(255,255,255,0.88) 0%, rgba(255,255,255,0.4) 24%, transparent 52%)"
};

const bottomGlowStyle: CSSProperties = {
  background:
    "radial-gradient(circle at 30% 86%, rgba(255,255,255,0.9) 0%, rgba(255,255,255,0.34) 22%, transparent 46%)"
};

const bottomFadeStyle: CSSProperties = {
  background: "linear-gradient(180deg, rgba(255,255,255,0.02) 0%, rgba(255,255,255,0) 74%, rgba(255,255,255,0.24) 100%)"
};

const sunGlowStyle: CSSProperties = {
  background: "radial-gradient(circle at 98% 2%, rgba(255,243,191,0.42) 0%, transparent 18%)"
};

function ModeIcon({ d, className }: { d: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={`h-5 w-5 shrink-0 stroke-current ${className ?? ""}`} strokeWidth="1.6" aria-hidden="true">
      <path d={d} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const MODE_OPTIONS: { key: EngineMode; iconPath: string }[] = [
  // Calculator (simple)
  { key: "standard", iconPath: "M15.75 15.75V18m-7.5-6.75h.008v.008H8.25v-.008Zm0 2.25h.008v.008H8.25v-.008Zm0 2.25h.008v.008H8.25v-.008Zm2.25-4.5h.008v.008H10.5v-.008Zm0 2.25h.008v.008H10.5v-.008Zm0 2.25h.008v.008H10.5v-.008Zm2.25-4.5h.008v.008H12.75v-.008Zm0 2.25h.008v.008H12.75v-.008Zm2.25-4.5h.008v.008H15v-.008Zm0 2.25h.008v.008H15v-.008ZM6 10.5h12M6 10.5V19a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-8.5M6 10.5V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v5.5" },
  // HydroGuide (clipboard-document-list)
  { key: "combined", iconPath: "M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15a2.25 2.25 0 0 1 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25ZM6.75 12h.008v.008H6.75V12Zm0 3h.008v.008H6.75V15Zm0 3h.008v.008H6.75V18Z" },
  // PVGIS (chart-bar + sun)
  { key: "detailed", iconPath: "M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" },
];

export default function WelcomePage() {
  const { t } = useLanguage();
  const { activeDraft, updateConfigField } = useConfigurationContext();
  const currentMode = activeDraft.engineMode ?? "standard";

  return (
    <main className="relative min-h-[calc(100vh-5rem)] overflow-hidden bg-white md:h-full md:min-h-0">
      <section className="relative min-h-[calc(100vh-5rem)] overflow-hidden bg-white md:h-full md:min-h-0">
        <img
          src="https://files.hydroguide.no/welcome-smallhydro.png"
          alt=""
          className="absolute inset-0 h-full w-full object-cover object-[78%_center]"
        />

        <div className="pointer-events-none absolute inset-0" style={leftFadeStyle} />
        <div className="pointer-events-none absolute inset-0" style={topGlowStyle} />
        <div className="pointer-events-none absolute inset-0" style={bottomGlowStyle} />
        <div className="pointer-events-none absolute inset-0" style={bottomFadeStyle} />
        <div className="pointer-events-none absolute inset-0" style={sunGlowStyle} />

        <div className="relative flex h-full min-h-[calc(100vh-5rem)] flex-col items-start px-8 py-10 sm:px-12 sm:py-14 lg:px-16 lg:py-16 md:min-h-0">
          <div className="max-w-[34rem]">
            <h1 className={`${workspaceTitleClassName} text-[#163447]`}>
              <span className="block">{t("welcome.title1")}</span>
              <span className="block">{t("welcome.title2")}</span>
            </h1>

            <div className={`mt-8 space-y-6 text-[#36586c] ${workspaceBodyClassName}`}>
              <p className="max-w-[31rem]">
                {t("welcome.description1")}
              </p>
              <p className="max-w-[31rem]">
                {t("welcome.description2")}
              </p>
              <p className="max-w-[31rem]">
                {t("welcome.developedBy")} <span className="font-extrabold text-[#163447]">Nikolas Olsen</span>,{" "}
                <span className="font-extrabold text-[#163447]">Dan Roald Larsen</span>,{" "}
                <span className="font-extrabold text-[#163447]">Jinn-Marie Bakke</span> {t("welcome.and")}{" "}
                <span className="font-extrabold text-[#163447]">Espen Espenland</span> {t("welcome.developedBySchool")}{" "}
                <span className="font-extrabold text-[#163447]">Fagskulen Vestland (2026)</span>.
              </p>
            </div>

            {/* Engine mode selector */}
            <div className="mt-10">
              <div className="flex flex-col gap-3">
                {MODE_OPTIONS.map(({ key, iconPath }) => {
                  const active = currentMode === key;
                  return (
                    <button
                      key={key}
                      onClick={() => updateConfigField("engineMode", key)}
                      className={`flex items-start gap-3 rounded-xl border px-4 py-3 text-left transition-all ${
                        active
                          ? "border-sky-500 bg-sky-50/60 shadow-sm"
                          : "border-slate-200/80 bg-white/70 hover:border-slate-300 hover:bg-white/90"
                      }`}
                    >
                      <ModeIcon d={iconPath} className={`mt-0.5 ${active ? "text-sky-600" : "text-slate-400"}`} />
                      <div className="min-w-0">
                        <span className={`block text-sm font-semibold ${active ? "text-sky-700" : "text-[#163447]"}`}>
                          {t(`welcome.mode${key.charAt(0).toUpperCase() + key.slice(1)}Title` as any)}
                        </span>
                        <span className="mt-0.5 block leading-relaxed text-slate-500" style={{ fontSize: "12.6875px" }}>
                          {t(`welcome.mode${key.charAt(0).toUpperCase() + key.slice(1)}Desc` as any)}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <p className={`mt-auto pt-8 text-[#5c7890] ${workspaceMetaClassName}`}>
            {t("welcome.copyright")}
          </p>
        </div>
      </section>
    </main>
  );
}
