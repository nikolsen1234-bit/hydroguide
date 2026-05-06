import { useEffect } from "react";

const API_DOCS_URL = "/api/docs?ui";

export default function ApiPage() {
  useEffect(() => {
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
