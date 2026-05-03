import type { Language } from "./types";

const dynamicTranslations: Record<string, string> = {
  "liten": "small",
  "middels": "medium",
  "stor": "large",
  "låg": "low",
  "høg": "high",

  "Robust røyrslipp i frostfritt rom med aktiv reguleringsventil, grovfilter og mengdemålar":
    "Pipe discharge in a frost-free room with active control valve, coarse filter, and flow meter",
  "Røyrslipp i frostfritt rom med aktiv reguleringsventil og mengdemålar":
    "Pipe discharge in a frost-free room with active control valve and flow meter",
  "Robust røyrslipp i frostfritt rom med fast struping, sjølvreinsande inntak og mengdemålar":
    "Pipe discharge in a frost-free room with fixed throttling, self-cleaning intake, and flow meter",
  "Røyrslipp i frostfritt rom med fast struping og mengdemålar":
    "Pipe discharge in a frost-free room with fixed throttling and flow meter",
  "Robust reguleringskum med automatisk ventil, sjølvreinsande innløp og skjerma måleseksjon":
    "Regulation chamber with automatic valve, self-cleaning inlet, and shielded measurement section",
  "Aktivt regulerbar slipp-løysing med ventil og stabilisert måleseksjon":
    "Actively adjustable release solution with valve and stabilized measurement section",
  "Robust passiv slipp-løysing med låg driftsbelastning og vern mot is/drivgods":
    "Passive release solution with low operational load and protection against ice/debris",
  "Standard slipp-løysing med fast regulering og definert målepunkt":
    "Standard release solution with fixed regulation and defined measurement point",

  "Volum/tid-måling i behaldar": "Volume/time measurement in container",
  "Kontroll i naturleg måleprofil nedstrøms": "Verification in a natural measuring profile downstream",
  "Kontroll i kunstig bygd måleprofil nedstrøms": "Verification in an artificially built measuring profile downstream",
  "Fortynningsmåling": "Dilution measurement",
  "Areal-hastigheitmåling": "Area-velocity measurement",
  "Treng nærare prosjektering": "Requires further engineering",

  "Krev avklaring": "Requires clarification",
  "Bør vurderast nærare": "Should be assessed further",
  "Anbefalt": "Recommended",

  "Røyrslipp i frostfritt rom med aktiv reguleringsventil":
    "Pipe discharge in a frost-free room with an active control valve",
  "Røyrslipp i frostfritt rom med fast struping":
    "Pipe discharge in a frost-free room with fixed throttling",
  "Reguleringskum med skjerma måleseksjon": "Regulation chamber with shielded measurement section",
  "Passiv slippseksjon med robust utforming": "Passive release section with protection against ice/debris",
  "Fast slippordning med definert målepunkt": "Fixed release arrangement with defined measurement point",

  "Mengdemåling i røyr": "Flow measurement in pipe",
  "Vassstand i naturleg måleprofil": "Water level in natural measurement profile",
  "Vassstand i kunstig måleprofil": "Water level in artificial measurement profile",
  "Måleprinsipp må fastleggjast": "Measurement principle must be determined",
  "Må avklarast i detaljprosjektering": "Must be clarified in detailed engineering",

  "Mengdemålar i røyr": "Flow meter in pipe",
  "Behaldar med kjent volum og nivåregistrering": "Container with known volume and level recording",
  "Sensor og logger mot naturleg profil": "Sensor and logger for natural profile",
  "Sensor og logger mot kunstig profil": "Sensor and logger for artificial profile",
  "Fortynningsutstyr og logga prøveserie": "Dilution equipment and logged sample series",
  "Sensor for nivå og hastigheit i definert måleseksjon": "Sensor for level and velocity in defined measurement section",
  "Må veljast i detaljprosjektering": "Must be selected in detailed engineering",

  "4G-ruter": "4G router",
  "NB-IoT": "NB-IoT",
  "LoRaWAN": "LoRaWAN",
  "Satellittmodem": "Satellite modem",

  "2 loggarar + backup-loggar": "2 loggers + backup logger",
  "1 loggar": "1 logger",

  "Frostsikra sensorhus / varmekabel": "Frost-protected sensor housing / heating cable",
  "Isreduksjon i måleprofil": "Ice reduction in measurement profile",
  "Standard": "Standard",

  "Brenselcelle": "Fuel Cell",
  "Dieselaggregat": "Diesel Generator",
  "Ikkje berekna": "Not calculated",
  "Ja": "Yes",
  "Nei": "No",

  "Frostfritt uttak etter varegrind gjev prioritet til røyrslipp med intern måling":
    "Frost-free extraction after trash rack prioritizes pipe release with internal measurement",
  "Manglande frostfritt uttak flyttar løysinga mot utvendig og robust slippunkt":
    "Lack of frost-free extraction moves the solution toward an external release point with shielded measurement",
  "Regelkrava krev aktiv regulering gjennom året":
    "Regulatory requirements demand active regulation throughout the year",
  "Regelkrava opnar for enklare fast regulering":
    "Regulatory requirements allow for simpler fixed regulation",
  "Miljø- og driftsforhold krev robust løysing med lågt vedlikehald":
    "Environmental and operational conditions require a solution that tolerates winter conditions and low maintenance",
  "Driftsforholda tillet standard løysing utan ekstra robustheitskrav":
    "Operational conditions allow a standard solution without special winter or inspection measures",

  "Løysinga skal ha automatisk logging, signaloverføring og alarm til driftssystem":
    "The solution shall have automatic logging, signal transmission, and alarm to the operational system",
  "Allmenta skal kunne kontrollere minstevassføringa via synleg vising, skilt eller målestav":
    "The public shall be able to verify the minimum water flow via visible display, sign, or measuring staff",
  "Bypass/slipp skal fungere uavhengig av turbinedrift":
    "Bypass/release shall function independently of turbine operation",
  "Løysinga skal integrerast med krav til fiskepassasje":
    "The solution shall be integrated with fish passage requirements",
  "Det skal byggjast kunstig måleprofil nedstrøms slippstaden":
    "An artificial measurement profile shall be built downstream of the release point",
  "Målepunktet må oppgraderast for repeterbar kontrollmåling med låg usikkerheit":
    "The measurement point must be upgraded for repeatable control measurement with low uncertainty",
  "Materialval og geometri skal tole is, drivgods, sediment og låg tilsynsfrekvens":
    "Material selection and geometry shall withstand ice, debris, sediment, and low inspection frequency",
  "Regulering skal kunne gjennomførast trygt og sporbart ved hyppige endringar":
    "Regulation shall be carried out safely and traceably with frequent changes",

  "Serviceadkomst til ventil, målar og innløp i frostfritt rom":
    "Service access to valve, meter, and inlet in frost-free room",
  "Rettstrekk og roleg straumbilete gjennom målaren for stabil signalkvalitet":
    "Straight run and calm flow pattern through the meter for stable signal quality",
  "Naturleg kontrollprofil nedstrøms med stabil geometri og tilkomst for kontrollmåling":
    "Natural control profile downstream with stable geometry and access for control measurement",
  "Kunstig kontrollprofil nedstrøms med definert geometri og tilkomst for kontrollmåling":
    "Artificial control profile downstream with defined geometry and access for control measurement",
  "Tilstrekkeleg turbulens og dokumentert innblanding ved kontrollmåling":
    "Sufficient turbulence and documented mixing during control measurement",
  "Jamn djupn og definert tverrsnitt for areal-hastigheitsmåling":
    "Even depth and defined cross-section for area-velocity measurement",
  "Samla behaldar med kjent volum og repeterbar tømmetid":
    "Collection container with known volume and repeatable emptying time",
  "Regulering må kunne sporast og styrast trygt ved hyppige endringar":
    "Regulation must be traceable and safely managed with frequent changes"
};

const CONTROL_METHOD_RE = /^Kontrollmålemetode er vald etter prioritert regelrekkje: (.+)$/;
const FLOW_CLASSIFICATION_RE = /^Minstevassføring er klassifisert som (\S+) med (\S+) variasjon$/;
const VOLUME_TIME_RE = /^Volum\/tid-måling i behaldar er ikkje vurdert som eigna når vassføringa overstig (.+) l\/s$/;
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
