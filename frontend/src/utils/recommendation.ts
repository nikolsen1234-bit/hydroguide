import { FLOW_THRESHOLDS } from "../constants";
import { Answers, ConfidenceStatus, Recommendation } from "../types";
import { dedupe } from "./format";

type FlowBand = "small" | "medium" | "large";
type VariationBand = "low" | "high";
const LOW_FLOW_THRESHOLD = 2;

function classifyFlow(flow: number): FlowBand {
  if (flow <= FLOW_THRESHOLDS.smallMax) return "small";
  if (flow <= FLOW_THRESHOLDS.mediumMax) return "medium";
  return "large";
}

function classifyVariation(answers: Answers): VariationBand {
  return answers.q3ReleaseRequirementVariation === "seasonal" || answers.q3ReleaseRequirementVariation === "inflowControlled"
    ? "high"
    : "low";
}

function isInfrequentInspections(inspectionsPerYear: number | ""): boolean {
  const v = typeof inspectionsPerYear === "number" && Number.isFinite(inspectionsPerYear) && inspectionsPerYear >= 0
    ? inspectionsPerYear
    : Infinity;
  return v <= 4;
}

function resolveControlMethod(answers: Answers): string {
  const flow = Number(answers.q2HighestRequiredMinFlow);
  if (
    Number.isFinite(flow) &&
    flow <= LOW_FLOW_THRESHOLD &&
    (answers.q4ReleaseMethod === "pipeFrostFree" || answers.q4ReleaseMethod === "pipeNoFrostFree")
  ) {
    return "Volum/tid-måling i beholder";
  }
  if (answers.q8MeasurementProfile === "naturalStable") {
    return "Kontroll i naturlig måleprofil nedstrøms";
  }
  if (answers.q8MeasurementProfile === "canBuildArtificial") {
    return "Kontroll i kunstig bygget måleprofil nedstrøms";
  }
  return "Trenger nærmere prosjektering";
}

function deriveMainSolution(answers: Answers, inspectionsPerYear: number | ""): string {
  const hasVariation =
    answers.q3ReleaseRequirementVariation === "seasonal" || answers.q3ReleaseRequirementVariation === "inflowControlled";
  const needsProtection =
    answers.q5IsSedimentClogging === "yes" || isInfrequentInspections(inspectionsPerYear);

  if (answers.q4ReleaseMethod === "pipeFrostFree") {
    if (hasVariation) {
      return needsProtection
        ? "Rørslipp i frostfritt rom med aktiv reguleringsventil, grovfilter og mengdemåler"
        : "Rørslipp i frostfritt rom med aktiv reguleringsventil og mengdemåler";
    }
    return needsProtection
      ? "Rørslipp i frostfritt rom med fast struping, selvrensende inntak og mengdemåler"
      : "Rørslipp i frostfritt rom med fast struping og mengdemåler";
  }

  if (answers.q4ReleaseMethod === "pipeNoFrostFree") {
    if (hasVariation) {
      return needsProtection
        ? "Rørslipp gjennom dam med aktiv reguleringsventil, grovfilter og mengdemåler"
        : "Rørslipp gjennom dam med aktiv reguleringsventil og mengdemåler";
    }
    return needsProtection
      ? "Rørslipp gjennom dam med fast struping og mengdemåler"
      : "Rørslipp gjennom dam med fast struping og mengdemåler";
  }

  if (answers.q4ReleaseMethod === "directRiverbed") {
    return needsProtection
      ? "Elveslipp med skjermet måleseksjon og vern mot is/drivgods"
      : "Elveslipp med definert målepunkt i naturlig elveleie";
  }

  if (hasVariation && needsProtection) {
    return "Reguleringskum med automatisk ventil, selvrensende innløp og skjermet måleseksjon";
  }
  if (hasVariation) {
    return "Aktivt regulerbar slipp-løsning med ventil og stabilisert måleseksjon";
  }
  if (needsProtection) {
    return "Passiv slipp-løsning med lav driftsbelastning og vern mot is/drivgods";
  }
  return "Standard slipp-løsning med fast regulering og definert målepunkt";
}

function deriveStatus(answers: Answers, controlMethod: string): ConfidenceStatus {
  if (controlMethod === "Trenger nærmere prosjektering") return "NeedsClarification";
  if (answers.q8MeasurementProfile === "noSuitableProfile") return "NeedsReview";
  return "Recommended";
}

export function calculateRecommendation(answers: Answers, inspectionsPerYear: number | "" = ""): Recommendation {
  const flow = Number(answers.q2HighestRequiredMinFlow);
  const flowBand = classifyFlow(flow);
  const variation = classifyVariation(answers);
  const hasVariation =
    answers.q3ReleaseRequirementVariation === "seasonal" || answers.q3ReleaseRequirementVariation === "inflowControlled";
  const needsProtection =
    answers.q5IsSedimentClogging === "yes" || isInfrequentInspections(inspectionsPerYear);
  const controlMethod = resolveControlMethod(answers);
  const highFlowPipe =
    Number.isFinite(flow) &&
    flow > LOW_FLOW_THRESHOLD &&
    (answers.q4ReleaseMethod === "pipeFrostFree" || answers.q4ReleaseMethod === "pipeNoFrostFree");

  const justification = dedupe(
    [
      answers.q1FacilityType === "existing"
        ? "Eksisterende anlegg - vurder å bygge videre på eksisterende infrastruktur"
        : "",
      answers.q1FacilityType === "conversion"
        ? "Ombygging - eksisterende slipp- og målearrangement bør vurderes før nytt arrangement prosjekteres"
        : "",
      `Minstevannføring er klassifisert som ${flowBand} med ${variation} variasjon`,
      answers.q4ReleaseMethod === "pipeFrostFree"
        ? "Frostfritt uttak etter varegrind gir prioritet til rørslipp med intern måling"
        : answers.q4ReleaseMethod === "pipeNoFrostFree"
          ? "Rørslipp gjennom dam uten frostfritt rom krever ekstra vern mot frost og fukt"
          : answers.q4ReleaseMethod === "directRiverbed"
            ? "Elveinntak gir slipp direkte i elveleie - krever skjermet eller stabilt målepunkt nedstrøms"
            : "Utvendig slipp via luke, utsparing eller overløp krever kontrollert målepunkt nedstrøms",
      hasVariation
        ? "Regelkravene krever aktiv regulering gjennom året"
        : "Regelkravene åpner for enklere fast regulering",
      highFlowPipe
        ? `Volum/tid-måling i beholder er ikke vurdert som egnet når vannføringen overstiger ${LOW_FLOW_THRESHOLD} l/s`
        : "",
      needsProtection
        ? "NVE 3/2020 legger vekt på driftssikkert arrangement ved vinterforhold, tilstopping og perioder med lav tilsynshyppighet"
        : "Driftsforholdene tillater standard løsning uten særlige vinter- og tilsynstiltak",
      `Kontrollmålemetode er valgt etter prioritert regelrekkefølge: ${controlMethod.toLowerCase()}`
    ].filter(Boolean)
  ).slice(0, 5);

  const additionalRequirements = dedupe(
    [
      answers.q6FishPassage === "yes"
        ? "Løsningen skal integreres med krav til fiskepassasje"
        : "",
      answers.q7BypassOnOutage === "yes"
        ? "Bypass/slipp skal fungere uavhengig av turbindrift"
        : "",
      answers.q9PublicControl === "yes"
        ? "Allmennheten skal kunne kontrollere minstevannføringen via synlig visning, skilt eller målestav"
        : "",
      answers.q8MeasurementProfile === "canBuildArtificial"
        ? "Det skal bygges kunstig måleprofil nedstrøms slippstedet"
        : "",
      needsProtection
        ? "Materialvalg og geometri skal tåle is, drivgods, sediment og lav tilsynsfrekvens"
        : "",
      hasVariation
        ? "Regulering skal kunne gjennomføres trygt og sporbart ved hyppige endringer"
        : ""
    ].filter(Boolean)
  );

  return {
    mainSolution: deriveMainSolution(answers, inspectionsPerYear),
    controlMeasurementMethod: controlMethod,
    justification,
    additionalRequirements,
    status: deriveStatus(answers, controlMethod)
  };
}
