import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";

const repoRoot = path.resolve(import.meta.dirname, "..");
const tempDir = await mkdtemp(path.join(tmpdir(), "hydroguide-source-engine-"));
const bundlePath = path.join(tempDir, "source-engine.mjs");

await build({
  entryPoints: [path.join(repoRoot, "src", "hydroguide", "sourceAnchoredDecision.ts")],
  outfile: bundlePath,
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

const pipeAnswers = answers({
  legal_requirement_documented: pass,
  minimum_flow_requirement_lps: 120,
  requirement_pattern: "seasonal_or_conditional_requirement",
  release_solution_category: "pipe_via_intake",
  site_constraints: ["winter_ice_or_frost"],
  pipe_after_rack: pass,
  pipe_dry_frost_free: pass,
  pipe_full_through_meter: pass,
  pipe_air_handled: pass,
  pipe_straight_run_supplier_requirements: pass,
  pipe_calibration_control: pass
});
const pipeDecision = calculateHydroGuideDecision(pipeAnswers);
assert.equal(pipeDecision.status, "ANBEFALT_KILDEFORANKRET");
assert.equal(pipeDecision.methodId, "pipe_via_intake_with_pipe_flow_meter");
assert.ok(pipeDecision.sourceRefs.length > 0);
assert.ok(pipeDecision.implicitObligations.length > 0);
assert.ok(ids(visibleHydroGuideCards(pipeAnswers)).includes("pipe_measurement"));

const fishDecision = calculateHydroGuideDecision(answers({
  legal_requirement_documented: pass,
  minimum_flow_requirement_lps: 90,
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
  minimum_flow_requirement_lps: 50,
  release_solution_category: "other_alternative",
  alternative_special_justification: missing
}));
assert.equal(alternativeDecision.status, "KREVER_SAERSKILT_BEGRUNNELSE_ELLER_NVE_AVKLARING");
assert.equal(alternativeDecision.methodId, "alternative_method_requires_nve_clarification");

console.log("PASS source anchored engine contract");
