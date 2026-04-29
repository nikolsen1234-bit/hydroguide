import { FLOW_THRESHOLDS } from "../constants";
import { Answers, ConfidenceStatus, Recommendation } from "../types";
import { dedupe } from "./format";

type FlowBand = "liten" | "middels" | "stor";
type VariationBand = "låg" | "høg";
const LOW_FLOW_THRESHOLD = 2;

function classifyFlow(flow: number): FlowBand {
  if (flow <= FLOW_THRESHOLDS.smallMax) return "liten";
  if (flow <= FLOW_THRESHOLDS.mediumMax) return "middels";
  return "stor";
}

function classifyVariation(answers: Answers): VariationBand {
  return answers.q3Slippkravvariasjon === "sesongkrav" || answers.q3Slippkravvariasjon === "tilsigsstyrt"
    ? "høg"
    : "låg";
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
    return "Volum/tid-måling i behaldar";
  }
  if (answers.q8Maleprofil === "naturleg_stabilt") {
    return "Kontroll i naturleg måleprofil nedstrøms";
  }
  if (answers.q8Maleprofil === "kan_byggjast_kunstig") {
    return "Kontroll i kunstig bygd måleprofil nedstrøms";
  }
  return "Treng nærare prosjektering";
}

function deriveMainSolution(answers: Answers, inspectionsPerYear: number | ""): string {
  const hasVariation =
    answers.q3Slippkravvariasjon === "sesongkrav" || answers.q3Slippkravvariasjon === "tilsigsstyrt";
  const needsProtection =
    answers.q5IsSedimentTilstopping === "ja" || isInfrequentInspections(inspectionsPerYear);

  if (answers.q4Slippmetode === "royr_frostfritt") {
    if (hasVariation) {
      return needsProtection
        ? "Røyrslipp i frostfritt rom med aktiv reguleringsventil, grovfilter og mengdemålar"
        : "Røyrslipp i frostfritt rom med aktiv reguleringsventil og mengdemålar";
    }
    return needsProtection
      ? "Røyrslipp i frostfritt rom med fast struping, sjølvreinsande inntak og mengdemålar"
      : "Røyrslipp i frostfritt rom med fast struping og mengdemålar";
  }

  if (answers.q4Slippmetode === "royr_utan_frostfritt") {
    if (hasVariation) {
      return needsProtection
        ? "Røyrslipp gjennom dam med aktiv reguleringsventil, grovfilter og mengdemålar"
        : "Røyrslipp gjennom dam med aktiv reguleringsventil og mengdemålar";
    }
    return needsProtection
      ? "Røyrslipp gjennom dam med fast struping og mengdemålar"
      : "Røyrslipp gjennom dam med fast struping og mengdemålar";
  }

  if (answers.q4Slippmetode === "direkte_elveleie") {
    return needsProtection
      ? "Elveslipp med skjerma måleseksjon og vern mot is/drivgods"
      : "Elveslipp med definert målepunkt i naturleg elveleie";
  }

  if (hasVariation && needsProtection) {
    return "Reguleringskum med automatisk ventil, sjølvreinsande innløp og skjerma måleseksjon";
  }
  if (hasVariation) {
    return "Aktivt regulerbar slipp-løysing med ventil og stabilisert måleseksjon";
  }
  if (needsProtection) {
    return "Passiv slipp-løysing med låg driftsbelastning og vern mot is/drivgods";
  }
  return "Standard slipp-løysing med fast regulering og definert målepunkt";
}

function deriveStatus(answers: Answers, controlMethod: string): ConfidenceStatus {
  if (controlMethod === "Treng nærare prosjektering") return "Krev avklaring";
  if (answers.q8Maleprofil === "ingen_eigna_profil") return "Bør vurderast nærare";
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
        ? "Eksisterande anlegg - vurder å byggje vidare på eksisterande infrastruktur"
        : "",
      answers.q1Anleggstype === "ombygging"
        ? "Ombygging - eksisterande slipp- og målearrangement bør vurderast før nytt arrangement prosjekterast"
        : "",
      `Minstevassføring er klassifisert som ${flowBand} med ${variation} variasjon`,
      answers.q4Slippmetode === "royr_frostfritt"
        ? "Frostfritt uttak etter varegrind gjev prioritet til røyrslipp med intern måling"
        : answers.q4Slippmetode === "royr_utan_frostfritt"
          ? "Røyrslipp gjennom dam utan frostfritt rom krev ekstra vern mot frost og fukt"
          : answers.q4Slippmetode === "direkte_elveleie"
            ? "Elvinntak gjev slipp direkte i elveleie - krev skjerma eller stabilt målepunkt nedstrøms"
            : "Utvendig slipp via luke, utsparing eller overløp krev kontrollert målepunkt nedstrøms",
      hasVariation
        ? "Regelkrava krev aktiv regulering gjennom året"
        : "Regelkrava opnar for enklare fast regulering",
      highFlowPipe
        ? `Volum/tid-måling i behaldar er ikkje vurdert som eigna når vassføringa overstig ${LOW_FLOW_THRESHOLD} l/s`
        : "",
      needsProtection
        ? "NVE 3/2020 legg vekt på driftssikkert arrangement ved vinterforhold, tilstopping og periodar med låg tilsynshyppigheit"
        : "Driftsforholda tillet standard løysing utan særskilde vinter- og tilsynstiltak",
      `Kontrollmålemetode er vald etter prioritert regelrekkje: ${controlMethod.toLowerCase()}`
    ].filter(Boolean)
  ).slice(0, 5);

  const tilleggskrav = dedupe(
    [
      answers.q6Fiskepassasje === "ja"
        ? "Løysinga skal integrerast med krav til fiskepassasje"
        : "",
      answers.q7BypassVedDriftsstans === "ja"
        ? "Bypass/slipp skal fungere uavhengig av turbindrift"
        : "",
      answers.q9AllmentaKontroll === "ja"
        ? "Allmenta skal kunne kontrollere minstevassføringa via synleg vising, skilt eller målestav"
        : "",
      answers.q8Maleprofil === "kan_byggjast_kunstig"
        ? "Det skal byggjast kunstig måleprofil nedstrøms slippstaden"
        : "",
      needsProtection
        ? "Materialval og geometri skal tole is, drivgods, sediment og låg tilsynsfrekvens"
        : "",
      hasVariation
        ? "Regulering skal kunne gjennomførast trygt og sporbart ved hyppige endringar"
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
