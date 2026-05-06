import type { Language } from "./types";

const dynamicTranslations: Record<string, string> = {
  "liten": "small",
  "middels": "medium",
  "stor": "large",
  "lav": "low",
  "høy": "high",

  "Robust rørslipp i frostfritt rom med aktiv reguleringsventil, grovfilter og mengdemåler":
    "Pipe discharge in a frost-free room with active control valve, coarse filter, and flow meter",
  "Rørslipp i frostfritt rom med aktiv reguleringsventil og mengdemåler":
    "Pipe discharge in a frost-free room with active control valve and flow meter",
  "Robust rørslipp i frostfritt rom med fast struping, selvrensende inntak og mengdemåler":
    "Pipe discharge in a frost-free room with fixed throttling, self-cleaning intake, and flow meter",
  "Rørslipp i frostfritt rom med fast struping og mengdemåler":
    "Pipe discharge in a frost-free room with fixed throttling and flow meter",
  "Robust reguleringskum med automatisk ventil, selvrensende innløp og skjermet måleseksjon":
    "Regulation chamber with automatic valve, self-cleaning inlet, and shielded measurement section",
  "Aktivt regulerbar slipp-løsning med ventil og stabilisert måleseksjon":
    "Actively adjustable release solution with valve and stabilized measurement section",
  "Robust passiv slipp-løsning med lav driftsbelastning og vern mot is/drivgods":
    "Passive release solution with low operational load and protection against ice/debris",
  "Standard slipp-løsning med fast regulering og definert målepunkt":
    "Standard release solution with fixed regulation and defined measurement point",

  "Volum/tid-måling i beholder": "Volume/time measurement in container",
  "Kontroll i naturlig måleprofil nedstrøms": "Verification in a natural measuring profile downstream",
  "Kontroll i kunstig bygget måleprofil nedstrøms": "Verification in an artificially built measuring profile downstream",
  "Fortynningsmåling": "Dilution measurement",
  "Areal-hastighetmåling": "Area-velocity measurement",
  "Trenger nærmere prosjektering": "Requires further engineering",

  "Krev avklaring": "Requires clarification",
  "Bør vurderes nærmere": "Should be assessed further",
  "Anbefalt": "Recommended",

  "Rørslipp i frostfritt rom med aktiv reguleringsventil":
    "Pipe discharge in a frost-free room with an active control valve",
  "Rørslipp i frostfritt rom med fast struping":
    "Pipe discharge in a frost-free room with fixed throttling",
  "Reguleringskum med skjermet måleseksjon": "Regulation chamber with shielded measurement section",
  "Passiv slippseksjon med robust utforming": "Passive release section with protection against ice/debris",
  "Fast slippordning med definert målepunkt": "Fixed release arrangement with defined measurement point",

  "Mengdemåling i rør": "Flow measurement in pipe",
  "Vannstand i naturlig måleprofil": "Water level in natural measurement profile",
  "Vannstand i kunstig måleprofil": "Water level in artificial measurement profile",
  "Måleprinsipp må fastsettes": "Measurement principle must be determined",
  "Må avklares i detaljprosjektering": "Must be clarified in detailed engineering",

  "Mengdemåler i rør": "Flow meter in pipe",
  "Beholder med kjent volum og nivåregistrering": "Container with known volume and level recording",
  "Sensor og logger mot naturlig profil": "Sensor and logger for natural profile",
  "Sensor og logger mot kunstig profil": "Sensor and logger for artificial profile",
  "Fortynningsutstyr og logget prøveserie": "Dilution equipment and logged sample series",
  "Sensor for nivå og hastighet i definert måleseksjon": "Sensor for level and velocity in defined measurement section",
  "Må velges i detaljprosjektering": "Must be selected in detailed engineering",

  "4G-ruter": "4G router",
  "NB-IoT": "NB-IoT",
  "LoRaWAN": "LoRaWAN",
  "Satellittmodem": "Satellite modem",

  "2 loggere + backuplogger": "2 loggers + backup logger",
  "1 logger": "1 logger",

  "Frostsikret sensorhus / varmekabel": "Frost-protected sensor housing / heating cable",
  "Isreduksjon i måleprofil": "Ice reduction in measurement profile",
  "Standard": "Standard",

  "Brenselcelle": "Fuel Cell",
  "Dieselaggregat": "Diesel Generator",
  "Ikke beregnet": "Not calculated",
  "Ja": "Yes",
  "Nei": "No",

  "Frostfritt uttak etter varegrind gir prioritet til rørslipp med intern måling":
    "Frost-free extraction after trash rack prioritizes pipe release with internal measurement",
  "Manglende frostfritt uttak flytter løsningen mot utvendig og robust slippunkt":
    "Lack of frost-free extraction moves the solution toward an external release point with shielded measurement",
  "Regelkravene krever aktiv regulering gjennom året":
    "Regulatory requirements demand active regulation throughout the year",
  "Regelkravene åpner for enklere fast regulering":
    "Regulatory requirements allow for simpler fixed regulation",
  "Miljø- og driftsforhold krever robust løsning med lavt vedlikehold":
    "Environmental and operational conditions require a solution that tolerates winter conditions and low maintenance",
  "Driftsforholdene tillater standard løsning uten ekstra robusthetskrav":
    "Operational conditions allow a standard solution without special winter or inspection measures",

  "Løsningen skal ha automatisk logging, signaloverføring og alarm til driftssystem":
    "The solution shall have automatic logging, signal transmission, and alarm to the operational system",
  "Allmennheten skal kunne kontrollere minstevannføringen via synlig visning, skilt eller målestav":
    "The public shall be able to verify the minimum water flow via visible display, sign, or measuring staff",
  "Bypass/slipp skal fungere uavhengig av turbinedrift":
    "Bypass/release shall function independently of turbine operation",
  "Løsningen skal integreres med krav til fiskepassasje":
    "The solution shall be integrated with fish passage requirements",
  "Det skal bygges kunstig måleprofil nedstrøms slippstedet":
    "An artificial measurement profile shall be built downstream of the release point",
  "Målepunktet må oppgraderes for repeterbar kontrollmåling med lav usikkerhet":
    "The measurement point must be upgraded for repeatable control measurement with low uncertainty",
  "Materialval og geometri skal tåle is, drivgods, sediment og lav tilsynsfrekvens":
    "Material selection and geometry shall withstand ice, debris, sediment, and low inspection frequency",
  "Regulering skal kunne gjennomføres trygt og sporbart ved hyppige endringer":
    "Regulation shall be carried out safely and traceably with frequent changes",

  "Serviceadkomst til ventil, måler og innløp i frostfritt rom":
    "Service access to valve, meter, and inlet in frost-free room",
  "Rettstrekk og rolig strømbilde gjennom måleren for stabil signalkvalitet":
    "Straight run and calm flow pattern through the meter for stable signal quality",
  "Naturlig kontrollprofil nedstrøms med stabil geometri og adkomst for kontrollmåling":
    "Natural control profile downstream with stable geometry and access for control measurement",
  "Kunstig kontrollprofil nedstrøms med definert geometri og adkomst for kontrollmåling":
    "Artificial control profile downstream with defined geometry and access for control measurement",
  "Tilstrekkelig turbulens og dokumentert innblanding ved kontrollmåling":
    "Sufficient turbulence and documented mixing during control measurement",
  "Jevn dybde og definert tverrsnitt for areal-hastighetsmåling":
    "Even depth and defined cross-section for area-velocity measurement",
  "Samlet beholder med kjent volum og repeterbar tømmetid":
    "Collection container with known volume and repeatable emptying time",
  "Regulering må kunne spores og styres trygt ved hyppige endringer":
    "Regulation must be traceable and safely managed with frequent changes"
};

const CONTROL_METHOD_RE = /^Kontrollmålemetode er valgt etter prioritert regelrekkefølge: (.+)$/;
const FLOW_CLASSIFICATION_RE = /^Minstevannføring er klassifisert som (\S+) med (\S+) variasjon$/;
const VOLUME_TIME_RE = /^Volum\/tid-måling i beholder er ikke vurdert som egnet når vannføringen overstiger (.+) l\/s$/;
const CLARIFY_BASIS_RE = /^Avklar prosjekteringsgrunnlaget for (.+)$/;

export function translateDynamic(value: string, language: Language): string {
  if (language === "nn") {
    return value;
  }

  if (dynamicTranslations[value]) {
    return dynamicTranslations[value];
  }

  const flowMatch = value.match(FLOW_CLASSIFICATION_RE);
  if (flowMatch) {
    const flowBand = dynamicTranslations[flowMatch[1]] ?? flowMatch[1];
    const variation = dynamicTranslations[flowMatch[2]] ?? flowMatch[2];
    return `Minimum water flow is classified as ${flowBand} with ${variation} variation`;
  }

  const volumeMatch = value.match(VOLUME_TIME_RE);
  if (volumeMatch) {
    return `Volume/time measurement in container is not considered suitable when the water flow exceeds ${volumeMatch[1]} L/s`;
  }

  const controlMatch = value.match(CONTROL_METHOD_RE);
  if (controlMatch) {
    return `Control measurement method selected according to prioritized rule sequence: ${(dynamicTranslations[controlMatch[1]] ?? controlMatch[1]).toLowerCase()}`;
  }

  const clarifyMatch = value.match(CLARIFY_BASIS_RE);
  return clarifyMatch
    ? `Clarify the engineering basis for ${(dynamicTranslations[clarifyMatch[1]] ?? clarifyMatch[1]).toLowerCase()}`
    : value;
}
