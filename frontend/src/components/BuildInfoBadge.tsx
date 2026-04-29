import { useEffect, useState } from "react";
import fallbackBuildInfo from "../generated/build-info.json";
import { useLanguage } from "../i18n";
import { workspaceBodyMutedClassName, workspaceMetaMutedClassName } from "../styles/workspace";

type BuildInfo = {
  updatedAt?: string | null;
};

function formatBuildTimestamp(value: string | null | undefined) {
  if (!value) {
    return "-";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("nb-NO", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(parsed);
}

export default function BuildInfoBadge() {
  const { t } = useLanguage();
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
    <div className="mt-6 px-3 pb-2 pt-6 text-center">
      <p className={workspaceMetaMutedClassName}>{t("shared.lastUpdated")}</p>
      <p className={`mt-1 ${workspaceBodyMutedClassName}`}>{formatBuildTimestamp(buildInfo.updatedAt)}</p>
    </div>
  );
}
