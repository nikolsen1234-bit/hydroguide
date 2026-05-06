import { FLOW_THRESHOLDS } from "../constants";
import { Answers, ConfidenceStatus, Recommendation } from "../types";
import { dedupe } from "./format";

type FlowBand = "liten" | "middels" | "stor";
type VariationBand = "lav" | "høy";
const LOW_FLOW_THRESHOLD = 2;

function classifyFlow(flow: number): FlowBand {
  if (flow <= FLOW_THRESHOLDS.smallMax) return "liten";
  if (flow <= FLOW_THRESHOLDS.mediumMax) return "middels";
  return "stor";
}

function classifyVariation(answers: Answers): VariationBand {
  return answers.q3Slippkravvariasjon === "sesongkrav" || answers.q3Slippkravvariasjon === "tilsigsstyrt"
    ? "høy"
    : "lav";
}

function isInfrequentInspections(inspectionsPerYear: number | ""): boolean {
  const v = typeof inspectionsPerYear === "number" && Number.isFinite(inspectionsPerYear) && inspectionsPerYear >= 0
    ? inspectionsPerYear
    : Infinity;
  return v <= 4;
}

function resolveControlMethod(answers: Answers): string {
  const flow = Number(answers.q2HogasteMinstevassforing);
  if (
    Number.isFinite(flow) &&
    flow <= LOW_FLOW_THRESHOLD &&
    (answers.q4Slippmetode === "royr_frostfritt" || answers.q4Slippmetode === "royr_utan_frostfritt")
  ) {
    return "Volum/tid-måling i beholder";
  }
  if (answers.q8Maleprofil === "naturleg_stabilt") {
    return "Kontroll i naturlig måleprofil nedstrøms";
  }
  if (answers.q8Maleprofil === "kan_byggjast_kunstig") {
    return "Kontroll i kunstig bygget måleprofil nedstrøms";
  }
  return "Trenger nærmere prosjektering";
}

function deriveMainSolution(answers: Answers, inspectionsPerYear: number | ""): string {
  const hasVariation =
    answers.q3Slippkravvariasjon === "sesongkrav" || answers.q3Slippkravvariasjon === "tilsigsstyrt";
  const needsProtection =
    answers.q5IsSedimentTilstopping === "ja" || isInfrequentInspections(inspectionsPerYear);

  if (answers.q4Slippmetode === "royr_frostfritt") {
    if (hasVariation) {
      return needsProtection
        ? "Rørslipp i frostfritt rom med aktiv reguleringsventil, grovfilter og mengdemåler"
        : "Rørslipp i frostfritt rom med aktiv reguleringsventil og mengdemåler";
    }
    return needsProtection
      ? "Rørslipp i frostfritt rom med fast struping, selvrensende inntak og mengdemåler"
      : "Rørslipp i frostfritt rom med fast struping og mengdemåler";
  }

  if (answers.q4Slippmetode === "royr_utan_frostfritt") {
    if (hasVariation) {
      return needsProtection
        ? "Rørslipp gjennom dam med aktiv reguleringsventil, grovfilter og mengdemåler"
        : "Rørslipp gjennom dam med aktiv reguleringsventil og mengdemåler";
    }
    return needsProtection
      ? "Rørslipp gjennom dam med fast struping og mengdemåler"
      : "Rørslipp gjennom dam med fast struping og mengdemåler";
  }

  if (answers.q4Slippmetode === "direkte_elveleie") {
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
  if (controlMethod === "Trenger nærmere prosjektering") return "Krev avklaring";
  if (answers.q8Maleprofil === "ingen_eigna_profil") return "Bør vurderes nærmere";
  return "Anbefalt";
}

export function calculateRecommendation(answers: Answers, inspectionsPerYear: number | "" = ""): Recommendation {
  const flow = Number(answers.q2HogasteMinstevassforing);
  const flowBand = classifyFlow(flow);
  const variation = classifyVariation(answers);
  const hasVariation =
    answers.q3Slippkravvariasjon === "sesongkrav" || answers.q3Slippkravvariasjon === "tilsigsstyrt";
  const needsProtection =
    answers.q5IsSedimentTilstopping === "ja" || isInfrequentInspections(inspectionsPerYear);
  const controlMethod = resolveControlMethod(answers);
  const highFlowPipe =
    Number.isFinite(flow) &&
    flow > LOW_FLOW_THRESHOLD &&
    (answers.q4Slippmetode === "royr_frostfritt" || answers.q4Slippmetode === "royr_utan_frostfritt");

  const grunngiving = dedupe(
    [
      answers.q1Anleggstype === "eksisterande"
        ? "Eksisterende anlegg - vurder å bygge videre på eksisterende infrastruktur"
        : "",
      answers.q1Anleggstype === "ombygging"
        ? "Ombygging - eksisterende slipp- og målearrangement bør vurderes før nytt arrangement prosjekteres"
        : "",
      `Minstevannføring er klassifisert som ${flowBand} med ${variation} variasjon`,
      answers.q4Slippmetode === "royr_frostfritt"
        ? "Frostfritt uttak etter varegrind gir prioritet til rørslipp med intern måling"
        : answers.q4Slippmetode === "royr_utan_frostfritt"
          ? "Rørslipp gjennom dam uten frostfritt rom krever ekstra vern mot frost og fukt"
          : answers.q4Slippmetode === "direkte_elveleie"
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

  const tilleggskrav = dedupe(
    [
      answers.q6Fiskepassasje === "ja"
        ? "Løsningen skal integreres med krav til fiskepassasje"
        : "",
      answers.q7BypassVedDriftsstans === "ja"
        ? "Bypass/slipp skal fungere uavhengig av turbindrift"
        : "",
      answers.q9AllmentaKontroll === "ja"
        ? "Allmennheten skal kunne kontrollere minstevannføringen via synlig visning, skilt eller målestav"
        : "",
      answers.q8Maleprofil === "kan_byggjast_kunstig"
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
    hovudloysing: deriveMainSolution(answers, inspectionsPerYear),
    kontrollmalemetode: controlMethod,
    grunngiving,
    tilleggskrav,
    status: deriveStatus(answers, controlMethod)
  };
}
