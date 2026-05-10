import { useEffect, useRef, useState } from "react";
import WorkspaceHeader from "../components/WorkspaceHeader";
import { workspaceBodyMutedClassName, workspacePageClassName } from "../styles/workspace";

const API_SPEC_URL = "/api/openapi";
const SWAGGER_CSS_URL = "https://unpkg.com/swagger-ui-dist@5.18.2/swagger-ui.css";
const SWAGGER_JS_URL = "https://unpkg.com/swagger-ui-dist@5.18.2/swagger-ui-bundle.js";

declare global {
  interface Window {
    SwaggerUIBundle?: (options: Record<string, unknown>) => unknown;
  }
}

function loadSwaggerAssets() {
  if (!document.querySelector(`link[href="${SWAGGER_CSS_URL}"]`)) {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = SWAGGER_CSS_URL;
    document.head.appendChild(link);
  }

  if (window.SwaggerUIBundle) return Promise.resolve();

  return new Promise<void>((resolve, reject) => {
    const existingScript = document.querySelector<HTMLScriptElement>(`script[src="${SWAGGER_JS_URL}"]`);
    if (existingScript) {
      existingScript.addEventListener("load", () => resolve(), { once: true });
      existingScript.addEventListener("error", () => reject(new Error("Swagger UI kunne ikke lastes.")), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = SWAGGER_JS_URL;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Swagger UI kunne ikke lastes."));
    document.body.appendChild(script);
  });
}

export default function ApiPage() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    loadSwaggerAssets()
      .then(() => {
        if (cancelled || !containerRef.current || !window.SwaggerUIBundle) return;
        containerRef.current.innerHTML = "";
        window.SwaggerUIBundle({
          url: API_SPEC_URL,
          domNode: containerRef.current,
          deepLinking: true,
          docExpansion: "list",
          defaultModelRendering: "model",
          defaultModelExpandDepth: 3,
          defaultModelsExpandDepth: 2
        });
      })
      .catch((loadError: Error) => {
        if (!cancelled) setError(loadError.message);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className={workspacePageClassName}>
      <WorkspaceHeader title="API" />
      {error ? (
        <div className="hg-card flex min-h-[24rem] items-center justify-center px-6 text-sm font-medium text-red-700">
          {error}
        </div>
      ) : null}
      <section className="hg-card overflow-hidden">
        <div className="border-b border-[var(--hg-hairline-2)] px-4 py-3">
          <p className={workspaceBodyMutedClassName}>OpenAPI-spesifikasjon for HydroGuide-endepunkter.</p>
        </div>
        <div className="api-light-island overflow-x-auto">
          <div ref={containerRef} className="api-docs min-h-full min-w-0 px-3 py-2 md:min-w-[760px] md:px-6 md:py-4" />
        </div>
      </section>
    </main>
  );
}
