import { useEffect, useState } from "react";
import fallbackBuildInfo from "../generated/build-info.json";

type BuildInfo = {
  updatedAt?: string | null;
  siteTraceId?: string | null;
};

export default function BuildInfoBadge() {
  const [buildInfo, setBuildInfo] = useState<BuildInfo>(fallbackBuildInfo);

  useEffect(() => {
    let cancelled = false;

    const loadBuildInfo = async () => {
      try {
        const response = await fetch(`/build-info.json?ts=${Date.now()}`, { cache: "no-store" });
        const payload = (await response.json().catch(() => null)) as BuildInfo | null;
        if (!payload || cancelled) {
          return;
        }

        setBuildInfo(payload);
      } catch {
        // Keep the build-time fallback when runtime metadata cannot be read.
      }
    };

    void loadBuildInfo();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="flex h-[74px] flex-col justify-end px-3 pb-2 text-center">
      <p className="hg-mono min-h-[1rem] text-[length:var(--hg-type-meta-size)] font-[var(--hg-type-weight-semibold)] uppercase tracking-[var(--hg-type-overline-tracking)] text-[var(--hg-rail-ink)]">
        {buildInfo.siteTraceId ? `Ver: ${buildInfo.siteTraceId}` : ""}
      </p>
    </div>
  );
}
