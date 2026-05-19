import { nveSourceRegister, sourceRef } from "./nveSources";
import { universalNveObligationIds, universalNveObligations } from "./universalNveObligations";
import {
  EVIDENCE_OPTIONS,
  EvidenceStatus,
  HydroGuideAnswerOption,
  HydroGuideAnswers,
  HydroGuideCard,
  HydroGuideCriterion,
  HydroGuideDecision,
  HydroGuideDecisionStatus,
  HydroGuideMethodCandidate,
  SourceAnchoredReportSummary
} from "./sourceAnchoredModel";

const PASS: EvidenceStatus = "documented_satisfies_source_criterion";
const FAIL: EvidenceStatus = "documented_does_not_satisfy_source_criterion";
const MISSING: EvidenceStatus = "not_documented_yet";

function evidenceOptions(sourceRefs: string[]): HydroGuideAnswerOption[] {
  return EVIDENCE_OPTIONS.map((option) => ({
    ...option,
    sourceRefs,
    semanticMeaning: `${option.semanticMeaning} The criterion is anchored to ${sourceRefs.join(", ")}.`
  }));
}

function option(id: string, label: string, sourceRefs: string[], semanticMeaning: string): HydroGuideAnswerOption {
  return { id, label, sourceRefs, semanticMeaning, isAppOperationalization: false };
}

function criterion(input: HydroGuideCriterion): HydroGuideCriterion {
  const options =
    input.answerModel === "evidence_status"
      ? evidenceOptions(input.sourceRefs)
      : input.options;
  return { ...input, options };
}

export const secureDataStorageReportRequirement = {
  text: "Dokumentasjon og måledata skal lagres slik at ansvarlig tiltakshaver kan legge dem fram for NVE.",
  sourceRefs: ["NVE_2020_1_4_2", "NVE_2020_2_6", "NVE_2020_6_1"]
};

export const hydroGuideCriteria: HydroGuideCriterion[] = [
  criterion({
    id: "has_requirement",
    title: "Er det krav om minstevannføring i konsesjonen?",
    branch: "project_requirement",
    sourceRefs: ["NVE_2020_1_4_1", "NVE_2020_1_3", "NVE_2020_2_6"],
    sourceInterpretation: "NVE describes the concession or decision as the source of the actual minimum-flow requirement; HydroGuide records whether that external requirement is documented.",
    sourceScope: "requirement",
    answerModel: "evidence_status",
    requiredFor: ["all"]
  }),
  criterion({
    id: "flow_requirement",
    title: "Hvor mye minstevannføring skal slippes?",
    branch: "project_requirement",
    sourceRefs: ["NVE_2020_1_4_1", "NVE_2020_2_6"],
    sourceInterpretation: "The app captures the documented requirement value but does not calculate or invent the legal requirement.",
    sourceScope: "requirement",
    answerModel: "source_anchored_category",
    options: [
      option("flow_0_50", "0-50 l/s", ["NVE_2020_1_4_1", "NVE_2020_2_6"], "The documented minimum-flow requirement is in the 0-50 l/s interval."),
      option("flow_50_200", "50-200 l/s", ["NVE_2020_1_4_1", "NVE_2020_2_6"], "The documented minimum-flow requirement is in the 50-200 l/s interval."),
      option("flow_200_500", "200-500 l/s", ["NVE_2020_1_4_1", "NVE_2020_2_6"], "The documented minimum-flow requirement is in the 200-500 l/s interval."),
      option("flow_over_500", "Over 500 l/s", ["NVE_2020_1_4_1", "NVE_2020_2_6"], "The documented minimum-flow requirement is over 500 l/s.")
    ],
    requiredFor: ["all"],
    visibleWhen: { has_requirement: "documented_satisfies_source_criterion" }
  }),
  criterion({
    id: "requirement_variation",
    title: "Variasjon i krav til minstevannføring gjennom året",
    branch: "project_requirement",
    sourceRefs: ["NVE_2020_1_4_1", "NVE_2020_3_1", "NVE_2020_2_6"],
    sourceInterpretation: "NVE source sections make seasonal, conditional, and site-specific requirements relevant to arrangement choice and detail-plan documentation.",
    sourceScope: "requirement",
    answerModel: "source_anchored_category",
    options: [
      option("seasonal", "Sesongbasert krav", ["NVE_2020_1_4_1", "NVE_2020_3_1"], "The documented requirement varies by season or operating condition."),
      option("year_round", "Helårskrav", ["NVE_2020_1_4_1", "NVE_2020_2_6"], "The documented requirement is one fixed release value."),
      option("unknown", "Ikke dokumentert ennå", ["NVE_2020_1_4_1"], "The requirement pattern has not yet been found in the concession or decision.")
    ],
    requiredFor: ["all"],
    visibleWhen: { has_requirement: "documented_satisfies_source_criterion" }
  }),
  criterion({
    id: "release_method",
    title: "Slippmetode for minstevannføring",
    branch: "release_solution",
    sourceRefs: ["NVE_2020_4_1", "NVE_2020_9"],
    sourceInterpretation: "NVE describes accepted release arrangement families; every selectable category is anchored to its specific source section.",
    sourceScope: "accepted_method",
    answerModel: "source_anchored_category",
    options: [
      option("intake_pipe", "Rør via inntak", ["NVE_2020_4_2", "NVE_2020_9"], "Minimum flow is released through pipe via the intake arrangement."),
      option("intake_dam_pipe", "Rør gjennom dam eller terskel", ["NVE_2020_4_3", "NVE_2020_9"], "Minimum flow is released through pipe through dam or threshold."),
      option("intake_dam_gate", "Tappeluke", ["NVE_2020_4_4", "NVE_2020_9"], "Minimum flow is released through a gate/luke arrangement."),
      option("intake_dam_opening", "Utsparing i dam", ["NVE_2020_4_5", "NVE_2020_9"], "Minimum flow is released through opening/notch in dam or overflow threshold."),
      option("intake_fish_passage", "Fiskepassasje", ["NVE_2020_5_1", "NVE_2020_9"], "Minimum flow is fully or partly released through a fish passage."),
      option("intake_coanda", "Coanda-rist", ["NVE_2020_5_2"], "The release arrangement is tied to a coanda or tyrolean screen intake."),
      option("intake_alternative", "Annen/alternativ metode", ["NVE_2020_6_1", "NVE_2024_MVF_4"], "The arrangement is outside the normal accepted set and needs special justification or NVE clarification.")
    ],
    requiredFor: ["all"]
  }),
  criterion({
    id: "doc_method",
    title: "Hvordan dokumenteres vannføringen?",
    branch: "nve_documentation",
    sourceRefs: ["NVE_2020_6_1", "NVE_2020_6_2", "NVE_2020_6_3", "NVE_2024_MVF_4"],
    sourceInterpretation: "NVE distinguishes between direct flow measurement in pipe, indirect calculation from water level via rating curve, and stand-alone water level registration.",
    sourceScope: "documentation_requirement",
    answerModel: "source_anchored_category",
    options: [
      option("doc_direct_flow", "Direkte flowmåling i rør", ["NVE_2020_6_2", "NVE_2024_MVF_4_2"], "Flow is measured directly with a flowmeter in a pipe."),
      option("doc_level_to_flow", "Vannstand med vannføringskurve (h-Q)", ["NVE_2020_6_3", "NVE_2024_MVF_4_3"], "Flow is calculated from water level via an established rating curve."),
      option("doc_level_only", "Bare vannstandsmåling", ["NVE_2020_6_3", "NVE_2024_ELV_4_2_1"], "Only water level is registered and reported."),
      option("unknown", "Ikke bestemt ennå", ["NVE_2020_6_1"], "The documentation method has not been decided.")
    ],
    requiredFor: ["all"]
  }),
  criterion({
    id: "site_factors",
    title: "Stedsforhold",
    branch: "operation_and_control",
    sourceRefs: ["NVE_2020_3_1", "NVE_2020_2_6", "NVE_2020_8", "NVE_2024_ELV_4_6"],
    sourceInterpretation: "Hydrology, climate, physical conditions, debris, ice, accessibility, power, communication, low conductivity, and follow-up affect arrangement choice.",
    sourceScope: "context",
    answerModel: "multi_select_source_anchored",
    options: [
      option("site_flow_variation", "Varierende vannføring", ["NVE_2020_3_1"], "Hydrological or seasonal flow pattern affects arrangement choice."),
      option("site_debris_sediment", "Drivgods eller sediment i vannet", ["NVE_2020_2_6", "NVE_2024_ELV_4_6"], "Debris or sediment can affect release and station operation."),
      option("site_ice_frost", "Is eller frost ved inntak/målepunkt", ["NVE_2020_3_1", "NVE_2020_8", "NVE_2024_ELV_4_6"], "Winter climate, ice, or frost can affect release and measurement."),
      option("site_hard_access", "Vanskelig adkomst", ["NVE_2020_3_1", "NVE_2020_8"], "Access affects operation, follow-up, and control routines."),
      option("site_low_conductivity", "Rent vann (lav ledningsevne)", ["NVE_2020_6_2"], "Low water conductivity (typical west-coast rivers) affects flowmeter selection."),
      option("site_limited_power_comm", "Begrenset strøm eller kommunikasjon", ["NVE_2020_6_1", "NVE_2024_ELV_4_6"], "Power and communication constraints affect measurement station operation."),
      option("site_none", "Ingen særskilte forhold", ["NVE_2020_3_1"], "No source-backed site constraint is currently documented.")
    ]
  }),
  criterion({
    id: "report_freq",
    title: "Rapporteringsfrekvens",
    branch: "nve_documentation",
    sourceRefs: ["NVE_2024_MVF_4_1", "NVE_2024_ELV_4_2_1"],
    sourceInterpretation: "NVE guidelines specify minimum hourly registration; more frequent (15-30 min) is required for flood warning or significant public interest.",
    sourceScope: "documentation_requirement",
    answerModel: "source_anchored_category",
    options: [
      option("freq_hourly", "Minst én gang per time (standard)", ["NVE_2024_MVF_4_1"], "Standard NVE minimum frequency is one registration per hour."),
      option("freq_frequent", "15-30 min (flom/allmenn interesse)", ["NVE_2024_MVF_4_1", "NVE_2024_ELV_4_2_1"], "More frequent registration is required for flood warning or public interest."),
      option("unknown", "Ikke spesifisert", ["NVE_2024_MVF_4_1"], "Reporting frequency is not yet specified.")
    ],
    requiredFor: ["all"]
  }),
  criterion({
    id: "redundancy",
    title: "Kreves redundans (to uavhengige sensorer/loggere)?",
    branch: "operation_and_control",
    sourceRefs: ["NVE_2024_MVF_4_1", "NVE_2024_ELV_4_6"],
    sourceInterpretation: "NVE recommends redundant sensors and loggers for hard-to-access stations to reduce risk of documentation loss.",
    sourceScope: "operation_requirement",
    answerModel: "source_anchored_category",
    options: [
      option("redundancy_yes", "Ja (vanskelig adkomst eller kritisk anlegg)", ["NVE_2024_ELV_4_6"], "Redundancy is recommended for hard-to-access or critical stations."),
      option("redundancy_no", "Nei", ["NVE_2024_MVF_4_1"], "Single sensor and logger is sufficient."),
      option("unknown", "Vet ikke ennå", ["NVE_2024_MVF_4_1"], "Redundancy decision is pending.")
    ],
    requiredFor: ["all"]
  })
];

export const hydroGuideCards: HydroGuideCard[] = [
  {
    id: "kartlegging",
    title: "Kartlegging av minstevannføringsarrangement",
    purpose: "Kartlegg kravgrunnlag, slippmetode, dokumentasjon og stedsforhold for å få en anbefaling.",
    sourceRefs: ["NVE_2020_1_4_1", "NVE_2020_4_1", "NVE_2020_6_1", "NVE_2024_MVF_4", "NVE_2024_MVF_4_1"],
    criterionIds: [
      "has_requirement",
      "flow_requirement",
      "requirement_variation",
      "release_method",
      "doc_method",
      "site_factors",
      "report_freq",
      "redundancy"
    ]
  }
];

export const hydroGuideMethodCandidates: HydroGuideMethodCandidate[] = [
  { id: "intake_pipe", label: "Rør via inntak", releaseSolutionCode: "S1", measurementMethodCode: "M1", sourceRefs: ["NVE_2020_4_2", "NVE_2020_6_2", "NVE_2024_MVF_4_2", "NVE_2020_9"], requiredCriteria: ["has_requirement", "flow_requirement", "release_method", "doc_method", "report_freq", "redundancy"], warningCriteria: [], rejectionCriteria: [], implicitObligationIds: [...universalNveObligationIds] },
  { id: "intake_dam_pipe", label: "Rør gjennom dam med nedstrøms måleprofil", releaseSolutionCode: "S2", measurementMethodCode: "M2", sourceRefs: ["NVE_2020_4_3", "NVE_2020_6_3", "NVE_2024_MVF_4_4", "NVE_2020_9"], requiredCriteria: ["has_requirement", "flow_requirement", "release_method", "doc_method", "report_freq", "redundancy"], warningCriteria: [], rejectionCriteria: [], implicitObligationIds: [...universalNveObligationIds] },
  { id: "intake_dam_gate", label: "Tappeluke med nedstrøms profil", releaseSolutionCode: "S3", measurementMethodCode: "M2", sourceRefs: ["NVE_2020_4_4", "NVE_2020_6_3", "NVE_2024_MVF_4_4", "NVE_2020_9"], requiredCriteria: ["has_requirement", "flow_requirement", "release_method", "doc_method", "report_freq", "redundancy"], warningCriteria: [], rejectionCriteria: [], implicitObligationIds: [...universalNveObligationIds] },
  { id: "intake_dam_opening", label: "Utsparing i dam med dokumenterende profil", releaseSolutionCode: "S4", measurementMethodCode: "M3", sourceRefs: ["NVE_2020_4_5", "NVE_2020_6_3", "NVE_2024_MVF_4_4", "NVE_2020_9"], requiredCriteria: ["has_requirement", "flow_requirement", "release_method", "doc_method", "report_freq", "redundancy"], warningCriteria: [], rejectionCriteria: [], implicitObligationIds: [...universalNveObligationIds] },
  { id: "intake_fish_passage", label: "Fiskepassasje med hydraulisk dokumentert slipp", releaseSolutionCode: "S5", measurementMethodCode: "M6", sourceRefs: ["NVE_2020_5_1", "NVE_2020_6_3", "NVE_2020_9"], requiredCriteria: ["has_requirement", "flow_requirement", "release_method", "doc_method", "report_freq", "redundancy"], warningCriteria: [], rejectionCriteria: [], implicitObligationIds: [...universalNveObligationIds] },
  { id: "intake_coanda", label: "Coanda-rist med prosjektspesifikk dokumentasjon", releaseSolutionCode: "S6", measurementMethodCode: "M7", sourceRefs: ["NVE_2020_5_2", "NVE_2020_9"], requiredCriteria: ["has_requirement", "flow_requirement", "release_method", "doc_method", "report_freq", "redundancy"], warningCriteria: [], rejectionCriteria: [], implicitObligationIds: [...universalNveObligationIds] },
  { id: "intake_alternative", label: "Alternativ metode som krever særskilt begrunnelse eller NVE-avklaring", releaseSolutionCode: "S7", measurementMethodCode: "M8", sourceRefs: ["NVE_2020_6_1", "NVE_2024_MVF_4"], requiredCriteria: ["has_requirement", "flow_requirement", "release_method"], warningCriteria: [], rejectionCriteria: [], implicitObligationIds: [...universalNveObligationIds] }
];

export function createEmptyHydroGuideAnswers(): HydroGuideAnswers {
  const answers: HydroGuideAnswers = {};
  for (const criterion of hydroGuideCriteria) {
    if (criterion.answerModel === "multi_select_source_anchored") answers[criterion.id] = [];
    else if (criterion.answerModel === "numeric") answers[criterion.id] = "";
    else answers[criterion.id] = criterion.answerModel === "evidence_status" ? MISSING : "";
  }
  return answers;
}

function criterionMap() {
  return new Map(hydroGuideCriteria.map((item) => [item.id, item]));
}

function selectedMethod(answers: HydroGuideAnswers): HydroGuideMethodCandidate {
  const release = String(answers.release_method || "");
  return hydroGuideMethodCandidates.find((item) => item.id === release) ?? hydroGuideMethodCandidates[6];
}

function checkCriterionValue(answers: HydroGuideAnswers, id: string): "satisfied" | "failed" | "missing" {
  const value = answers[id];
  const meta = criterionMap().get(id);
  if (!meta) return "missing";

  if (meta.answerModel === "evidence_status") {
    if (value === PASS) return "satisfied";
    if (value === FAIL) return "failed";
    return "missing";
  }
  if (meta.answerModel === "numeric") return typeof value === "number" && Number.isFinite(value) && value > 0 ? "satisfied" : "missing";
  if (meta.answerModel === "multi_select_source_anchored") return Array.isArray(value) && value.length > 0 ? "satisfied" : "missing";
  if (id === "release_method") {
    if (value === "intake_alternative") return "missing";
    return typeof value === "string" && value.length > 0 && value !== "unknown" ? "satisfied" : "missing";
  }
  return typeof value === "string" && value.length > 0 && value !== "unknown" ? "satisfied" : "missing";
}

function dedupe(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function sourceRefsFor(criteriaIds: string[], extra: string[] = []): string[] {
  const map = criterionMap();
  return dedupe([...extra, ...criteriaIds.flatMap((id) => map.get(id)?.sourceRefs ?? [])]);
}

function obligationsFor(ids: string[]) {
  const allowed = new Set(ids);
  return universalNveObligations.filter((item) => allowed.has(item.id));
}

function displaySourceRef(sourceId: string) {
  const source = nveSourceRegister[sourceId as keyof typeof nveSourceRegister];
  return source ? `${source.documentTitle}, pkt. ${source.section}` : sourceId;
}

function displaySourceRefs(sourceRefs: string[]) {
  return sourceRefs.map(displaySourceRef).join("; ");
}

function displayCriterion(id: string) {
  const meta = criterionMap().get(id);
  return meta ? `${meta.title} (${displaySourceRefs(meta.sourceRefs)})` : id;
}

export function calculateHydroGuideDecision(answers: HydroGuideAnswers): HydroGuideDecision {
  const method = selectedMethod(answers);
  const criteriaToCheck = dedupe(method.requiredCriteria);
  const satisfied: string[] = [];
  const failed: string[] = [];
  const missing: string[] = [];

  for (const id of criteriaToCheck) {
    const state = checkCriterionValue(answers, id);
    if (state === "satisfied") satisfied.push(id);
    if (state === "failed") failed.push(id);
    if (state === "missing") missing.push(id);
  }

  const warnings: HydroGuideDecision["warnings"] = [];
  const hasAlternative = method.id === "intake_alternative";
  const status: HydroGuideDecisionStatus = hasAlternative
    ? "KREVER_SAERSKILT_BEGRUNNELSE_ELLER_NVE_AVKLARING"
    : failed.length > 0
      ? "FRARADET_KILDEFORANKRET"
      : missing.length > 0
        ? "MULIG_MEN_MANGLER_STEDSSPESIFIKK_GRUNNLAG"
        : "ANBEFALT_KILDEFORANKRET";

  const sourceRefs = sourceRefsFor([...satisfied, ...failed, ...missing], method.sourceRefs);
  const implicitObligations = obligationsFor(method.implicitObligationIds);
  const explanation =
    status === "ANBEFALT_KILDEFORANKRET"
      ? `${method.label} er anbefalt fordi de kildeforankrede kriteriene er svart Ja på.`
      : status === "FRARADET_KILDEFORANKRET"
        ? `${method.label} frarådes fordi disse kildeforankrede kriteriene er svart Nei på: ${failed.map(displayCriterion).join("; ")}.`
        : status === "KREVER_SAERSKILT_BEGRUNNELSE_ELLER_NVE_AVKLARING"
          ? `${method.label} ligger utenfor normal kildeforankret metodeanbefaling og krever særskilt begrunnelse eller NVE-avklaring.`
          : `${method.label} kan være aktuell, men mangler grunnlag for: ${missing.map(displayCriterion).join("; ")}.`;

  return {
    status,
    methodId: method.id,
    methodLabel: method.label,
    releaseSolutionCode: method.releaseSolutionCode,
    measurementMethodCode: method.measurementMethodCode,
    sourceRefs,
    satisfiedCriteria: dedupe(satisfied),
    failedCriteria: dedupe(failed),
    missingSiteCriteria: dedupe(missing),
    criteriaSatisfied: dedupe(satisfied),
    criteriaNotSatisfied: dedupe(failed),
    missingDocumentation: dedupe(missing),
    implicitObligations,
    explanation,
    explanationSourceRefs: sourceRefs,
    warnings
  };
}

export function validateSourceAnchoredModel(): string[] {
  const errors: string[] = [];
  const sourceIds = new Set(Object.keys(nveSourceRegister));
  const criteriaIds = new Set(hydroGuideCriteria.map((item) => item.id));
  const methodIds = new Set(hydroGuideMethodCandidates.map((item) => item.id));

  for (const criterion of hydroGuideCriteria) {
    if (!criterion.sourceRefs.length) errors.push(`${criterion.id} missing sourceRefs`);
    if (!criterion.sourceInterpretation) errors.push(`${criterion.id} missing sourceInterpretation`);
    for (const sourceId of criterion.sourceRefs) if (!sourceIds.has(sourceId)) errors.push(`${criterion.id} references unknown source ${sourceId}`);
    for (const option of criterion.options ?? []) {
      if (!option.sourceRefs.length) errors.push(`${criterion.id}.${option.id} missing sourceRefs`);
      if (!option.semanticMeaning) errors.push(`${criterion.id}.${option.id} missing semanticMeaning`);
      for (const sourceId of option.sourceRefs) if (!sourceIds.has(sourceId)) errors.push(`${criterion.id}.${option.id} references unknown source ${sourceId}`);
    }
  }
  for (const card of hydroGuideCards) {
    if (!card.sourceRefs.length) errors.push(`${card.id} missing sourceRefs`);
    for (const criterionId of card.criterionIds) if (!criteriaIds.has(criterionId)) errors.push(`${card.id} references unknown criterion ${criterionId}`);
  }
  for (const method of hydroGuideMethodCandidates) {
    if (!method.sourceRefs.length) errors.push(`${method.id} missing sourceRefs`);
    if (!method.requiredCriteria.length) errors.push(`${method.id} missing requiredCriteria`);
    for (const criterionId of [...method.requiredCriteria, ...method.warningCriteria, ...method.rejectionCriteria]) {
      if (!criteriaIds.has(criterionId)) errors.push(`${method.id} references unknown criterion ${criterionId}`);
    }
    for (const obligationId of method.implicitObligationIds) {
      if (!universalNveObligationIds.includes(obligationId)) errors.push(`${method.id} references unknown obligation ${obligationId}`);
    }
  }
  for (const id of methodIds) {
    if (!hydroGuideCriteria.some((criterion) => criterion.requiredFor?.includes(id) || criterion.requiredFor?.includes("all"))) {
      errors.push(`${id} is not referenced by any criterion requiredFor`);
    }
  }
  return errors;
}

export function buildSourceAnchoredReportSummary(decision: HydroGuideDecision): SourceAnchoredReportSummary {
  const map = criterionMap();
  const criterionItem = (id: string) => {
    const meta = map.get(id);
    return { id, title: meta?.title ?? id, sourceRefs: meta?.sourceRefs ?? [] };
  };
  const obligationSourceIds = decision.implicitObligations.flatMap((item) => item.sourceRefs);
  const sourceReferences = dedupe([...decision.sourceRefs, ...obligationSourceIds]).map((id) => sourceRef(id, obligationSourceIds.includes(id) ? "implicit_obligation" : "documentation_requirement"));
  return {
    selectedMethod: decision.methodLabel,
    satisfiedCriteria: decision.criteriaSatisfied.map(criterionItem),
    failedCriteria: decision.criteriaNotSatisfied.map(criterionItem),
    missingDocumentation: decision.missingDocumentation.map(criterionItem),
    missingSiteCriteria: decision.missingSiteCriteria.map(criterionItem),
    sourceReferences,
    systemAssumptions: [secureDataStorageReportRequirement, ...decision.implicitObligations.map((item) => ({ text: item.obligationText, sourceRefs: item.sourceRefs }))],
    implicitObligations: decision.implicitObligations
  };
}

export function visibleHydroGuideCards(answers: HydroGuideAnswers): HydroGuideCard[] {
  return hydroGuideCards.filter((card) => {
    if (!card.showWhen) return true;
    return Object.entries(card.showWhen).every(([key, expected]) => {
      const actual = answers[key];
      return Array.isArray(expected) ? expected.includes(String(actual)) : actual === expected;
    });
  });
}

export { nveSourceRegister };
export { universalNveObligations };
export type { EvidenceStatus, HydroGuideAnswers } from "./sourceAnchoredModel";
