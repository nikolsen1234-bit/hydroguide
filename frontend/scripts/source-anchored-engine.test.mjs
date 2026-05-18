import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";

const repoRoot = path.resolve(import.meta.dirname, "..");
const tempDir = await mkdtemp(path.join(tmpdir(), "hydroguide-source-engine-"));
const bundlePath = path.join(tempDir, "source-engine.mjs");
const questionsBundlePath = path.join(tempDir, "questions.mjs");

await build({
  entryPoints: [path.join(repoRoot, "src", "hydroguide", "sourceAnchoredDecision.ts")],
  outfile: bundlePath,
  bundle: true,
  platform: "node",
  format: "esm",
  logLevel: "silent"
});

await build({
  entryPoints: [path.join(repoRoot, "src", "questions.ts")],
  outfile: questionsBundlePath,
  bundle: true,
  platform: "node",
  format: "esm",
  logLevel: "silent"
});

const {
  calculateHydroGuideDecision,
  createEmptyHydroGuideAnswers,
  hydroGuideCards,
  hydroGuideCriteria,
  hydroGuideMethodCandidates,
  validateSourceAnchoredModel,
  visibleHydroGuideCards
} = await import(pathToFileURL(bundlePath));
const { visibleQuestionsForAnswers } = await import(pathToFileURL(questionsBundlePath));

const pass = "documented_satisfies_source_criterion";
const fail = "documented_does_not_satisfy_source_criterion";
const missing = "not_documented_yet";

function answers(overrides) {
  return { ...createEmptyHydroGuideAnswers(), ...overrides };
}

function ids(items) {
  return items.map((item) => item.id);
}

const validationErrors = validateSourceAnchoredModel();
assert.deepEqual(validationErrors, [], validationErrors.join("\n"));

for (const criterion of hydroGuideCriteria) {
  assert.ok(criterion.sourceRefs.length > 0, `${criterion.id} must be source anchored`);
  assert.ok(criterion.sourceInterpretation, `${criterion.id} must explain source interpretation`);
}

for (const card of hydroGuideCards) {
  assert.ok(card.sourceRefs.length > 0, `${card.id} must expose source refs`);
}

for (const method of hydroGuideMethodCandidates) {
  assert.ok(method.sourceRefs.length > 0, `${method.id} must be source anchored`);
  assert.ok(method.implicitObligationIds.length > 0, `${method.id} must carry implicit NVE obligations`);
}

const hasRequirementCriterion = hydroGuideCriteria.find((criterion) => criterion.id === "has_requirement");
assert.deepEqual(
  hasRequirementCriterion?.options?.map((option) => option.label),
  ["Ja", "Nei", "Ikke oppgitt"]
);

const flowRequirementCriterion = hydroGuideCriteria.find((criterion) => criterion.id === "flow_requirement");
assert.equal(flowRequirementCriterion?.answerModel, "source_anchored_category");
assert.deepEqual(
  flowRequirementCriterion?.options?.map((option) => option.label),
  ["0-50 l/s", "50-200 l/s", "200-500 l/s", "Over 500 l/s"]
);

// Criteria, options, and branches that were removed in the simplified model must
// remain absent from criteria, cards, and method requirements.
const removedQuestionIds = [
  // legacy detail-branch questions
  "pipe_calibration_control",
  "water_level_rating_curve",
  "water_level_electronic_registration",
  "water_level_unambiguous_relationship",
  "natural_profile_sufficient_measurements",
  "artificial_profile_five_percent_verification",
  "artificial_profile_control_measurements",
  // newly removed in simplified model
  "legal_requirement_documented",
  "minimum_flow_requirement_lps",
  "requirement_pattern",
  "release_solution_category",
  "site_constraints",
  "pipe_meter_type",
  "pipe_after_rack",
  "pipe_outlet_near_dam_or_threshold",
  "pipe_dry_frost_free",
  "pipe_full_through_meter",
  "pipe_air_handled",
  "pipe_straight_run_supplier_requirements",
  "pipe_electromagnetic_velocity_and_deposits_suitable",
  "pipe_ultrasonic_coupling_and_mounting_maintained",
  "pipe_orifice_registration_and_calibration_documented",
  "pipe_adp_geometry_and_velocity_distribution_documented",
  "natural_profile_stable_control",
  "natural_profile_changes_handled",
  "artificial_profile_standard_construction",
  "artificial_profile_ice_sediment_protection",
  "dam_pipe_below_lrv",
  "dam_pipe_capacity_margin_no_vortex",
  "dam_pipe_sediment_blocking_handled",
  "theoretical_only_documentation",
  "dam_gate_opening_downstream_measurement",
  "gate_electronic_level_or_opening",
  "gate_power_backup_winter_operation",
  "opening_standard_profile",
  "opening_clogging_icing_protection",
  "opening_low_water_capacity",
  "fish_passage_release_relevant",
  "fish_passage_independent_upstream_level",
  "fish_passage_measurement_no_barrier",
  "coanda_return_point",
  "coanda_takeoff_point",
  "coanda_low_fall_handled",
  "coanda_air_entrainment_handled",
  "alternative_special_justification"
];
const criterionIds = new Set(hydroGuideCriteria.map((criterion) => criterion.id));
const cardCriterionIds = new Set(hydroGuideCards.flatMap((card) => card.criterionIds));
const methodReferencedCriterionIds = new Set(
  hydroGuideMethodCandidates.flatMap((method) => [
    ...method.requiredCriteria,
    ...method.warningCriteria,
    ...method.rejectionCriteria
  ])
);

for (const id of removedQuestionIds) {
  assert.equal(criterionIds.has(id), false, `${id} must be removed from criteria`);
  assert.equal(cardCriterionIds.has(id), false, `${id} must be removed from visible cards`);
  assert.equal(methodReferencedCriterionIds.has(id), false, `${id} must be removed from method logic`);
}

// Every example config in /public must only use the simplified criterion ids.
const allowedAnswerIds = new Set(Object.keys(createEmptyHydroGuideAnswers()));
for (const fileName of ["Kalkulator.txt", "HydroGuide.txt"]) {
  const exampleConfig = JSON.parse(await readFile(path.join(repoRoot, "public", fileName), "utf8"));
  const staleExampleAnswerIds = Object.keys(exampleConfig.answers ?? {}).filter((id) => !allowedAnswerIds.has(id));
  assert.deepEqual(staleExampleAnswerIds, [], `${fileName} must not contain stale HydroGuide answer keys`);
}

// The simplified model exposes exactly these criteria; verify titles are present.
const activeQuestionTitles = Object.fromEntries(
  hydroGuideCards
    .flatMap((card) => card.criterionIds)
    .map((id) => [id, hydroGuideCriteria.find((criterion) => criterion.id === id)?.title])
);
assert.equal(activeQuestionTitles.has_requirement, "Er det krav om minstevannføring i konsesjonen?");
assert.equal(activeQuestionTitles.flow_requirement, "Hvor mye minstevannføring skal slippes?");
assert.equal(activeQuestionTitles.requirement_variation, "Variasjon i krav til minstevannføring gjennom året");
assert.equal(activeQuestionTitles.release_method, "Slippmetode for minstevannføring");
assert.equal(activeQuestionTitles.doc_method, "Hvordan dokumenteres vannføringen?");
assert.equal(activeQuestionTitles.site_factors, "Stedsforhold");
assert.equal(activeQuestionTitles.report_freq, "Rapporteringsfrekvens");
assert.equal(activeQuestionTitles.redundancy, "Kreves redundans (to uavhengige sensorer/loggere)?");

function visibleQuestionIds(overrides) {
  return visibleQuestionsForAnswers(answers(overrides)).map((question) => question.key);
}

const visibleHasRequirementQuestion = visibleQuestionsForAnswers(answers({ release_method: "intake_dam_pipe" }))
  .find((question) => question.key === "has_requirement");
assert.ok(
  visibleHasRequirementQuestion?.options?.some((option) => option.value === "not_documented_yet" && option.label === "Ikke oppgitt"),
  "visible question options should keep the not documented choice"
);

// Pipe-via-intake scenario, fully answered.
const pipeAnswers = answers({
  has_requirement: pass,
  flow_requirement: "flow_50_200",
  requirement_variation: "seasonal",
  release_method: "intake_pipe",
  doc_method: "doc_direct_flow",
  site_factors: ["site_ice_frost"],
  report_freq: "freq_hourly",
  redundancy: "redundancy_no"
});
const pipeDecision = calculateHydroGuideDecision(pipeAnswers);
assert.equal(pipeDecision.status, "ANBEFALT_KILDEFORANKRET");
assert.equal(pipeDecision.methodId, "intake_pipe");
assert.equal(pipeDecision.measurementMethodCode, "M1");
assert.ok(pipeDecision.sourceRefs.length > 0);
assert.ok(pipeDecision.implicitObligations.length > 0);
assert.ok(ids(visibleHydroGuideCards(pipeAnswers)).includes("kartlegging"));

// Missing documentation method is flagged as missing context.
const pipeWithMissingDocDecision = calculateHydroGuideDecision(answers({
  has_requirement: pass,
  flow_requirement: "flow_50_200",
  requirement_variation: "year_round",
  release_method: "intake_pipe",
  doc_method: "unknown",
  report_freq: "freq_hourly",
  redundancy: "redundancy_no"
}));
assert.equal(pipeWithMissingDocDecision.status, "MULIG_MEN_MANGLER_STEDSSPESIFIKK_GRUNNLAG");
assert.ok(pipeWithMissingDocDecision.missingDocumentation.includes("doc_method"));

// Dam-pipe scenario, fully answered.
const damPipeDecision = calculateHydroGuideDecision(answers({
  has_requirement: pass,
  flow_requirement: "flow_50_200",
  requirement_variation: "year_round",
  release_method: "intake_dam_pipe",
  doc_method: "doc_level_to_flow",
  report_freq: "freq_hourly",
  redundancy: "redundancy_no"
}));
assert.equal(damPipeDecision.status, "ANBEFALT_KILDEFORANKRET");
assert.equal(damPipeDecision.methodId, "intake_dam_pipe");

// Gate scenario without report frequency leaves missing documentation.
const gateMissingReportFreqDecision = calculateHydroGuideDecision(answers({
  has_requirement: pass,
  flow_requirement: "flow_over_500",
  requirement_variation: "seasonal",
  release_method: "intake_dam_gate",
  doc_method: "doc_level_to_flow",
  site_factors: ["site_ice_frost"],
  report_freq: "",
  redundancy: "redundancy_yes"
}));
assert.equal(gateMissingReportFreqDecision.status, "MULIG_MEN_MANGLER_STEDSSPESIFIKK_GRUNNLAG");
assert.ok(gateMissingReportFreqDecision.missingDocumentation.includes("report_freq"));

// Fish passage with documentation method picked.
const fishDecision = calculateHydroGuideDecision(answers({
  has_requirement: pass,
  flow_requirement: "flow_50_200",
  requirement_variation: "year_round",
  release_method: "intake_fish_passage",
  doc_method: "doc_level_to_flow",
  report_freq: "freq_hourly",
  redundancy: "redundancy_no"
}));
assert.equal(fishDecision.status, "ANBEFALT_KILDEFORANKRET");
assert.equal(fishDecision.methodId, "intake_fish_passage");

// Alternative method always requires NVE clarification regardless of details.
const alternativeDecision = calculateHydroGuideDecision(answers({
  has_requirement: pass,
  flow_requirement: "flow_0_50",
  release_method: "intake_alternative"
}));
assert.equal(alternativeDecision.status, "KREVER_SAERSKILT_BEGRUNNELSE_ELLER_NVE_AVKLARING");
assert.equal(alternativeDecision.methodId, "intake_alternative");

// `has_requirement` answered "Nei" should produce a failed decision.
const negativeRequirementDecision = calculateHydroGuideDecision(answers({
  has_requirement: fail,
  flow_requirement: "flow_0_50",
  requirement_variation: "year_round",
  release_method: "intake_pipe",
  doc_method: "doc_direct_flow",
  report_freq: "freq_hourly",
  redundancy: "redundancy_no"
}));
assert.equal(negativeRequirementDecision.status, "FRARADET_KILDEFORANKRET");
assert.ok(negativeRequirementDecision.criteriaNotSatisfied.includes("has_requirement"));

// Missing required criteria for the alternative path should still yield a clarification status.
const alternativeWithMissingDecision = calculateHydroGuideDecision(answers({
  has_requirement: missing,
  release_method: "intake_alternative"
}));
assert.equal(alternativeWithMissingDecision.status, "KREVER_SAERSKILT_BEGRUNNELSE_ELLER_NVE_AVKLARING");

console.log("PASS source anchored engine contract");
