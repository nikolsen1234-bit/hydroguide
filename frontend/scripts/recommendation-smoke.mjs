import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";

const repoRoot = path.resolve(import.meta.dirname, "..");
const tempDir = await mkdtemp(path.join(tmpdir(), "hydroguide-recommendation-smoke-"));
const bundlePath = path.join(tempDir, "recommendation.mjs");
const engineBundlePath = path.join(tempDir, "source-engine.mjs");

await build({
  entryPoints: [path.join(repoRoot, "src", "utils", "recommendation.ts")],
  outfile: bundlePath,
  bundle: true,
  platform: "node",
  format: "esm",
  logLevel: "silent"
});

await build({
  entryPoints: [path.join(repoRoot, "src", "hydroguide", "sourceAnchoredDecision.ts")],
  outfile: engineBundlePath,
  bundle: true,
  platform: "node",
  format: "esm",
  logLevel: "silent"
});

const { calculateRecommendation } = await import(pathToFileURL(bundlePath));
const { createEmptyHydroGuideAnswers } = await import(pathToFileURL(engineBundlePath));

const pass = "documented_satisfies_source_criterion";
const fail = "documented_does_not_satisfy_source_criterion";
const missing = "not_documented_yet";

function answers(overrides) {
  return { ...createEmptyHydroGuideAnswers(), ...overrides };
}

const scenarios = [
  {
    name: "pipe via intake source-backed ready",
    answers: answers({
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
    }),
    expected: { methodCode: "pipe_via_intake_with_pipe_flow_meter", measurementMethodCode: "M1a", decisionStatus: "ANBEFALT_KILDEFORANKRET", status: "Recommended" }
  },
  {
    name: "pipe through dam theoretical-only remains missing documentation",
    answers: answers({
      legal_requirement_documented: pass,
      minimum_flow_requirement_lps: "flow_50_200_lps",
      requirement_pattern: "single_fixed_requirement",
      release_solution_category: "pipe_through_dam",
      site_constraints: ["none_documented"],
      dam_pipe_below_lrv: pass,
      dam_pipe_capacity_margin_no_vortex: pass,
      dam_pipe_sediment_blocking_handled: pass,
      dam_gate_opening_downstream_measurement: pass,
      theoretical_only_documentation: pass
    }),
    expected: { methodCode: "pipe_through_dam_with_downstream_profile", decisionStatus: "MULIG_MEN_MANGLER_STEDSSPESIFIKK_GRUNNLAG", status: "NeedsClarification" }
  },
  {
    name: "fish passage barrier is rejected",
    answers: answers({
      legal_requirement_documented: pass,
      minimum_flow_requirement_lps: "flow_50_200_lps",
      release_solution_category: "fish_passage",
      fish_passage_release_relevant: pass,
      fish_passage_independent_upstream_level: pass,
      fish_passage_measurement_no_barrier: fail
    }),
    expected: { methodCode: "fish_passage_release_and_measurement", decisionStatus: "FRARADET_KILDEFORANKRET", status: "NeedsReview" }
  },
  {
    name: "alternative method requires NVE clarification",
    answers: answers({
      legal_requirement_documented: pass,
      minimum_flow_requirement_lps: "flow_0_50_lps",
      release_solution_category: "other_alternative",
      alternative_special_justification: missing
    }),
    expected: { methodCode: "alternative_method_requires_nve_clarification", decisionStatus: "KREVER_SAERSKILT_BEGRUNNELSE_ELLER_NVE_AVKLARING", status: "NeedsClarification" }
  }
];

const internalTagPattern = /\b(?:NVE_[A-Z0-9_]+|[a-z]+(?:_[a-z0-9]+){2,})\b/;

function visibleRecommendationText(recommendation) {
  return [
    recommendation.mainSolution,
    recommendation.controlMeasurementMethod,
    ...(recommendation.justification ?? []),
    ...(recommendation.additionalRequirements ?? []),
    ...(recommendation.missingForFinalChoice ?? []),
    ...(recommendation.documentationRequirements ?? []),
    ...(recommendation.silentNveRequirements ?? []),
    ...(recommendation.alternatives ?? []).flatMap((item) => [item.methodName, item.solutionName, item.reason]),
    ...(recommendation.discouragedMethods ?? []).flatMap((item) => [item.methodName, item.reason])
  ]
    .filter(Boolean)
    .join("\n");
}

const results = scenarios.map((scenario) => {
  const recommendation = calculateRecommendation(scenario.answers);
  const visibleText = visibleRecommendationText(recommendation);
  return {
    name: scenario.name,
    methodCode: recommendation.methodCode,
    decisionStatus: recommendation.decisionStatus,
    status: recommendation.status,
    measurementMethodCode: recommendation.measurementMethodCode,
    mainSolution: recommendation.mainSolution,
    sources: recommendation.sourceRefs ?? [],
    visibleInternalTag: visibleText.match(internalTagPattern)?.[0] ?? "",
    pass:
      recommendation.methodCode === scenario.expected.methodCode &&
      (!scenario.expected.measurementMethodCode || recommendation.measurementMethodCode === scenario.expected.measurementMethodCode) &&
      recommendation.decisionStatus === scenario.expected.decisionStatus &&
      recommendation.status === scenario.expected.status &&
      !recommendation.mainSolution.includes(recommendation.methodCode ?? "") &&
      (recommendation.sourceRefs ?? []).length > 0 &&
      !internalTagPattern.test(visibleText)
  };
});

for (const result of results) {
  const marker = result.pass ? "PASS" : "FAIL";
  const tagNote = result.visibleInternalTag ? ` / visibleInternalTag=${result.visibleInternalTag}` : "";
  console.log(`${marker} ${result.name}: ${result.methodCode} / ${result.measurementMethodCode} / ${result.decisionStatus} / ${result.status} / sources=${result.sources.join(",")}${tagNote}`);
}

if (results.some((result) => !result.pass)) {
  process.exitCode = 1;
}
