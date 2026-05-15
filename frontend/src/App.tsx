import { Component, Suspense, lazy, useEffect, useRef, useState, type ErrorInfo, type ReactNode } from "react";
import { Link, Navigate, NavLink, Route, Routes, useLocation } from "react-router-dom";
import BuildInfoBadge from "./components/BuildInfoBadge";
import HydroGuideLogo from "./components/HydroGuideLogo";
import ImportDropZone from "./components/ImportDropZone";
import { useConfigurationContext } from "./context/ConfigurationContext";
import { useLanguage } from "./i18n";
import type { TranslationKey } from "./i18n";
import { workspaceBodyClassName } from "./styles/workspace";

const ComponentsPage = lazy(() => import("./pages/ComponentsPage"));
const AnalysisPage = lazy(() => import("./pages/AnalysisPage"));
const ContactPage = lazy(() => import("./pages/ContactPage"));
const ApiPage = lazy(() => import("./pages/ApiPage"));
const DocumentationPage = lazy(() => import("./pages/DocumentationPage"));
const OverviewPage = lazy(() => import("./pages/OverviewPage"));
const WelcomePage = lazy(() => import("./pages/WelcomePage"));
const MainPage = lazy(() => import("./pages/MainPage"));
const RadioLinkPage = lazy(() => import("./pages/RadioLinkPage"));
const SystemPage = lazy(() => import("./pages/SystemPage"));

type ThemeMode = "light" | "dark";

type RouteErrorBoundaryProps = {
  children: ReactNode;
};

type RouteErrorBoundaryState = {
  hasError: boolean;
};

const THEME_STORAGE_KEY = "hydroguide:theme";

function getStoredTheme(): ThemeMode {
  try {
    return localStorage.getItem(THEME_STORAGE_KEY) === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

function SidebarIcon({ path }: { path: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4 stroke-current" strokeWidth="1.7" aria-hidden="true">
      <path d={path} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

type NavItem = { to: string; labelKey: TranslationKey; icon: string };

const navGroups: Array<{ label: string; items: NavItem[] }> = [
  {
    label: "Prosjekt",
    items: [
      {
        to: "/",
        labelKey: "nav.welcome",
        icon: "M3.75 9.75 12 3l8.25 6.75v9A2.25 2.25 0 0 1 18 21H6a2.25 2.25 0 0 1-2.25-2.25v-9Z"
      },
      {
        to: "/oversikt",
        labelKey: "nav.overview",
        icon: "M3.75 9 12 3l8.25 6L12 15 3.75 9Zm0 6L12 21l8.25-6"
      },
      {
        to: "/prosjektgrunnlag",
        labelKey: "nav.projectBasis",
        icon: "m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10"
      }
    ]
  },
  {
    label: "Teknisk",
    items: [
      {
        to: "/parametere",
        labelKey: "nav.technicalParameters",
        icon: "M10.5 6h9.75M10.5 6a1.5 1.5 0 1 1-3 0m3 0a1.5 1.5 0 1 0-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-9.75 0h9.75"
      },
      {
        to: "/komponenter",
        labelKey: "nav.components",
        icon: "M11.42 15.17 17.25 21A2.652 2.652 0 0 0 21 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 1 1-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 0 0 4.486-6.336l-3.276 3.277a3.004 3.004 0 0 1-2.25-2.25l3.276-3.276a4.5 4.5 0 0 0-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085m-1.745 1.437L5.909 7.5H4.5L2.25 3.75l1.5-1.5L7.5 4.5v1.409l4.26 4.26m-1.745 1.437 1.745-1.437"
      },
      {
        to: "/radiolinje",
        labelKey: "nav.radioLink",
        icon: "M4.9 16.1C1 12.2 1 5.8 4.9 1.9M7.8 4.7a6.14 6.14 0 0 0-.8 7.5M16.2 4.8c2 2 2.26 5.11.8 7.47M19.1 1.9a9.96 9.96 0 0 1 0 14.1M10 9a2 2 0 1 0 4 0 2 2 0 0 0-4 0ZM9.5 18h5M8 22l4-11 4 11"
      },
      {
        to: "/analyse",
        labelKey: "nav.analysis",
        icon: "M3 3v18h18M7 14v3m4-6v6m4-8v8m4-10v10"
      }
    ]
  },
  {
    label: "Om",
    items: [
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
    ]
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
        `flex min-h-[44px] items-center gap-2.5 rounded-lg border-l-2 px-3 text-[length:var(--hg-type-content-size)] font-[var(--hg-type-weight-semibold)] transition md:min-h-9 ${
          isActive
            ? "border-[var(--hg-accent-2)] bg-white/[0.08] text-[var(--hg-rail-ink-active)]"
            : "border-transparent text-[var(--hg-rail-ink)] hover:bg-white/5 hover:text-[var(--hg-rail-ink-active)]"
        }`
      }
    >
      <span className="flex h-4 w-4 shrink-0 items-center justify-center">
        <SidebarIcon path={icon} />
      </span>
      <span className="min-w-0 truncate">{t(labelKey)}</span>
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

class RouteErrorBoundary extends Component<RouteErrorBoundaryProps, RouteErrorBoundaryState> {
  state: RouteErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error("Route render failed", error, info);
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div className="flex min-h-full flex-col items-center justify-center gap-4 p-8 text-center">
        <p className={workspaceBodyClassName}>Noe gikk galt ved lasting av siden.</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="rounded-md border border-[var(--hg-hairline)] bg-[var(--hg-surface)] px-4 py-2 text-[length:var(--hg-type-control-size)] font-[var(--hg-type-weight-bold)] text-[var(--hg-ink)] hover:border-[var(--hg-accent)]"
        >
          Last inn på nytt
        </button>
      </div>
    );
  }
}

function ThemeToggle({ theme, setTheme }: { theme: ThemeMode; setTheme: (theme: ThemeMode) => void }) {
  return (
    <div className="hg-theme-toggle grid min-h-[44px] grid-cols-2 gap-1 rounded-lg border border-[var(--hg-hairline)] p-1">
      {(["light", "dark"] as const).map((mode) => (
        <button
          key={mode}
          type="button"
          aria-pressed={theme === mode}
          onClick={() => setTheme(mode)}
          className={`rounded-md px-2 text-[length:var(--hg-type-meta-size)] font-[var(--hg-type-weight-bold)] uppercase tracking-[var(--hg-type-overline-tracking)] transition ${
            theme === mode ? "bg-[var(--hg-accent-soft)] text-[var(--hg-accent)]" : "text-[var(--hg-rail-ink)] hover:text-[var(--hg-rail-ink-active)]"
          }`}
        >
          {mode === "light" ? "Lys" : "Mørk"}
        </button>
      ))}
    </div>
  );
}

function SidebarContent({
  onNavigate,
  titleId,
  theme,
  setTheme
}: {
  onNavigate?: () => void;
  titleId?: string;
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
}) {
  const { t } = useLanguage();
  const { activeDraft, updateConfigurationName } = useConfigurationContext();
  const isCalculatorMode = (activeDraft.engineMode ?? "calculator") === "calculator";
  const [editingName, setEditingName] = useState(false);
  const [draftName, setDraftName] = useState(activeDraft.name);
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editingName) {
      setDraftName(activeDraft.name);
    }
  }, [activeDraft.name, editingName]);

  useEffect(() => {
    if (editingName) {
      nameInputRef.current?.focus();
      nameInputRef.current?.select();
    }
  }, [editingName]);

  const commitName = () => {
    updateConfigurationName(draftName.trim());
    setEditingName(false);
  };
  const cancelName = () => {
    setDraftName(activeDraft.name);
    setEditingName(false);
  };

  return (
    <>
      <div className="shrink-0">
        <div className="relative flex h-7 items-center">
          <Link to="/" aria-label={t("app.goToWelcome")} className="block min-h-[44px] min-w-0 flex-1 px-1 md:h-7 md:min-h-0">
            <HydroGuideLogo
              variant="white"
              className="absolute left-1 top-1/2 h-14 w-auto max-w-none -translate-y-1/2 origin-[left_center] object-contain object-left"
            />
          </Link>
        </div>
        {titleId ? <p id={titleId} className="sr-only">HydroGuide</p> : null}
        <div className="mt-5 h-px bg-[#1a2438]" />
      </div>

      <div className="h-[52px] shrink-0 rounded-lg border border-[#1f2c45] bg-[#10192b] px-3 py-2">
        <p className="truncate text-[length:var(--hg-type-ui-size)] font-[var(--hg-type-weight-bold)] text-white">
          {t("overview.projectName")}
        </p>
        {editingName ? (
          <input
            ref={nameInputRef}
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            onBlur={commitName}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commitName();
              } else if (e.key === "Escape") {
                e.preventDefault();
                cancelName();
              }
            }}
            placeholder={t("shared.unnamed")}
            className="hg-mono mt-1 block w-full truncate border-0 bg-transparent p-0 text-[length:var(--hg-type-meta-size)] text-[#e3e7ef] outline-none placeholder:text-[#7e8ca6] focus:text-white"
          />
        ) : (
          <button
            type="button"
            onClick={() => {
              setDraftName(activeDraft.name);
              setEditingName(true);
            }}
            className="hg-mono mt-1 block w-full cursor-text truncate border-0 bg-transparent p-0 text-left text-[length:var(--hg-type-meta-size)] text-[#7e8ca6] outline-none transition-colors hover:text-[#e3e7ef] focus:text-white"
            title="Klikk for å endre prosjektnavn"
          >
            {activeDraft.name.trim() || t("shared.unnamed")}
          </button>
        )}
      </div>

      <div className="hide-scrollbar min-h-0 flex-1 overflow-y-auto">
        <nav className="space-y-4">
          {navGroups.map((group) => (
            <div key={group.label}>
              <p className="hg-mono px-1 pb-2 text-[length:var(--hg-type-overline-size)] font-[var(--hg-type-weight-semibold)] uppercase tracking-[var(--hg-type-panel-label-tracking)] text-[#7d8aa3]">
                {group.label}
              </p>
              <div className="space-y-1">
                {group.items
                  .filter((item) => !(isCalculatorMode && item.to === "/prosjektgrunnlag"))
                  .map((item) => (
                    <SideTab key={item.labelKey} to={item.to} labelKey={item.labelKey} icon={item.icon} onClick={onNavigate} />
                  ))}
              </div>
            </div>
          ))}
        </nav>
      </div>

      <div className="min-h-[134px] shrink-0 space-y-3">
        <ThemeToggle theme={theme} setTheme={setTheme} />
        <BuildInfoBadge />
      </div>
    </>
  );
}

export default function App() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [theme, setThemeState] = useState<ThemeMode>(() => getStoredTheme());
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLElement>(null);
  const appShellRef = useRef<HTMLDivElement>(null);
  const { t } = useLanguage();
  const { activeDraft } = useConfigurationContext();
  const location = useLocation();
  const isCalculatorMode = (activeDraft.engineMode ?? "calculator") === "calculator";
  const cleanRenderMode = new URLSearchParams(location.search).has("cleanSolarChart");

  const setTheme = (nextTheme: ThemeMode) => {
    setThemeState(nextTheme);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
    } catch {}
  };

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

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

  const routeContent = (
    <RouteErrorBoundary key={location.pathname}>
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/" element={<WelcomePage />} />
          <Route path="/oversikt" element={<OverviewPage />} />
          <Route path="/prosjektgrunnlag" element={isCalculatorMode ? <Navigate to="/oversikt" replace /> : <MainPage />} />
          <Route path="/parametere" element={<SystemPage />} />
          <Route path="/komponenter" element={<ComponentsPage />} />
          <Route path="/analyse" element={<AnalysisPage />} />
          <Route path="/radiolinje" element={<RadioLinkPage />} />
          <Route path="/dokumentasjon" element={<DocumentationPage />} />
          <Route path="/kontakt" element={<ContactPage />} />
          <Route path="/api" element={<ApiPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </RouteErrorBoundary>
  );

  if (cleanRenderMode) {
    return (
      <div className="hg-app-shell" data-theme={theme}>
        <div className="min-h-screen bg-[var(--hg-bg)] text-[var(--hg-ink)]">
          {routeContent}
        </div>
      </div>
    );
  }

  return (
    <div className="hg-app-shell" data-theme={theme}>
      <ImportDropZone />

      <header className="fixed inset-x-0 top-0 z-40 grid h-14 grid-cols-[3.5rem_minmax(0,1fr)_3.5rem] items-center border-b border-[var(--hg-hairline)] bg-[var(--hg-surface)] md:hidden">
        <button
          ref={menuButtonRef}
          type="button"
          onClick={() => setMenuOpen(true)}
          className="flex h-14 w-14 items-center justify-center text-[var(--hg-ink)] transition hover:bg-[var(--hg-surface-2)]"
          aria-label={t("app.openMenu")}
          aria-expanded={menuOpen}
          aria-controls="mobile-navigation-drawer"
          aria-haspopup="dialog"
        >
          <svg viewBox="0 0 24 24" fill="none" className="h-8 w-8 stroke-current" strokeWidth="1.75" aria-hidden="true">
            <path d="M3.5 7h17M3.5 12h17M3.5 17h17" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        <Link to="/" aria-label={t("app.goToWelcome")} className="mx-auto flex h-14 w-32 items-center justify-center">
          <HydroGuideLogo variant={theme === "dark" ? "white" : "black"} className="max-h-8 object-contain object-center" />
        </Link>

        <div aria-hidden="true" />
      </header>

      {menuOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/45 backdrop-blur-sm md:hidden"
          aria-hidden="true"
          onClick={() => setMenuOpen(false)}
        />
      )}

      {menuOpen && (
        <aside
          ref={drawerRef}
          id="mobile-navigation-drawer"
          role="dialog"
          aria-modal="true"
          aria-labelledby="mobile-navigation-title"
          tabIndex={-1}
          className="hg-rail fixed inset-y-0 left-0 z-50 flex w-[min(18rem,calc(100vw-1.5rem))] translate-x-0 flex-col gap-[18px] border-r border-[#1f2738] px-4 py-5 transition-transform duration-300 md:hidden"
        >
          <button
            ref={closeButtonRef}
            type="button"
            onClick={() => setMenuOpen(false)}
            className="absolute right-3 top-3 flex h-11 w-11 items-center justify-center rounded-full text-white hover:bg-white/10 md:h-9 md:w-9"
            aria-label={t("app.closeMenu")}
          >
            <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5 stroke-current" strokeWidth="2" aria-hidden="true">
              <path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <SidebarContent onNavigate={() => setMenuOpen(false)} titleId="mobile-navigation-title" theme={theme} setTheme={setTheme} />
        </aside>
      )}

      <div ref={appShellRef} aria-hidden={menuOpen || undefined} className="grid min-h-screen grid-cols-1 md:h-screen md:grid-cols-[232px_minmax(0,1fr)]">
        <aside className="hg-rail hidden h-screen flex-col gap-[18px] border-r border-[#1f2738] px-4 py-5 md:flex">
          <SidebarContent theme={theme} setTheme={setTheme} />
        </aside>

        <div className="min-w-0 pt-14 md:h-screen md:pt-0">
          <div className="hg-workspace-frame hide-scrollbar min-h-[calc(100vh-3.5rem)] overflow-x-hidden md:h-screen md:overflow-y-auto">
            {routeContent}
          </div>
        </div>
      </div>
    </div>
  );
}
