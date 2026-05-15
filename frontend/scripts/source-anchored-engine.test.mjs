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

const legalRequirementCriterion = hydroGuideCriteria.find((criterion) => criterion.id === "legal_requirement_documented");
assert.deepEqual(
  legalRequirementCriterion?.options?.map((option) => option.label),
  ["Ja", "Nei", "Ikke oppgitt"]
);

const minimumFlowCriterion = hydroGuideCriteria.find((criterion) => criterion.id === "minimum_flow_requirement_lps");
assert.equal(minimumFlowCriterion?.answerModel, "source_anchored_category");
assert.deepEqual(
  minimumFlowCriterion?.options?.map((option) => option.label),
  ["0-50 l/s", "50-200 l/s", "200-500 l/s", "Over 500 l/s"]
);

const removedQuestionIds = [
  ["pipe", "calibration", "control"].join("_"),
  ["water", "level", "rating", "curve"].join("_"),
  ["water", "level", "electronic", "registration"].join("_"),
  ["water", "level", "unambiguous", "relationship"].join("_"),
  ["natural", "profile", "sufficient", "measurements"].join("_"),
  ["artificial", "profile", "five", "percent", "verification"].join("_"),
  ["artificial", "profile", "control", "measurements"].join("_")
];
const removedQuestionTitles = [
  ["Vannstandsmåling med vannføringskurve", "er dokumentert"].join(" "),
  ["Elektronisk vannstandsregistrering", "er dokumentert"].join(" "),
  ["Entydig sammenheng mellom vannstand og vannføring", "er dokumentert"].join(" "),
  ["Tilstrekkelige målinger og kurvekvalitet", "rundt minstevannføring"].join(" "),
  ["Nedstrøms målepunkt", "dokumenterer slippet"].join(" "),
  ["Kunstig profil er verifisert med kontrollmålinger", "rundt kravsatt slipp"].join(" "),
  ["Er kalibrering og kontrollmåling", "dokumentert?"].join(" "),
  ["Kontrollmålinger og skade-/endringsrutiner", "er dokumentert"].join(" ")
];
const criterionIds = new Set(hydroGuideCriteria.map((criterion) => criterion.id));
const criterionTitles = new Set(hydroGuideCriteria.map((criterion) => criterion.title));
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

for (const title of removedQuestionTitles) {
  assert.equal(criterionTitles.has(title), false, `${title} must not remain as a HydroGuide question`);
}

const allowedAnswerIds = new Set(Object.keys(createEmptyHydroGuideAnswers()));
for (const fileName of ["Kalkulator.txt", "HydroGuide.txt"]) {
  const exampleConfig = JSON.parse(await readFile(path.join(repoRoot, "public", fileName), "utf8"));
  const staleExampleAnswerIds = Object.keys(exampleConfig.answers ?? {}).filter((id) => !allowedAnswerIds.has(id));
  assert.deepEqual(staleExampleAnswerIds, [], `${fileName} must not contain stale HydroGuide answer keys`);
}

const pipeQuestionTitles = Object.fromEntries(
  hydroGuideCriteria
    .filter((criterion) => criterion.branch === "pipe_measurement")
    .map((criterion) => [criterion.id, criterion.title])
);
assert.equal(pipeQuestionTitles.pipe_meter_type, "Hvilken rørmåler dokumenteres?");
assert.equal(pipeQuestionTitles.pipe_after_rack, "Tas vannet ut etter inntaksrist/varegrind?");
assert.equal(pipeQuestionTitles.pipe_outlet_near_dam_or_threshold, "Slippes vannet ut nær dammen eller terskelen?");
assert.equal(pipeQuestionTitles.pipe_dry_frost_free, "Står måler og elektronikk tørt, frostfritt eller godt beskyttet?");
assert.equal(pipeQuestionTitles.pipe_full_through_meter, "Er røret vannfylt gjennom hele rørstrekket?");
assert.equal(pipeQuestionTitles.pipe_air_handled, "Er røret fritt for luftbobler og luftlommer?");
assert.equal(pipeQuestionTitles.pipe_straight_run_supplier_requirements, "Er rettstrekk og rolig strømning i røret i tråd med leverandørkrav?");
assert.equal(pipeQuestionTitles.pipe_electromagnetic_velocity_and_deposits_suitable, "Er elektromagnetisk måler dimensjonert for hastighet, vannkvalitet og belegg?");
assert.equal(pipeQuestionTitles.pipe_ultrasonic_coupling_and_mounting_maintained, "Er ultralydmåler montert og vedlikeholdt med stabil kontakt mot røret?");
assert.equal(pipeQuestionTitles.pipe_orifice_registration_and_calibration_documented, "Er måleblende eller måledyse registrert og kalibrert for kravområdet?");
assert.equal(pipeQuestionTitles.pipe_adp_geometry_and_velocity_distribution_documented, "Er ADP-måling forankret i kjent rørgeometri og hastighetsfordeling?");

const activeQuestionTitles = Object.fromEntries(
  hydroGuideCards
    .flatMap((card) => card.criterionIds)
    .map((id) => [id, hydroGuideCriteria.find((criterion) => criterion.id === id)?.title])
);
const artificialProfileCard = hydroGuideCards.find((card) => card.id === "artificial_profile");
assert.deepEqual(
  artificialProfileCard?.criterionIds,
  ["artificial_profile_standard_construction", "artificial_profile_ice_sediment_protection"],
  "artificial profile card should keep only NVE 2020 suitability questions"
);
assert.equal(activeQuestionTitles.artificial_profile_standard_construction, "Har den kunstige profilen kjent form og mål?");
assert.equal(activeQuestionTitles.artificial_profile_ice_sediment_protection, "Er kunstig profil beskyttet mot is, sediment og skade?");
assert.equal(
  activeQuestionTitles.dam_pipe_capacity_margin_no_vortex,
  "Kan røret slippe nok vann uten at det dannes virvler eller trekkes inn luft?"
);
assert.equal(activeQuestionTitles.dam_pipe_below_lrv, "Ligger røret under laveste driftsvannstand?");
assert.equal(activeQuestionTitles.dam_pipe_sediment_blocking_handled, "Er røret sikret mot is, sediment og rusk?");
assert.equal(activeQuestionTitles.theoretical_only_documentation, "Er bare teoretisk beregning brukt som dokumentasjon?");
assert.equal(activeQuestionTitles.dam_gate_opening_downstream_measurement, "Dokumenteres slippet med nedstrøms målepunkt der det er mulig?");
assert.equal(activeQuestionTitles.gate_electronic_level_or_opening, "Blir lukeåpning eller vannstand registrert elektronisk?");
assert.equal(activeQuestionTitles.gate_power_backup_winter_operation, "Kan luka driftes om vinteren med nødvendig strøm og sekundærkilde?");
assert.equal(activeQuestionTitles.opening_standard_profile, "Har utsparingen kjent og målbar geometri?");
assert.equal(activeQuestionTitles.opening_clogging_icing_protection, "Er åpningen sikret mot is og tilstopping?");
assert.equal(activeQuestionTitles.opening_low_water_capacity, "Oppfylles kravet ved laveste driftsvannstand?");

function visibleQuestionIds(overrides) {
  return visibleQuestionsForAnswers(answers(overrides)).map((question) => question.key);
}

const visibleLegalRequirementQuestion = visibleQuestionsForAnswers(answers({ release_solution_category: "pipe_through_dam" }))
  .find((question) => question.key === "legal_requirement_documented");
assert.ok(
  visibleLegalRequirementQuestion?.options?.some((option) => option.value === "not_documented_yet" && option.label === "Ikke oppgitt"),
  "visible question options should keep the not documented choice"
);

assert.deepEqual(
  visibleQuestionIds({ release_solution_category: "pipe_through_dam" }).filter((id) => [
    "dam_pipe_below_lrv",
    "dam_pipe_capacity_margin_no_vortex",
    "dam_pipe_sediment_blocking_handled",
    "theoretical_only_documentation",
    "dam_gate_opening_downstream_measurement",
    "gate_electronic_level_or_opening",
    "gate_power_backup_winter_operation",
    "opening_standard_profile",
    "opening_clogging_icing_protection",
    "opening_low_water_capacity"
  ].includes(id)),
  [
    "dam_pipe_below_lrv",
    "dam_pipe_capacity_margin_no_vortex",
    "dam_pipe_sediment_blocking_handled",
    "theoretical_only_documentation",
    "dam_gate_opening_downstream_measurement"
  ],
  "pipe through dam should not show gate or opening questions"
);

assert.deepEqual(
  visibleQuestionIds({ release_solution_category: "gate" }).filter((id) => [
    "dam_pipe_below_lrv",
    "dam_pipe_capacity_margin_no_vortex",
    "dam_pipe_sediment_blocking_handled",
    "theoretical_only_documentation",
    "dam_gate_opening_downstream_measurement",
    "gate_electronic_level_or_opening",
    "gate_power_backup_winter_operation",
    "opening_standard_profile",
    "opening_clogging_icing_protection",
    "opening_low_water_capacity"
  ].includes(id)),
  [
    "theoretical_only_documentation",
    "dam_gate_opening_downstream_measurement",
    "gate_electronic_level_or_opening",
    "gate_power_backup_winter_operation"
  ],
  "gate should not show pipe-through-dam or opening questions"
);

assert.deepEqual(
  visibleQuestionIds({ release_solution_category: "opening_in_dam" }).filter((id) => [
    "dam_pipe_below_lrv",
    "dam_pipe_capacity_margin_no_vortex",
    "dam_pipe_sediment_blocking_handled",
    "theoretical_only_documentation",
    "dam_gate_opening_downstream_measurement",
    "gate_electronic_level_or_opening",
    "gate_power_backup_winter_operation",
    "opening_standard_profile",
    "opening_clogging_icing_protection",
    "opening_low_water_capacity"
  ].includes(id)),
  [
    "theoretical_only_documentation",
    "dam_gate_opening_downstream_measurement",
    "opening_standard_profile",
    "opening_clogging_icing_protection",
    "opening_low_water_capacity"
  ],
  "opening in dam should not show pipe-through-dam or gate questions"
);

assert.deepEqual(
  visibleQuestionIds({ release_solution_category: "pipe_via_intake", pipe_meter_type: "pipe_meter_electromagnetic" }).filter((id) => [
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
    "pipe_adp_geometry_and_velocity_distribution_documented"
  ].includes(id)),
  [
    "pipe_meter_type",
    "pipe_after_rack",
    "pipe_outlet_near_dam_or_threshold",
    "pipe_dry_frost_free",
    "pipe_full_through_meter",
    "pipe_air_handled",
    "pipe_straight_run_supplier_requirements",
    "pipe_electromagnetic_velocity_and_deposits_suitable"
  ],
  "pipe via intake should show common pipe questions plus the selected meter-specific NVE 2020 caveat"
);

const pipeAnswers = answers({
  legal_requirement_documented: pass,
  minimum_flow_requirement_lps: "flow_50_200_lps",
  requirement_pattern: "seasonal_or_conditional_requirement",
  release_solution_category: "pipe_via_intake",
  site_constraints: ["winter_ice_or_frost"],
  pipe_meter_type: "pipe_meter_electromagnetic",
  pipe_after_rack: pass,
  pipe_outlet_near_dam_or_threshold: pass,
  pipe_dry_frost_free: pass,
  pipe_full_through_meter: pass,
  pipe_air_handled: pass,
  pipe_straight_run_supplier_requirements: pass,
  pipe_electromagnetic_velocity_and_deposits_suitable: pass
});
const pipeDecision = calculateHydroGuideDecision(pipeAnswers);
assert.equal(pipeDecision.status, "ANBEFALT_KILDEFORANKRET");
assert.equal(pipeDecision.methodId, "pipe_via_intake_with_pipe_flow_meter");
assert.equal(pipeDecision.measurementMethodCode, "M1a");
assert.ok(pipeDecision.sourceRefs.length > 0);
assert.ok(pipeDecision.implicitObligations.length > 0);
assert.ok(ids(visibleHydroGuideCards(pipeAnswers)).includes("pipe_measurement"));

const legacyPipeFallbackDecision = calculateHydroGuideDecision(answers({
  legal_requirement_documented: pass,
  minimum_flow_requirement_lps: "flow_50_200_lps",
  requirement_pattern: "single_fixed_requirement",
  release_solution_category: "pipe_via_intake",
  site_constraints: ["none_documented"],
  pipe_after_rack: pass,
  pipe_outlet_near_dam_or_threshold: pass,
  pipe_dry_frost_free: pass,
  pipe_full_through_meter: pass,
  pipe_air_handled: pass,
  pipe_straight_run_supplier_requirements: pass
}));
assert.equal(legacyPipeFallbackDecision.status, "MULIG_MEN_MANGLER_STEDSSPESIFIKK_GRUNNLAG");
assert.equal(legacyPipeFallbackDecision.measurementMethodCode, "NONE");
assert.ok(legacyPipeFallbackDecision.missingDocumentation.includes("pipe_meter_type"));

const adpPipeDecision = calculateHydroGuideDecision(answers({
  legal_requirement_documented: pass,
  minimum_flow_requirement_lps: "flow_50_200_lps",
  requirement_pattern: "single_fixed_requirement",
  release_solution_category: "pipe_via_intake",
  site_constraints: ["none_documented"],
  pipe_meter_type: "pipe_meter_adp",
  pipe_after_rack: pass,
  pipe_outlet_near_dam_or_threshold: pass,
  pipe_dry_frost_free: pass,
  pipe_full_through_meter: fail,
  pipe_air_handled: pass,
  pipe_straight_run_supplier_requirements: pass,
  pipe_adp_geometry_and_velocity_distribution_documented: pass
}));
assert.equal(adpPipeDecision.status, "ANBEFALT_KILDEFORANKRET");
assert.equal(adpPipeDecision.measurementMethodCode, "M1d");
assert.equal(adpPipeDecision.criteriaNotSatisfied.includes("pipe_full_through_meter"), false);

const adpPipeWithAirDecision = calculateHydroGuideDecision(answers({
  legal_requirement_documented: pass,
  minimum_flow_requirement_lps: "flow_50_200_lps",
  requirement_pattern: "single_fixed_requirement",
  release_solution_category: "pipe_via_intake",
  site_constraints: ["none_documented"],
  pipe_meter_type: "pipe_meter_adp",
  pipe_after_rack: pass,
  pipe_outlet_near_dam_or_threshold: pass,
  pipe_dry_frost_free: pass,
  pipe_full_through_meter: fail,
  pipe_air_handled: fail,
  pipe_straight_run_supplier_requirements: pass,
  pipe_adp_geometry_and_velocity_distribution_documented: pass
}));
assert.equal(adpPipeWithAirDecision.status, "FRARADET_KILDEFORANKRET");
assert.ok(adpPipeWithAirDecision.criteriaNotSatisfied.includes("pipe_air_handled"));

const gateWithoutDownstreamDecision = calculateHydroGuideDecision(answers({
  legal_requirement_documented: pass,
  minimum_flow_requirement_lps: "flow_over_500_lps",
  requirement_pattern: "seasonal_or_conditional_requirement",
  release_solution_category: "gate",
  site_constraints: ["winter_ice_or_frost"],
  gate_electronic_level_or_opening: pass,
  gate_power_backup_winter_operation: pass
}));
assert.equal(gateWithoutDownstreamDecision.status, "MULIG_MEN_MANGLER_STEDSSPESIFIKK_GRUNNLAG");
assert.ok(gateWithoutDownstreamDecision.missingDocumentation.includes("dam_gate_opening_downstream_measurement"));

const artificialProfileWinterDecision = calculateHydroGuideDecision(answers({
  legal_requirement_documented: pass,
  minimum_flow_requirement_lps: "flow_200_500_lps",
  requirement_pattern: "single_fixed_requirement",
  release_solution_category: "opening_in_dam",
  site_constraints: ["winter_ice_or_frost"],
  theoretical_only_documentation: fail,
  dam_gate_opening_downstream_measurement: pass,
  opening_standard_profile: pass,
  opening_clogging_icing_protection: pass,
  opening_low_water_capacity: pass,
  artificial_profile_standard_construction: pass
}));
assert.equal(artificialProfileWinterDecision.status, "MULIG_MEN_MANGLER_STEDSSPESIFIKK_GRUNNLAG");
assert.ok(artificialProfileWinterDecision.missingDocumentation.includes("artificial_profile_ice_sediment_protection"));

const fishDecision = calculateHydroGuideDecision(answers({
  legal_requirement_documented: pass,
  minimum_flow_requirement_lps: "flow_50_200_lps",
  release_solution_category: "fish_passage",
  fish_passage_release_relevant: pass,
  fish_passage_independent_upstream_level: pass,
  fish_passage_measurement_no_barrier: fail
}));
assert.equal(fishDecision.status, "FRARADET_KILDEFORANKRET");
assert.equal(fishDecision.methodId, "fish_passage_release_and_measurement");
assert.ok(fishDecision.criteriaNotSatisfied.includes("fish_passage_measurement_no_barrier"));

const alternativeDecision = calculateHydroGuideDecision(answers({
  legal_requirement_documented: pass,
  minimum_flow_requirement_lps: "flow_0_50_lps",
  release_solution_category: "other_alternative",
  alternative_special_justification: missing
}));
assert.equal(alternativeDecision.status, "KREVER_SAERSKILT_BEGRUNNELSE_ELLER_NVE_AVKLARING");
assert.equal(alternativeDecision.methodId, "alternative_method_requires_nve_clarification");

console.log("PASS source anchored engine contract");
