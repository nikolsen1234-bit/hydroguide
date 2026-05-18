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
      has_requirement: pass,
      flow_requirement: "flow_50_200",
      requirement_variation: "seasonal",
      release_method: "intake_pipe",
      doc_method: "doc_direct_flow",
      site_factors: ["site_ice_frost"],
      report_freq: "freq_hourly",
      redundancy: "redundancy_no"
    }),
    expected: {
      methodCode: "intake_pipe",
      measurementMethodCode: "M1",
      controlMeasurementMethod: "Direkte vannføringsmåler i rør",
      decisionStatus: "ANBEFALT_KILDEFORANKRET",
      status: "Recommended"
    }
  },
  {
    name: "pipe through dam without documentation method remains missing context",
    answers: answers({
      has_requirement: pass,
      flow_requirement: "flow_50_200",
      requirement_variation: "year_round",
      release_method: "intake_dam_pipe",
      doc_method: "unknown",
      site_factors: ["site_none"],
      report_freq: "freq_hourly",
      redundancy: "redundancy_no"
    }),
    expected: { methodCode: "intake_dam_pipe", decisionStatus: "MULIG_MEN_MANGLER_STEDSSPESIFIKK_GRUNNLAG", status: "NeedsClarification" }
  },
  {
    name: "fish passage flagged as not satisfied",
    answers: answers({
      has_requirement: fail,
      flow_requirement: "flow_50_200",
      release_method: "intake_fish_passage",
      doc_method: "doc_level_to_flow",
      report_freq: "freq_hourly",
      redundancy: "redundancy_no"
    }),
    expected: { methodCode: "intake_fish_passage", decisionStatus: "FRARADET_KILDEFORANKRET", status: "NeedsReview" }
  },
  {
    name: "alternative method requires NVE clarification",
    answers: answers({
      has_requirement: pass,
      flow_requirement: "flow_0_50",
      release_method: "intake_alternative"
    }),
    expected: { methodCode: "intake_alternative", decisionStatus: "KREVER_SAERSKILT_BEGRUNNELSE_ELLER_NVE_AVKLARING", status: "NeedsClarification" }
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
    controlMeasurementMethod: recommendation.controlMeasurementMethod,
    mainSolution: recommendation.mainSolution,
    sources: recommendation.sourceRefs ?? [],
    visibleInternalTag: visibleText.match(internalTagPattern)?.[0] ?? "",
    pass:
      recommendation.methodCode === scenario.expected.methodCode &&
      (!scenario.expected.measurementMethodCode || recommendation.measurementMethodCode === scenario.expected.measurementMethodCode) &&
      (!scenario.expected.controlMeasurementMethod || recommendation.controlMeasurementMethod === scenario.expected.controlMeasurementMethod) &&
      recommendation.measurementMethodName === recommendation.controlMeasurementMethod &&
      !/^M\d/.test(recommendation.controlMeasurementMethod) &&
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
  console.log(`${marker} ${result.name}: ${result.methodCode} / ${result.measurementMethodCode} / ${result.controlMeasurementMethod} / ${result.decisionStatus} / ${result.status} / sources=${result.sources.join(",")}${tagNote}`);
}

if (results.some((result) => !result.pass)) {
  process.exitCode = 1;
}
