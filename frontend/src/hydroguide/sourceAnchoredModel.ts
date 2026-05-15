export type SourceUse =
  | "requirement"
  | "recommendation"
  | "accepted_method"
  | "warning"
  | "documentation_requirement"
  | "operation_requirement"
  | "context"
  | "implicit_obligation";

export type SourceScope = SourceUse;

export type EvidenceStatus =
  | "documented_satisfies_source_criterion"
  | "documented_does_not_satisfy_source_criterion"
  | "not_documented_yet";

export type HydroGuideAnswerValue = string | number | string[] | "";
export type HydroGuideAnswers = Record<string, HydroGuideAnswerValue>;

export interface NveSourceEntry {
  id: string;
  documentTitle: string;
  year: 2020 | 2024;
  section: string;
  sectionTitle: string;
  sourceType: "NVE veileder" | "NVE retningslinje";
  shortParaphrase: string;
  normativeUse: string;
  notes: string;
}

export interface NveSourceRef {
  id: string;
  documentTitle: string;
  year: 2020 | 2024;
  section: string;
  sectionTitle: string;
  use: SourceUse;
  shortParaphrase: string;
}

export interface HydroGuideAnswerOption {
  id: string;
  label: string;
  sourceRefs: string[];
  semanticMeaning: string;
  isAppOperationalization: boolean;
}

export interface HydroGuideCriterion {
  id: string;
  title: string;
  branch:
    | "project_requirement"
    | "release_solution"
    | "pipe_measurement"
    | "water_level_measurement"
    | "natural_profile"
    | "artificial_profile"
    | "dam_pipe"
    | "gate"
    | "opening_in_dam"
    | "fish_passage"
    | "coanda_tyrolean_screen"
    | "nve_documentation"
    | "operation_and_control"
    | "public_information"
    | "alternative_method";
  sourceRefs: string[];
  sourceInterpretation: string;
  sourceScope: SourceScope;
  answerModel: "evidence_status" | "source_anchored_category" | "numeric" | "multi_select_source_anchored";
  options?: HydroGuideAnswerOption[];
  requiredFor?: string[];
  visibleWhen?: Partial<Record<string, string | string[]>>;
  required?: boolean;
}

export interface HydroGuideCard {
  id: string;
  title: string;
  purpose: string;
  sourceRefs: string[];
  criterionIds: string[];
  showWhen?: Partial<Record<string, string | string[]>>;
}

export interface HydroGuideMethodCandidate {
  id: string;
  label: string;
  releaseSolutionCode?: string;
  measurementMethodCode: string;
  sourceRefs: string[];
  requiredCriteria: string[];
  warningCriteria: string[];
  rejectionCriteria: string[];
  implicitObligationIds: string[];
}

export type HydroGuideDecisionStatus =
  | "ANBEFALT_KILDEFORANKRET"
  | "MULIG_MEN_MANGLER_STEDSSPESIFIKK_GRUNNLAG"
  | "FRARADET_KILDEFORANKRET"
  | "KREVER_SAERSKILT_BEGRUNNELSE_ELLER_NVE_AVKLARING"
  | "IKKE_KILDEFORANKRET";

export interface UniversalNveObligation {
  id: string;
  title: string;
  sourceRefs: string[];
  sourceInterpretation: string;
  obligationText: string;
  appliesTo:
    | "all_methods"
    | "pipe_measurement"
    | "water_level_measurement"
    | "natural_profile"
    | "artificial_profile"
    | "river_station"
    | "minimum_flow_station";
  visibleToUserAsQuestion: false;
  mayAppearInReport: true;
  mayAppearInAiNarrative: true;
  mayBlockUserValidation: false;
  mayCreateMissingDataStatus: false;
}

export interface HydroGuideDecisionWarning {
  id: string;
  title: string;
  sourceRefs: string[];
  criterionIds: string[];
}

export interface HydroGuideDecision {
  status: HydroGuideDecisionStatus;
  methodId: string;
  methodLabel: string;
  releaseSolutionCode?: string;
  measurementMethodCode?: string;
  sourceRefs: string[];
  satisfiedCriteria: string[];
  failedCriteria: string[];
  missingSiteCriteria: string[];
  criteriaSatisfied: string[];
  criteriaNotSatisfied: string[];
  missingDocumentation: string[];
  implicitObligations: UniversalNveObligation[];
  explanation: string;
  explanationSourceRefs: string[];
  warnings: HydroGuideDecisionWarning[];
}

export interface SourceAnchoredReportSummary {
  selectedMethod: string;
  satisfiedCriteria: Array<{ id: string; title: string; sourceRefs: string[] }>;
  failedCriteria: Array<{ id: string; title: string; sourceRefs: string[] }>;
  missingDocumentation: Array<{ id: string; title: string; sourceRefs: string[] }>;
  missingSiteCriteria: Array<{ id: string; title: string; sourceRefs: string[] }>;
  sourceReferences: NveSourceRef[];
  systemAssumptions: Array<{ text: string; sourceRefs: string[] }>;
  implicitObligations: UniversalNveObligation[];
}

export const EVIDENCE_OPTIONS: HydroGuideAnswerOption[] = [
  {
    id: "documented_satisfies_source_criterion",
    label: "Ja",
    sourceRefs: [],
    semanticMeaning: "HydroGuide records that project documentation shows the source-backed criterion is satisfied.",
    isAppOperationalization: true
  },
  {
    id: "documented_does_not_satisfy_source_criterion",
    label: "Nei",
    sourceRefs: [],
    semanticMeaning: "HydroGuide records that project documentation shows the source-backed criterion is not satisfied.",
    isAppOperationalization: true
  },
  {
    id: "not_documented_yet",
    label: "Ikke oppgitt",
    sourceRefs: [],
    semanticMeaning: "HydroGuide records that the source-backed criterion has not yet been documented.",
    isAppOperationalization: true
  }
];
