import {
  buildSourceAnchoredReportSummary,
  calculateHydroGuideDecision,
  hydroGuideMethodCandidates,
  nveSourceRegister
} from "../hydroguide/sourceAnchoredDecision";
import { Answers, ConfidenceStatus, DecisionStatus, MeasurementMethodCode, MethodSummary, Recommendation, ReleaseSolutionCode } from "../types";

function confidenceFromDecision(status: DecisionStatus): ConfidenceStatus {
  if (status === "ANBEFALT_KILDEFORANKRET") return "Recommended";
  if (status === "FRARADET_KILDEFORANKRET") return "NeedsReview";
  return "NeedsClarification";
}

function sourceLabel(sourceId: string): string {
  const source = nveSourceRegister[sourceId as keyof typeof nveSourceRegister];
  return source ? `${source.documentTitle}, pkt. ${source.section}` : sourceId;
}

function methodSummary(methodId: string): MethodSummary | null {
  const method = hydroGuideMethodCandidates.find((item) => item.id === methodId);
  if (!method) return null;
  return {
    releaseSolutionCode: method.releaseSolutionCode as ReleaseSolutionCode | undefined,
    measurementMethodCode: method.measurementMethodCode as MeasurementMethodCode,
    methodCode: method.id,
    methodName: method.label,
    solutionName: method.label,
    rank: hydroGuideMethodCandidates.indexOf(method) + 1,
    nveAnchors: method.sourceRefs,
    reason: method.sourceRefs.map(sourceLabel).join("; ")
  };
}

export function calculateRecommendation(answers: Answers): Recommendation {
  const decision = calculateHydroGuideDecision(answers);
  const summary = buildSourceAnchoredReportSummary(decision);
  const selectedMethod = hydroGuideMethodCandidates.find((item) => item.id === decision.methodId);
  const alternatives = hydroGuideMethodCandidates
    .filter((item) => item.id !== decision.methodId && item.id !== "alternative_method_requires_nve_clarification")
    .map((item) => methodSummary(item.id))
    .filter((item): item is MethodSummary => Boolean(item));

  return {
    mainSolution: `${decision.methodId} - ${decision.methodLabel}`,
    controlMeasurementMethod: selectedMethod?.measurementMethodCode ?? "Måleprinsipp må fastsettes fra kildeforankrede kriterier",
    justification: [decision.explanation, ...decision.sourceRefs.slice(0, 6).map((sourceId) => `Kilde: ${sourceLabel(sourceId)}`)],
    additionalRequirements: [
      ...summary.missingDocumentation.map((item) => `Mangler dokumentasjon: ${item.title} (${item.sourceRefs.join(", ")})`),
      ...summary.failedCriteria.map((item) => `Dokumentert ikke oppfylt: ${item.title} (${item.sourceRefs.join(", ")})`),
      ...decision.warnings.map((item) => `${item.title} (${item.sourceRefs.join(", ")})`),
      ...summary.implicitObligations.map((item) => `${item.obligationText} (${item.sourceRefs.join(", ")})`)
    ],
    status: confidenceFromDecision(decision.status),
    decisionStatus: decision.status,
    releaseSolutionCode: selectedMethod?.releaseSolutionCode as ReleaseSolutionCode | undefined,
    releaseSolutionName: selectedMethod?.label,
    measurementMethodCode: selectedMethod?.measurementMethodCode as MeasurementMethodCode | undefined,
    measurementMethodName: selectedMethod?.measurementMethodCode,
    methodCode: decision.methodId,
    methodName: decision.methodLabel,
    rank: selectedMethod ? hydroGuideMethodCandidates.indexOf(selectedMethod) + 1 : undefined,
    nveAnchors: decision.sourceRefs,
    sourceRefs: decision.sourceRefs,
    criteriaSatisfied: decision.criteriaSatisfied,
    criteriaNotSatisfied: decision.criteriaNotSatisfied,
    missingDocumentation: decision.missingDocumentation,
    explanationSourceRefs: decision.explanationSourceRefs,
    alternatives,
    discouragedMethods: decision.warnings.map((item) => ({ methodCode: item.id, methodName: item.title, reason: item.sourceRefs.map(sourceLabel).join("; ") })),
    missingForFinalChoice: summary.missingDocumentation.map((item) => `${item.title} (${item.sourceRefs.join(", ")})`),
    documentationRequirements: summary.sourceReferences.map((source) => `${source.documentTitle}, pkt. ${source.section}: ${source.shortParaphrase}`),
    silentNveRequirements: summary.implicitObligations.map((item) => `${item.obligationText} (${item.sourceRefs.join(", ")})`)
  };
}
