import type { BackupSourceName, PlantConfiguration, SecondarySourceKey } from "../types";

export function isSecondarySourceKey(value: unknown): value is SecondarySourceKey {
  return value === "fuelCell" || value === "diesel";
}

export function resolveSecondarySources(configuration: PlantConfiguration): SecondarySourceKey[] {
  const sources = configuration.systemParameters.secondarySourceOptions.filter(isSecondarySourceKey);
  return sources.length > 0 ? sources : [configuration.systemParameters.selectedSecondarySource];
}

const BACKUP_SOURCE_LABELS: Record<BackupSourceName, string> = {
  FuelCell: "Brenselcelle",
  DieselGenerator: "Dieselaggregat"
};

export function backupSourceLabel(
  source: BackupSourceName | "NotComputed" | string | undefined,
  fallback = ""
): string {
  if (source === "FuelCell" || source === "DieselGenerator") {
    return BACKUP_SOURCE_LABELS[source];
  }
  return fallback;
}
