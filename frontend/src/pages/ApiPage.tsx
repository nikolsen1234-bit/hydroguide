import { useEffect } from "react";

const API_DOCS_URL = "/api";
const RELOAD_GUARD_KEY = "hydroguide:api-docs-reload";

export default function ApiPage() {
  useEffect(() => {
    if (sessionStorage.getItem(RELOAD_GUARD_KEY) === "1") return;
    sessionStorage.setItem(RELOAD_GUARD_KEY, "1");
    window.location.replace(API_DOCS_URL);
  }, []);

  return (
    <main className="flex min-h-[24rem] items-center justify-center bg-white px-6 text-slate-900">
      <a className="text-sm font-medium text-sky-700 underline" href={API_DOCS_URL}>
        Opnar API-dokumentasjon
      </a>
    </main>
  );
}
