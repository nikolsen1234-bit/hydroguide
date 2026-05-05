import { Suspense, lazy, useEffect, useState } from "react";
import { useRef } from "react";
import { Link, Navigate, NavLink, Route, Routes } from "react-router-dom";
import BuildInfoBadge from "./components/BuildInfoBadge";
import HydroGuideLogo from "./components/HydroGuideLogo";
import ImportDropZone from "./components/ImportDropZone";
import { useConfigurationContext } from "./context/ConfigurationContext";
import { useLanguage } from "./i18n";
import type { TranslationKey } from "./i18n";
import { workspaceBodyClassName } from "./styles/workspace";
import type { EngineMode } from "./types";

const BudgetPage = lazy(() => import("./pages/BudgetPage"));
const AnalysisPage = lazy(() => import("./pages/AnalysisPage"));
const ContactPage = lazy(() => import("./pages/ContactPage"));
const ApiPage = lazy(() => import("./pages/ApiPage"));
const DocumentationPage = lazy(() => import("./pages/DocumentationPage"));
const OverviewPage = lazy(() => import("./pages/OverviewPage"));
const WelcomePage = lazy(() => import("./pages/WelcomePage"));
const MainPage = lazy(() => import("./pages/MainPage"));
const SiktlinjeRadioPage = lazy(() => import("./pages/SiktlinjeRadioPage"));
const SystemPage = lazy(() => import("./pages/SystemPage"));

function SidebarIcon({ path }: { path: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5 stroke-current" strokeWidth="1.8" aria-hidden="true">
      <path d={path} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const navItems: Array<{ to: string; labelKey: TranslationKey; icon: string; modes?: EngineMode[] }> = [
  {
    to: "/oversikt",
    labelKey: "nav.overview",
    icon: "M3.75 9.75 12 3l8.25 6.75v9A2.25 2.25 0 0 1 18 21H6a2.25 2.25 0 0 1-2.25-2.25v-9Z"
  },
  {
    to: "/parametere",
    labelKey: "nav.projectBasis",
    icon: "m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10",
    modes: ["detailed", "combined"]
  },
  {
    to: "/system",
    labelKey: "nav.technicalParameters",
    icon: "M10.5 6h9.75M10.5 6a1.5 1.5 0 1 1-3 0m3 0a1.5 1.5 0 1 0-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-9.75 0h9.75"
  },
  {
    to: "/effektbudsjett",
    labelKey: "nav.components",
    icon: "M11.42 15.17 17.25 21A2.652 2.652 0 0 0 21 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 1 1-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 0 0 4.486-6.336l-3.276 3.277a3.004 3.004 0 0 1-2.25-2.25l3.276-3.276a4.5 4.5 0 0 0-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085m-1.745 1.437L5.909 7.5H4.5L2.25 3.75l1.5-1.5L7.5 4.5v1.409l4.26 4.26m-1.745 1.437 1.745-1.437"
  },
  {
    to: "/analyse",
    labelKey: "nav.analysis",
    icon: "M3 3v18h18M7 14v3m4-6v6m4-8v8m4-10v10"
  },
  {
    to: "/siktlinje-radio",
    labelKey: "nav.radioLink",
    icon: "M4.9 16.1C1 12.2 1 5.8 4.9 1.9M7.8 4.7a6.14 6.14 0 0 0-.8 7.5M16.2 4.8c2 2 2.26 5.11.8 7.47M19.1 1.9a9.96 9.96 0 0 1 0 14.1M10 9a2 2 0 1 0 4 0 2 2 0 0 0-4 0ZM9.5 18h5M8 22l4-11 4 11"
  },
  {
    to: "/dokumentasjon",
    labelKey: "nav.documentation",
    icon: "M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15a2.25 2.25 0 0 1 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25ZM6.75 12h.008v.008H6.75V12Zm0 3h.008v.008H6.75V15Zm0 3h.008v.008H6.75V18Z"
  },
  {
    to: "/kontakt",
    labelKey: "nav.info",
    icon: "M11.25 11.25l.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z"
  },
  {
    to: "/api",
    labelKey: "nav.api",
    icon: "M17.25 6.75 22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3-4.5 16.5"
  }
];

const drawerFocusableSelector =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

function SideTab({ to, labelKey, icon, onClick }: { to: string; labelKey: TranslationKey; icon: string; onClick?: () => void }) {
  const { t } = useLanguage();
  return (
    <NavLink
      to={to}
      end={to === "/"}
      onClick={onClick}
      className={({ isActive }) =>
        `flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-sm font-medium transition sm:text-[0.98rem] ${
          isActive
            ? "border-brand-200 bg-brand-50 text-brand-700"
            : "border-transparent text-slate-950 hover:border-slate-200 hover:bg-slate-50"
        }`
      }
    >
      <SidebarIcon path={icon} />
      <span>{t(labelKey)}</span>
    </NavLink>
  );
}

function RouteFallback() {
  const { t } = useLanguage();
  return (
    <div className="flex min-h-full items-center justify-center p-8">
      <p className={workspaceBodyClassName}>{t("app.loading")}</p>
    </div>
  );
}

function LanguageToggle() {
  const { language, setLanguage } = useLanguage();
  return (
    <div className="flex items-center justify-center gap-2 px-2 py-2">
      <button
        type="button"
        onClick={() => setLanguage("nn")}
        className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
          language === "nn" ? "bg-brand-50 text-brand-700" : "text-slate-500 hover:text-slate-950"
        }`}
      >
        NO
      </button>
      <span className="text-xs text-slate-300">|</span>
      <button
        type="button"
        onClick={() => setLanguage("en")}
        className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
          language === "en" ? "bg-brand-50 text-brand-700" : "text-slate-500 hover:text-slate-950"
        }`}
      >
        EN
      </button>
    </div>
  );
}

function SidebarContent({ onNavigate, titleId }: { onNavigate?: () => void; titleId?: string }) {
  const { t } = useLanguage();
  const { activeDraft } = useConfigurationContext();
  const currentMode = activeDraft.engineMode ?? "standard";
  const visibleNavItems = navItems.filter((item) => !item.modes || item.modes.includes(currentMode));
  return (
    <>
      <div className="shrink-0 flex flex-col items-center py-3">
        <Link to="/" aria-label={t("app.goToWelcome")} className="flex w-full justify-center">
          <HydroGuideLogo />
        </Link>
        {titleId ? <p id={titleId} className="sr-only">HydroGuide</p> : null}
      </div>

      <div className="hide-scrollbar min-h-0 flex-1 overflow-y-auto">
        <nav className="mt-5 space-y-3">
          {visibleNavItems.map((item) => (
            <SideTab key={item.labelKey} to={item.to} labelKey={item.labelKey} icon={item.icon} onClick={onNavigate} />
          ))}
        </nav>
      </div>

      <div className="shrink-0">
        <LanguageToggle />
        <BuildInfoBadge />
      </div>
    </>
  );
}

export default function App() {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLElement>(null);
  const appShellRef = useRef<HTMLDivElement>(null);
  const { t } = useLanguage();
  const { activeDraft } = useConfigurationContext();
  const currentMode = activeDraft.engineMode ?? "standard";
  const calculatorMode = currentMode === "standard";

  useEffect(() => {
    if (!menuOpen) {
      document.body.style.overflow = "";
      return;
    }

    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, [menuOpen]);

  useEffect(() => {
    const appShell = appShellRef.current;
    if (!appShell) {
      return;
    }

    if (menuOpen) {
      appShell.setAttribute("inert", "");
    } else {
      appShell.removeAttribute("inert");
    }

    return () => {
      appShell.removeAttribute("inert");
    };
  }, [menuOpen]);

  useEffect(() => {
    if (!menuOpen) {
      return;
    }

    const drawer = drawerRef.current;
    closeButtonRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setMenuOpen(false);
        return;
      }

      if (event.key !== "Tab" || !drawer) {
        return;
      }

      const focusableElements = Array.from(drawer.querySelectorAll<HTMLElement>(drawerFocusableSelector)).filter(
        (element) => element.getClientRects().length > 0 && !element.hasAttribute("disabled")
      );

      if (focusableElements.length === 0) {
        event.preventDefault();
        drawer.focus();
        return;
      }

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];

      if (event.shiftKey && document.activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
      } else if (!event.shiftKey && document.activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      menuButtonRef.current?.focus();
    };
  }, [menuOpen]);

  return (
    <div className="min-h-screen bg-transparent">
      <ImportDropZone />

      {/* Mobile hamburger button */}
      <button
        ref={menuButtonRef}
        type="button"
        onClick={() => setMenuOpen(true)}
        className="fixed left-3 top-3 z-50 flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-white shadow-sm md:hidden"
        aria-label={t("app.openMenu")}
        aria-expanded={menuOpen}
        aria-controls="mobile-navigation-drawer"
        aria-haspopup="dialog"
      >
        <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5 stroke-slate-950" strokeWidth="2" aria-hidden="true">
          <path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {/* Mobile overlay */}
      {menuOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm md:hidden"
          aria-hidden="true"
          onClick={() => setMenuOpen(false)}
        />
      )}

      {/* Mobile slide-out drawer */}
      <aside
        ref={drawerRef}
        id="mobile-navigation-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="mobile-navigation-title"
        tabIndex={-1}
        className={`fixed inset-y-0 left-0 z-50 flex w-[min(18rem,calc(100vw-1.5rem))] flex-col rounded-r-3xl border-r border-slate-200 bg-white p-5 shadow-lg transition-transform duration-300 md:hidden ${
          menuOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <button
          ref={closeButtonRef}
          type="button"
          onClick={() => setMenuOpen(false)}
          className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full text-slate-950 hover:bg-slate-100"
          aria-label={t("app.closeMenu")}
        >
          <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5 stroke-current" strokeWidth="2" aria-hidden="true">
            <path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <SidebarContent onNavigate={() => setMenuOpen(false)} titleId="mobile-navigation-title" />
      </aside>

      <div
        ref={appShellRef}
        aria-hidden={menuOpen || undefined}
        className="mx-auto flex w-full flex-col gap-4 p-3 pt-16 md:flex-row md:gap-6 md:p-6"
      >
        {/* Desktop sidebar */}
        <aside className="hidden md:flex h-[calc(100vh-3rem)] w-64 shrink-0 flex-col rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <SidebarContent />
        </aside>

        <div className="hide-scrollbar isolate min-w-0 flex-1 overflow-x-hidden rounded-3xl border border-slate-200 bg-white shadow-sm min-h-[calc(100vh-5rem)] md:h-[calc(100vh-3rem)] md:overflow-y-auto">
          <Suspense fallback={<RouteFallback />}>
            <Routes>
              <Route path="/" element={<WelcomePage />} />
              <Route path="/oversikt" element={<OverviewPage />} />
              <Route path="/parametere" element={calculatorMode ? <Navigate to="/oversikt" replace /> : <MainPage />} />
              <Route path="/system" element={<SystemPage />} />
              <Route path="/effektbudsjett" element={<BudgetPage />} />
              <Route path="/analyse" element={<AnalysisPage />} />
              <Route path="/siktlinje-radio" element={<SiktlinjeRadioPage />} />
              <Route path="/dokumentasjon" element={<DocumentationPage />} />
              <Route path="/kontakt" element={<ContactPage />} />
              <Route path="/api" element={<ApiPage />} />
              <Route path="/anbefaling" element={<Navigate to="/analyse" replace />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </div>
      </div>
    </div>
  );
}
