import {
  ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState
} from "react";
import {
  IMPORT_FILE_EXTENSION,
  IMPORT_FILE_MAX_BYTES,
  MAX_CONFIGURATION_EQUIPMENT_ROWS,
  STORAGE_KEYS
} from "../constants";
import {
  Answers,
  BackupSourceConfiguration,
  BatteryConfiguration,
  EquipmentBudgetSettings,
  EquipmentRow,
  MonthlySolarRadiation,
  NvePlantDetails,
  OtherParameters,
  PlantConfiguration,
  RadioLinkConfiguration,
  RadioLinkEndpointConfiguration,
  SolarConfiguration,
  SystemParameters
} from "../types";
import {
  cloneConfiguration,
  createBlankConfiguration,
  createResetConfiguration,
  makeId,
  normalizeConfiguration,
  nowIso
} from "../utils/configuration";
import { formatLocationLabel } from "../utils/format";
import { calculateConfigurationOutputs } from "../utils/systemResults";

type ConfigSectionFieldMap = {
  systemParameters: SystemParameters;
  solar: SolarConfiguration;
  battery: BatteryConfiguration;
  fuelCell: BackupSourceConfiguration;
  diesel: BackupSourceConfiguration;
  other: OtherParameters;
  monthlySolarRadiation: MonthlySolarRadiation;
  equipmentBudgetSettings: EquipmentBudgetSettings;
  radioLink: RadioLinkConfiguration;
};

interface ConfigurationContextValue {
  configurations: PlantConfiguration[];
  activeDraft: PlantConfiguration;
  baselineDraft: PlantConfiguration;
  hasUnsavedChanges: boolean;
  createNewConfiguration: () => void;
  selectConfiguration: (id: string) => void;
  updateConfigurationName: (name: string) => void;
  updateConfigurationLocation: (
    location: string,
    metadata?: { placeId?: string | null; lat?: number | null; lng?: number | null; plantDetails?: NvePlantDetails | null }
  ) => void;
  updateAnswer: (key: keyof Answers, value: Answers[keyof Answers]) => void;
  updateConfigSectionField: <
    S extends keyof ConfigSectionFieldMap,
    K extends keyof ConfigSectionFieldMap[S]
  >(
    section: S,
    key: K,
    value: ConfigSectionFieldMap[S][K]
  ) => void;
  updateEquipmentRow: <K extends keyof EquipmentRow>(id: string, key: K, value: EquipmentRow[K]) => void;
  updateRadioLinkEndpoint: (
    point: "pointA" | "pointB",
    patch: Partial<RadioLinkEndpointConfiguration>
  ) => void;
  addEquipmentRow: () => void;
  removeEquipmentRow: (id: string) => void;
  updateConfigField: <K extends keyof PlantConfiguration>(key: K, value: PlantConfiguration[K]) => void;
  updateCachedRadioAnalysis: (analysis: unknown | null) => void;
  resetDraft: () => void;
  saveDraftMetadata: () => void;
  saveDraft: () => void;
  exportConfiguration: () => void;
  importConfiguration: (file: File) => Promise<boolean>;
}

const ConfigurationContext = createContext<ConfigurationContextValue | undefined>(undefined);

function validateImportFile(file: File) {
  const fileName = file.name.trim().toLowerCase();
  if (!fileName.endsWith(IMPORT_FILE_EXTENSION)) {
    throw new Error(`Bare ${IMPORT_FILE_EXTENSION}-filer kan importeres.`);
  }

  if (file.size > IMPORT_FILE_MAX_BYTES) {
    throw new Error(`Importfilen er for stor. Maks størrelse er ${Math.floor(IMPORT_FILE_MAX_BYTES / 1024)} KB.`);
  }
}

function clearStoredConfigurationState() {
  for (const storageName of ["sessionStorage", "localStorage"] as const) {
    try {
      const storage = window[storageName];
      storage.removeItem(STORAGE_KEYS.CONFIGS);
      storage.removeItem(STORAGE_KEYS.ACTIVE_ID);
    } catch {}
  }
}

function stripEmptyValues<T extends object>(obj: T): Partial<T> {
  const cleaned: Partial<T> = {};

  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    if (value !== "" && value !== null) {
      (cleaned as Record<string, unknown>)[key] = value;
    }
  }

  return cleaned;
}

function upsertConfigurationList(configurations: PlantConfiguration[], configuration: PlantConfiguration) {
  const exists = configurations.some((cfg) => cfg.id === configuration.id);
  return exists
    ? configurations.map((cfg) => (cfg.id === configuration.id ? configuration : cfg))
    : [configuration, ...configurations];
}

function createExportPayload(configuration: PlantConfiguration) {
  const includeAnswers = (configuration.engineMode ?? "calculator") !== "calculator";

  return {
    engineMode: configuration.engineMode,
    name: configuration.name,
    location: configuration.location,
    ...(configuration.locationPlaceId ? { locationPlaceId: configuration.locationPlaceId } : {}),
    ...(configuration.locationLat !== null ? { locationLat: configuration.locationLat } : {}),
    ...(configuration.locationLng !== null ? { locationLng: configuration.locationLng } : {}),
    ...(configuration.nvePlantDetails ? { nvePlantDetails: configuration.nvePlantDetails } : {}),
    ...(includeAnswers ? { answers: stripEmptyValues(configuration.answers) } : {}),
    systemParameters: stripEmptyValues(configuration.systemParameters),
    solar: stripEmptyValues(configuration.solar),
    battery: stripEmptyValues(configuration.battery),
    fuelCell: stripEmptyValues(configuration.fuelCell),
    diesel: stripEmptyValues(configuration.diesel),
    other: stripEmptyValues(configuration.other),
    monthlySolarRadiation: stripEmptyValues(configuration.monthlySolarRadiation),
    equipmentBudgetSettings: configuration.equipmentBudgetSettings,
    radioLink: {
      pointA: stripEmptyValues(configuration.radioLink.pointA),
      pointB: stripEmptyValues(configuration.radioLink.pointB),
      frequencyMHz: configuration.radioLink.frequencyMHz,
      fresnelFactor: configuration.radioLink.fresnelFactor,
      kFactor: configuration.radioLink.kFactor,
      polarization: configuration.radioLink.polarization,
      rainFactor: configuration.radioLink.rainFactor,
      txPowerDbm: configuration.radioLink.txPowerDbm,
      rxSensitivityDbm: configuration.radioLink.rxSensitivityDbm,
      lineLossDb: configuration.radioLink.lineLossDb
    },
    equipmentRows: configuration.equipmentRows
        .filter((row) => row.name.trim() || row.powerW !== "" || row.runtimeHoursPerDay !== "" || row.purchaseCost !== "" || row.lifetimeYears !== "" || row.annualMaintenance !== "" || row.supplier.trim() || row.comment.trim())
        .map((row) => ({
          id: row.id,
          active: row.active,
          name: row.name,
          powerW: row.powerW,
          runtimeHoursPerDay: row.runtimeHoursPerDay,
          purchaseCost: row.purchaseCost,
          lifetimeYears: row.lifetimeYears,
          annualMaintenance: row.annualMaintenance,
          supplier: row.supplier,
          comment: row.comment
        }))
  };
}

function downloadExport(name: string, content: string) {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const safeName = name.trim().replace(/[^a-zA-Z0-9 _-]/g, "") || "konfigurasjon";

  link.href = url;
  link.download = `${safeName}.txt`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function toImportedPartialConfiguration(raw: Record<string, unknown>): Partial<PlantConfiguration> {
  return {
    engineMode:
      raw.engineMode === "hydroguide"
        ? "hydroguide"
        : raw.engineMode === "calculator"
          ? "calculator"
          : undefined,
    name: raw.name as string | undefined,
    location: raw.location as string | undefined,
    locationPlaceId: typeof raw.locationPlaceId === "string" ? raw.locationPlaceId : null,
    locationLat: typeof raw.locationLat === "number" ? raw.locationLat : null,
    locationLng: typeof raw.locationLng === "number" ? raw.locationLng : null,
    nvePlantDetails: raw.nvePlantDetails as PlantConfiguration["nvePlantDetails"] | undefined,
    answers: raw.answers as Partial<PlantConfiguration["answers"]> | undefined,
    systemParameters: raw.systemParameters as Partial<PlantConfiguration["systemParameters"]> | undefined,
    solar: raw.solar as Partial<PlantConfiguration["solar"]> | undefined,
    battery: raw.battery as Partial<PlantConfiguration["battery"]> | undefined,
    fuelCell: raw.fuelCell as Partial<PlantConfiguration["fuelCell"]> | undefined,
    diesel: raw.diesel as Partial<PlantConfiguration["diesel"]> | undefined,
    other: raw.other as Partial<PlantConfiguration["other"]> | undefined,
    monthlySolarRadiation: raw.monthlySolarRadiation as Partial<PlantConfiguration["monthlySolarRadiation"]> | undefined,
    equipmentBudgetSettings: raw.equipmentBudgetSettings as Partial<PlantConfiguration["equipmentBudgetSettings"]> | undefined,
    radioLink: raw.radioLink as Partial<PlantConfiguration["radioLink"]> | undefined,
    equipmentRows: raw.equipmentRows as PlantConfiguration["equipmentRows"] | undefined
  } as Partial<PlantConfiguration>;
}

export function ConfigurationProvider({ children }: { children: ReactNode }) {
  const initialDraftRef = useRef<PlantConfiguration | null>(null);
  if (!initialDraftRef.current) {
    initialDraftRef.current = createBlankConfiguration(1);
  }

  const initialDraft = initialDraftRef.current;
  const [configurations, setConfigurations] = useState<PlantConfiguration[]>([]);
  const [activeDraft, setActiveDraft] = useState<PlantConfiguration>(initialDraft);
  const [baselineDraft, setBaselineDraft] = useState<PlantConfiguration>(() => cloneConfiguration(initialDraft));

  useEffect(() => {
    clearStoredConfigurationState();
  }, []);

  const hasUnsavedChanges = JSON.stringify(activeDraft) !== JSON.stringify(baselineDraft);

  const activateConfiguration = useCallback((configuration: PlantConfiguration) => {
    const draft = cloneConfiguration(configuration);
    setActiveDraft(draft);
    setBaselineDraft(cloneConfiguration(draft));
  }, []);

  const commitConfiguration = useCallback(
    (configuration: PlantConfiguration) => {
      setConfigurations((prev) => upsertConfigurationList(prev, configuration));
      activateConfiguration(configuration);
    },
    [activateConfiguration]
  );

  const createNewConfiguration = useCallback(() => {
    commitConfiguration(createBlankConfiguration(configurations.length + 1));
  }, [commitConfiguration, configurations.length]);

  const selectConfiguration = useCallback(
    (id: string) => {
      const selected = configurations.find((cfg) => cfg.id === id);
      if (selected) {
        activateConfiguration(selected);
      }
    },
    [activateConfiguration, configurations]
  );

  const updateConfigurationName = useCallback((name: string) => {
    setActiveDraft((prev) => ({ ...prev, name }));
  }, []);

  const updateConfigurationLocation = useCallback(
    (location: string, metadata?: { placeId?: string | null; lat?: number | null; lng?: number | null; plantDetails?: NvePlantDetails | null }) => {
      const formattedLocation = formatLocationLabel(location);
      setActiveDraft((prev) => ({
        ...prev,
        location: formattedLocation,
        locationPlaceId: metadata?.placeId ?? null,
        locationLat: metadata?.lat ?? null,
        locationLng: metadata?.lng ?? null,
        nvePlantDetails: metadata && "plantDetails" in metadata ? metadata.plantDetails ?? null : prev.nvePlantDetails
      }));
    },
    []
  );

  const updateAnswer = useCallback((key: keyof Answers, value: Answers[keyof Answers]) => {
    setActiveDraft((prev) => ({
      ...prev,
      answers: {
        ...prev.answers,
        [key]: value
      }
    }));
  }, []);

  const updateConfigSectionField = useCallback(
    function updateConfigSectionField<S extends keyof ConfigSectionFieldMap, K extends keyof ConfigSectionFieldMap[S]>(
      section: S,
      key: K,
      value: ConfigSectionFieldMap[S][K]
    ) {
      setActiveDraft((prev) => ({
        ...prev,
        [section]: {
          ...prev[section],
          [key]: value
        }
      }));
    },
    []
  );

  const updateConfigField = useCallback(
    function updateConfigField<K extends keyof PlantConfiguration>(key: K, value: PlantConfiguration[K]) {
      setActiveDraft((prev) => ({ ...prev, [key]: value }));
    },
    []
  );

  const updateEquipmentRow = useCallback(
    function updateEquipmentRow<K extends keyof EquipmentRow>(id: string, key: K, value: EquipmentRow[K]) {
      setActiveDraft((prev) => ({
        ...prev,
        equipmentRows: prev.equipmentRows.map((row) => (row.id === id ? { ...row, [key]: value } : row))
      }));
    },
    []
  );

  const updateRadioLinkEndpoint = useCallback(
    (point: "pointA" | "pointB", patch: Partial<RadioLinkEndpointConfiguration>) => {
      setActiveDraft((prev) => ({
        ...prev,
        radioLink: {
          ...prev.radioLink,
          [point]: {
            ...prev.radioLink[point],
            ...patch
          }
        }
      }));
    },
    []
  );

  const updateCachedRadioAnalysis = useCallback(
    (analysis: unknown | null) => {
      setActiveDraft((prev) => ({ ...prev, cachedRadioAnalysis: analysis }));
    },
    []
  );

  const addEquipmentRow = useCallback(() => {
    setActiveDraft((prev) => ({
      ...prev,
      equipmentRows: [
        ...prev.equipmentRows,
          {
            id: makeId("eq"),
            active: true,
            name: "",
            powerW: "",
            runtimeHoursPerDay: "",
            purchaseCost: "",
            lifetimeYears: "",
            annualMaintenance: "",
            supplier: "",
            comment: ""
          }
        ]
      }));
  }, []);

  const removeEquipmentRow = useCallback((id: string) => {
    setActiveDraft((prev) => ({
      ...prev,
      equipmentRows: prev.equipmentRows.filter((row) => row.id !== id)
    }));
  }, []);

  const resetDraft = useCallback(() => {
    commitConfiguration(createResetConfiguration(activeDraft));
  }, [activeDraft, commitConfiguration]);

  const saveDraftMetadata = useCallback(() => {
    commitConfiguration({
      ...activeDraft,
      updatedAt: nowIso()
    });
  }, [activeDraft, commitConfiguration]);

  const saveDraft = useCallback(() => {
    const savedDraft = {
      ...activeDraft,
      updatedAt: nowIso()
    };
    const outputs = calculateConfigurationOutputs(savedDraft);

    commitConfiguration({
      ...savedDraft,
      lastRecommendation: outputs.recommendation,
      derivedResults: outputs.derivedResults
    });
  }, [activeDraft, commitConfiguration]);

  const exportConfiguration = useCallback(() => {
    const payload = JSON.stringify(createExportPayload(activeDraft), null, 2);
    downloadExport(activeDraft.name, payload);
  }, [activeDraft]);

  const importConfiguration = useCallback(
    async (file: File) => {
      validateImportFile(file);

      const text = await file.text();
      const parsed = JSON.parse(text) as unknown;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("Importfilen må inneholde et gyldig konfigurasjonsobjekt.");
      }

      const raw = parsed as Record<string, unknown>;
      const importedEquipmentRows = Array.isArray(raw.equipmentRows) ? raw.equipmentRows : null;

      if (importedEquipmentRows && importedEquipmentRows.length > MAX_CONFIGURATION_EQUIPMENT_ROWS) {
        throw new Error(`Importfilen inneholder for mange utstyrsrader. Maks er ${MAX_CONFIGURATION_EQUIPMENT_ROWS}.`);
      }

      const imported = normalizeConfiguration(
        {
          ...toImportedPartialConfiguration(raw),
          id: makeId(),
          createdAt: nowIso(),
          updatedAt: nowIso()
        },
        configurations.length
      );

      commitConfiguration(imported);
      return true;
    },
    [commitConfiguration, configurations.length]
  );

  const value: ConfigurationContextValue = {
    configurations,
    activeDraft,
    baselineDraft,
    hasUnsavedChanges,
    createNewConfiguration,
    selectConfiguration,
    updateConfigurationName,
    updateConfigurationLocation,
    updateAnswer,
    updateConfigSectionField,
    updateConfigField,
    updateEquipmentRow,
    updateRadioLinkEndpoint,
    updateCachedRadioAnalysis,
    addEquipmentRow,
    removeEquipmentRow,
    resetDraft,
    saveDraftMetadata,
    saveDraft,
    exportConfiguration,
    importConfiguration
  };

  return <ConfigurationContext.Provider value={value}>{children}</ConfigurationContext.Provider>;
}

export function useConfigurationContext(): ConfigurationContextValue {
  const ctx = useContext(ConfigurationContext);
  if (!ctx) {
    throw new Error("useConfigurationContext må brukes inne i ConfigurationProvider");
  }

  return ctx;
}
