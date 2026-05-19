import {
  buildSourceAnchoredReportSummary,
  calculateHydroGuideDecision,
  hydroGuideMethodCandidates,
  nveSourceRegister
} from "../hydroguide/sourceAnchoredDecision";
import { Answers, ConfidenceStatus, DecisionStatus, MeasurementMethodCode, MethodSummary, Recommendation, ReleaseSolutionCode } from "../types";
import { dedupe } from "./format";

function confidenceFromDecision(status: DecisionStatus): ConfidenceStatus {
  if (status === "ANBEFALT_KILDEFORANKRET") return "Recommended";
  if (status === "FRARADET_KILDEFORANKRET") return "NeedsReview";
  return "NeedsClarification";
}

function sourceLabel(sourceId: string): string {
  const source = nveSourceRegister[sourceId as keyof typeof nveSourceRegister];
  return source ? `${source.documentTitle}, pkt. ${source.section}` : sourceId;
}

function shortSourceTitle(documentTitle: string): string {
  if (documentTitle.startsWith("NVE Veileder nr. 3/2020")) return "NVE veileder 3/2020";
  if (documentTitle.startsWith("Retningslinje for registrering av konsesjonspålagte minstevannføringer")) {
    return "Retningslinje minstevannføring 12.02.24";
  }
  if (documentTitle.startsWith("Retningslinje for registrering av vannføring i elver")) {
    return "Retningslinje vannføring i elver 12.02.24";
  }
  return documentTitle;
}

function sourceList(sourceIds: string[]): string {
  const grouped = new Map<string, string[]>();
  const unknown: string[] = [];

  for (const sourceId of sourceIds) {
    const source = nveSourceRegister[sourceId as keyof typeof nveSourceRegister];
    if (!source) {
      unknown.push(sourceId);
      continue;
    }

    const title = shortSourceTitle(source.documentTitle);
    grouped.set(title, [...(grouped.get(title) ?? []), source.section]);
  }

  return [
    ...Array.from(grouped.entries()).map(([title, sections]) => `${title} pkt. ${dedupe(sections).join(", ")}`),
    ...unknown
  ].join("; ");
}

function criterionLabel(item: { title: string; sourceRefs: string[] }): string {
  const refs = sourceList(item.sourceRefs);
  return refs ? `${item.title} (${refs})` : item.title;
}

const MEASUREMENT_METHOD_LABELS: Partial<Record<MeasurementMethodCode, string>> = {
  M1: "Direkte vannføringsmåler i rør",
  M1a: "Elektromagnetisk vannmåler",
  M1b: "Ultralydmåler i rør",
  M1c: "Måleblende/måledyse",
  M1d: "ADP i rør/kanal",
  M2: "Vannstand + vannføringskurve i naturlig elveprofil",
  M3: "Vannstand + kunstig V-profil",
  M4: "Vannstand + rektangulært/sammensatt profil",
  M5: "Vannstand + Crump-overløp",
  M6: "Vannstand/lukeåpning + nedstrøms måleprofil",
  M7: "Vannstand ved utsparing + nedstrøms måleprofil",
  M8: "Alternativ metode må avklares",
  X1: "Måleprinsipp må fastsettes",
  X2: "Måleprinsipp må fastsettes"
};

function displayMeasurementMethod(code: MeasurementMethodCode | undefined): string {
  if (!code || code === "NONE") {
    return "Måleprinsipp må fastsettes fra kildeforankrede kriterier";
  }

  return MEASUREMENT_METHOD_LABELS[code] ?? "Måleprinsipp må fastsettes";
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
    reason: sourceList(method.sourceRefs)
  };
}

export function calculateRecommendation(answers: Answers): Recommendation {
  const decision = calculateHydroGuideDecision(answers);
  const summary = buildSourceAnchoredReportSummary(decision);
  const selectedMethod = hydroGuideMethodCandidates.find((item) => item.id === decision.methodId);
  const releaseSolutionCode = (decision.releaseSolutionCode ?? selectedMethod?.releaseSolutionCode) as ReleaseSolutionCode | undefined;
  const measurementMethodCode = (decision.measurementMethodCode ?? selectedMethod?.measurementMethodCode) as MeasurementMethodCode | undefined;
  const alternatives = hydroGuideMethodCandidates
    .filter((item) => item.id !== decision.methodId && item.id !== "intake_alternative")
    .map((item) => methodSummary(item.id))
    .filter((item): item is MethodSummary => Boolean(item));

  return {
    mainSolution: decision.methodLabel,
    controlMeasurementMethod: displayMeasurementMethod(measurementMethodCode),
    justification: [decision.explanation, ...decision.sourceRefs.slice(0, 6).map((sourceId) => `Kilde: ${sourceLabel(sourceId)}`)],
    additionalRequirements: [
      ...summary.missingDocumentation.map((item) => `Mangler dokumentasjon: ${criterionLabel(item)}`),
      ...summary.failedCriteria.map((item) => `Svar Nei: ${criterionLabel(item)}`),
      ...decision.warnings.map((item) => `${item.title} (${sourceList(item.sourceRefs)})`),
      ...summary.implicitObligations.map((item) => `${item.obligationText} (${sourceList(item.sourceRefs)})`)
    ],
    status: confidenceFromDecision(decision.status),
    decisionStatus: decision.status,
    releaseSolutionCode,
    releaseSolutionName: selectedMethod?.label,
    measurementMethodCode,
    measurementMethodName: displayMeasurementMethod(measurementMethodCode),
    methodCode: decision.methodId,
    methodName: decision.methodLabel,
    rank: selectedMethod ? hydroGuideMethodCandidates.indexOf(selectedMethod) + 1 : undefined,
    nveAnchors: decision.sourceRefs,
    sourceRefs: decision.sourceRefs,
    criteriaSatisfied: summary.satisfiedCriteria.map(criterionLabel),
    criteriaNotSatisfied: summary.failedCriteria.map(criterionLabel),
    missingDocumentation: summary.missingDocumentation.map(criterionLabel),
    explanationSourceRefs: decision.explanationSourceRefs,
    alternatives,
    discouragedMethods: decision.warnings.map((item) => ({ methodCode: item.id, methodName: item.title, reason: sourceList(item.sourceRefs) })),
    missingForFinalChoice: summary.missingDocumentation.map(criterionLabel),
    documentationRequirements: summary.sourceReferences.map((source) => `${source.documentTitle}, pkt. ${source.section}: ${source.shortParaphrase}`),
    silentNveRequirements: summary.implicitObligations.map((item) => `${item.obligationText} (${sourceList(item.sourceRefs)})`)
  };
}
