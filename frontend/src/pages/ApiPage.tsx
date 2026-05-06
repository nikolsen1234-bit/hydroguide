import { useEffect } from "react";

const API_DOCS_URL = "/api/docs?ui";

export default function ApiPage() {
  useEffect(() => {
    window.location.replace(API_DOCS_URL);
  }, []);

  return (
    <main className="flex min-h-[calc(100vh-5rem)] items-center justify-center bg-white p-6">
      <a className="text-sm font-semibold text-brand-700 underline-offset-4 hover:underline" href={API_DOCS_URL}>
        Open API documentation
      </a>
    </main>
  );
}
