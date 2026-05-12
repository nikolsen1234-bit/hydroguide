import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";

const repoRoot = path.resolve(import.meta.dirname, "..");
const tempDir = await mkdtemp(path.join(tmpdir(), "hydroguide-smoke-"));
const bundlePath = path.join(tempDir, "recommendation.mjs");
const configBundlePath = path.join(tempDir, "configuration.mjs");

await build({
  entryPoints: [path.join(repoRoot, "src", "utils", "recommendation.ts")],
  outfile: bundlePath,
  bundle: true,
  platform: "node",
  format: "esm",
  logLevel: "silent"
});

await build({
  entryPoints: [path.join(repoRoot, "src", "utils", "configuration.ts")],
  outfile: configBundlePath,
  bundle: true,
  platform: "node",
  format: "esm",
  logLevel: "silent"
});

const { calculateRecommendation } = await import(pathToFileURL(bundlePath));
const { normalizeConfiguration } = await import(pathToFileURL(configBundlePath));

const emptyAnswers = {
  q01ConcessionRequirement: "",
  q02ProjectType: "",
  q03FlowClass: "",
  q04RequirementPattern: "",
  q05PassAllInflowWhenLow: "",
  q06CanChangeRelease: "",
  q07ReleaseSolution: "",
  q08FishMigration: "",
  q09CoandaExists: "",
  q10SiteChallenges: [],
  q11PowerCommunication: [],
  q12PublicDisplay: [],
  q13AfterIntakeRack: "",
  q14DryFrostFreePlacement: "",
  q15ReturnNearDam: "",
  q16PipeCapacityLowWater: "",
  q17PipeFull: "",
  q18PipeAirFree: "",
  q19StraightRunCalmFlow: "",
  q20ValveDownstream: "",
  q21ServiceValveBefore: "",
  q22PipeGeometryType: "",
  q23ConductivityForMagmeter: "",
  q24UltrasonicMountPossible: "",
  q25AdpGeometryKnown: "",
  q26AirEntrainedAtMeasurement: "",
  q27RegulationFrequency: "",
  q28DownstreamPointPossible: "",
  q29NaturalStableProfile: "",
  q30StageDischargeUnique: "",
  q31ProfileStable: "",
  q32GoodWaterLevelResolution: "",
  q33WideShallowRiver: "",
  q34BackwaterAffects: "",
  q35RepresentativeSensorPlacement: "",
  q36StationFloodRobust: "",
  q37ArtificialProfilePossible: "",
  q38FallForArtificialProfile: "",
  q39ArtificialProfileBlocksFish: "",
  q40ArtificialProfileFlowClass: "",
  q41MultipleDistinctLevels: "",
  q42ArtificialProfileProtected: "",
  q43LevelSensorType: "",
  q44DamPipeBelowLrv: "",
  q45DamPipeCapacityMarginNoVortex: "",
  q46DamPipeSubmergedNoSediment: "",
  q47TheoryOnlyDocumentation: "",
  q48GateLevelOpeningElectronic: "",
  q49GatePowerBackup: "",
  q50GateIceDebrisManageable: "",
  q51OpeningStandardProfile: "",
  q52OpeningProtected: "",
  q53OpeningMeetsLowWater: "",
  q54OpeningShape: "",
  q55FishPassageReleaseShare: "",
  q56FishPassageIndependentUpstream: "",
  q57MeasurementNoFishBarrier: "",
  q58FlowSplitFishAndOther: "",
  q59AttractionWaterNeed: "",
  q60CoandaReturnPoint: "",
  q61CoandaTakeoff: "",
  q62CoandaFlowClass: "",
  q63CoandaAirEntrained: "",
  q64CoandaLittleFall: "",
  q65HourlyAutomaticLogging: "",
  q66AccuracyWithinFivePercent: "",
  q67CompletenessNinetySevenPercent: "",
  q68SecureDataStorageForNve: "",
  q69AlternativeMethod: "",
  q70NveApprovalForAlternative: ""
};

const nveReady = {
  q65HourlyAutomaticLogging: "yes",
  q66AccuracyWithinFivePercent: "yes",
  q67CompletenessNinetySevenPercent: "yes",
  q68SecureDataStorageForNve: "yes",
  q69AlternativeMethod: "no"
};

const naturalProfile = {
  q28DownstreamPointPossible: "yes",
  q29NaturalStableProfile: "yes",
  q30StageDischargeUnique: "yes",
  q31ProfileStable: "yes",
  q32GoodWaterLevelResolution: "yes",
  q34BackwaterAffects: "no",
  q35RepresentativeSensorPlacement: "yes",
  q36StationFloodRobust: "yes"
};

const scenarios = [
  {
    name: "pipe intake gives electromagnetic pipe meter",
    answers: {
      q03FlowClass: "0_50",
      q06CanChangeRelease: "yes",
      q07ReleaseSolution: "pipeIntake",
      q08FishMigration: "no",
      q09CoandaExists: "no",
      q10SiteChallenges: ["freezing"],
      q11PowerCommunication: ["solarBattery", "mobileCoverage"],
      q13AfterIntakeRack: "yes",
      q14DryFrostFreePlacement: "protectedSump",
      q16PipeCapacityLowWater: "yes",
      q17PipeFull: "yes",
      q18PipeAirFree: "yes",
      q19StraightRunCalmFlow: "yes",
      q22PipeGeometryType: "fullPressurePipe",
      q23ConductivityForMagmeter: "yes",
      q24UltrasonicMountPossible: "yes",
      q25AdpGeometryKnown: "yes",
      q26AirEntrainedAtMeasurement: "no",
      ...nveReady
    },
    expected: { methodCode: "S1+M1a", decisionStatus: "ANBEFALT", status: "Recommended" }
  },
  {
    name: "pipe through dam keeps release-specific profile",
    answers: {
      q03FlowClass: "50_200",
      q07ReleaseSolution: "pipeThroughDam",
      q08FishMigration: "no",
      q09CoandaExists: "no",
      q10SiteChallenges: ["noneKnown"],
      q11PowerCommunication: ["gridPower", "mobileCoverage"],
      ...naturalProfile,
      q44DamPipeBelowLrv: "yes",
      q45DamPipeCapacityMarginNoVortex: "yes",
      q46DamPipeSubmergedNoSediment: "yes",
      q47TheoryOnlyDocumentation: "no",
      ...nveReady
    },
    expected: { methodCode: "S2+M2", decisionStatus: "ANBEFALT", status: "Recommended" }
  },
  {
    name: "large gate keeps release-specific profile",
    answers: {
      q03FlowClass: "1000_2000",
      q07ReleaseSolution: "gate",
      q08FishMigration: "no",
      q09CoandaExists: "no",
      q10SiteChallenges: ["noneKnown"],
      q11PowerCommunication: ["gridPower", "mobileCoverage"],
      ...naturalProfile,
      q47TheoryOnlyDocumentation: "no",
      q48GateLevelOpeningElectronic: "yes",
      ...nveReady
    },
    expected: { methodCode: "S3+M2", decisionStatus: "ANBEFALT", status: "Recommended" }
  },
  {
    name: "fish passage gives fish hydraulic measurement",
    answers: {
      q03FlowClass: "50_200",
      q07ReleaseSolution: "fishPassage",
      q08FishMigration: "both",
      q09CoandaExists: "no",
      q10SiteChallenges: ["noneKnown"],
      q11PowerCommunication: ["solarBattery", "mobileCoverage"],
      q55FishPassageReleaseShare: "whole",
      q56FishPassageIndependentUpstream: "yes",
      q57MeasurementNoFishBarrier: "yes",
      q58FlowSplitFishAndOther: "no",
      ...nveReady
    },
    expected: { methodCode: "S5+M6", decisionStatus: "ANBEFALT", status: "Recommended" }
  },
  {
    name: "bad coanda remains not NVE-ready",
    answers: {
      q03FlowClass: "50_200",
      q07ReleaseSolution: "coandaSpecific",
      q08FishMigration: "no",
      q09CoandaExists: "yes",
      q10SiteChallenges: ["ice", "debris"],
      q11PowerCommunication: ["solarBattery"],
      q60CoandaReturnPoint: "severalMetersDownstream",
      q61CoandaTakeoff: "collectionSumpUnderScreen",
      q62CoandaFlowClass: "50_200",
      q63CoandaAirEntrained: "yes",
      q64CoandaLittleFall: "no",
      ...nveReady
    },
    expected: { methodCode: "S6+M7", decisionStatus: "IKKE_NVE_KLAR", status: "NeedsReview" }
  }
];

const results = scenarios.map((scenario) => {
  const recommendation = calculateRecommendation({ ...emptyAnswers, ...scenario.answers });
  return {
    name: scenario.name,
    methodCode: recommendation.methodCode,
    decisionStatus: recommendation.decisionStatus,
    status: recommendation.status,
    missing: recommendation.missingForFinalChoice ?? [],
    pass:
      recommendation.methodCode === scenario.expected.methodCode &&
      recommendation.decisionStatus === scenario.expected.decisionStatus &&
      recommendation.status === scenario.expected.status
  };
});

await writeFile(path.join(tempDir, "results.json"), JSON.stringify(results, null, 2));

for (const result of results) {
  const marker = result.pass ? "PASS" : "FAIL";
  console.log(`${marker} ${result.name}: ${result.methodCode} / ${result.decisionStatus} / ${result.status}`);
  if (!result.pass || result.missing.length > 0) {
    console.log(`  missing: ${result.missing.join("; ") || "none"}`);
  }
}

const hydroGuideExample = normalizeConfiguration(
  JSON.parse(await readFile(path.join(repoRoot, "public", "HydroGuide.txt"), "utf8")),
  0
);
const calculatorExample = normalizeConfiguration(
  JSON.parse(await readFile(path.join(repoRoot, "public", "Kalkulator.txt"), "utf8")),
  0
);
const exampleResults = [
  {
    name: "HydroGuide example import",
    pass:
      hydroGuideExample.engineMode === "hydroguide" &&
      hydroGuideExample.lastRecommendation?.methodCode === "S1+M1a" &&
      hydroGuideExample.lastRecommendation?.decisionStatus === "ANBEFALT",
    detail: `${hydroGuideExample.engineMode} / ${hydroGuideExample.lastRecommendation?.methodCode ?? "none"} / ${hydroGuideExample.lastRecommendation?.decisionStatus ?? "none"}`
  },
  {
    name: "Calculator example import",
    pass: calculatorExample.engineMode === "calculator" && calculatorExample.answers.q03FlowClass === "",
    detail: `${calculatorExample.engineMode} / answers.q03FlowClass=${calculatorExample.answers.q03FlowClass || "empty"}`
  }
];

for (const result of exampleResults) {
  console.log(`${result.pass ? "PASS" : "FAIL"} ${result.name}: ${result.detail}`);
}

if (results.some((result) => !result.pass) || exampleResults.some((result) => !result.pass)) {
  process.exitCode = 1;
}
