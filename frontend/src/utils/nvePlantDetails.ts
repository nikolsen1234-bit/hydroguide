import type { NvePlantDetails } from "../types";

const NVE_MAPSERVER = "https://gis3.nve.no/map/rest/services/Mapservices/VassdragsreguleringVannkraft/MapServer";
const NVE_CONCESSION_URL = "https://www.nve.no/konsesjon/konsesjonssaker/konsesjonssak";

function createConcessionUrl(kdbNumber: unknown) {
  const id = Number.parseInt(String(kdbNumber ?? ""), 10);
  if (!Number.isFinite(id) || id <= 0) return null;

  const url = new URL(NVE_CONCESSION_URL);
  url.searchParams.set("id", String(id));
  url.searchParams.set("type", "V-1");
  return url.toString();
}

async function fetchJson(url: string) {
  const response = await fetch(url, { headers: { accept: "application/json" } });
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }
  return response.json() as Promise<unknown>;
}

async function fetchJsonOrNull(url: string) {
  try {
    return await fetchJson(url);
  } catch {
    return null;
  }
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function readFeatures(payload: unknown) {
  const features = readRecord(payload)?.features;
  return Array.isArray(features) ? features : [];
}

function getLatLng(geometry: unknown): [number, number] | null {
  const g = readRecord(geometry);
  if (!g) return null;
  const x = readNumber(g.x);
  const y = readNumber(g.y);
  if (x !== null && y !== null) return [y, x];

  const groups = Array.isArray(g.rings) ? g.rings : Array.isArray(g.paths) ? g.paths : null;
  if (!groups?.length) return null;

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  for (const group of groups) {
    if (!Array.isArray(group)) continue;
    for (const point of group) {
      if (!Array.isArray(point) || point.length < 2) continue;
      const [px, py] = point;
      if (typeof px !== "number" || typeof py !== "number") continue;
      minX = Math.min(minX, px);
      maxX = Math.max(maxX, px);
      minY = Math.min(minY, py);
      maxY = Math.max(maxY, py);
    }
  }

  if (!Number.isFinite(minX) || !Number.isFinite(minY)) return null;
  return [(minY + maxY) / 2, (minX + maxX) / 2];
}

function dedupeNames(items: string[]) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    const value = item.trim();
    const key = value.toLowerCase();
    if (!value || seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out;
}

async function queryLayer(layer: number, where: string, returnGeometry = true) {
  const params = new URLSearchParams({
    where,
    outFields: "*",
    f: "json",
    returnGeometry: returnGeometry ? "true" : "false",
    outSR: "4326"
  });
  return fetchJsonOrNull(`${NVE_MAPSERVER}/${layer}/query?${params.toString()}`);
}

async function queryIntersectingLabel(latlng: [number, number] | null, layerIds: number[]) {
  if (!latlng) return "";

  const [lat, lng] = latlng;
  const point = `${lng},${lat}`;
  const results = await Promise.all(
    layerIds.map((layerId) => {
      const params = new URLSearchParams({
        where: "1=1",
        geometry: point,
        geometryType: "esriGeometryPoint",
        inSR: "4326",
        spatialRel: "esriSpatialRelIntersects",
        distance: "10",
        units: "esriSRUnit_Meter",
        outFields: "*",
        f: "json",
        returnGeometry: "false"
      });
      return fetchJsonOrNull(`${NVE_MAPSERVER}/${layerId}/query?${params.toString()}`);
    })
  );

  for (const result of results) {
    const attributes = readRecord(readRecord(readFeatures(result)[0])?.attributes);
    const magasinName = readString(attributes?.magasinNavn);
    const damName = readString(attributes?.damNavn);
    if (magasinName) return magasinName;
    if (damName) return damName;
  }

  return "";
}

function formatIntakeFunction(raw: unknown) {
  const value = readString(raw);
  if (!value) return "";
  const normalized = value.toLowerCase();
  if (normalized === "hoved") return "Hovedinntak";
  if (normalized === "side") return "Andre Inntak";
  return `${value} Inntak`;
}

function formatIntakeName(attributes: Record<string, unknown>, relatedLabel: string) {
  const role = formatIntakeFunction(attributes.inntakFunksjon);
  const intakeNr = attributes.inntakNr;
  const baseName = role || (intakeNr != null ? `Inntakspunkt ${intakeNr}` : "Inntakspunkt");
  return relatedLabel ? `${baseName} (${relatedLabel})` : baseName;
}

async function loadPlantExtras(nveId: number) {
  const where = `vannkraftverkNr=${nveId}`;
  const damLayers = [4, 5, 6, 15, 16, 17];
  const [inntakDrift, magasin, inntakPlan] = await Promise.all([
    queryLayer(2, where),
    queryLayer(9, where),
    queryLayer(12, where)
  ]);

  const magasinItems = dedupeNames(
    readFeatures(magasin)
      .map((feature) => readString(readRecord(readRecord(feature)?.attributes)?.magasinNavn))
      .filter((item): item is string => Boolean(item))
  );

  const intakeFeatures = [...readFeatures(inntakDrift), ...readFeatures(inntakPlan)];
  const intakeLabels = await Promise.all(
    intakeFeatures.map((feature) => queryIntersectingLabel(getLatLng(readRecord(feature)?.geometry), damLayers))
  );
  const intakeItems = dedupeNames(
    intakeFeatures
      .map((feature, index) => {
        const attributes = readRecord(readRecord(feature)?.attributes);
        if (!attributes) return null;
        return formatIntakeName(attributes, intakeLabels[index] || "");
      })
      .filter((item): item is string => Boolean(item))
  ).sort((a, b) => {
    const aRank = a.toLowerCase().startsWith("hoved") ? 0 : 1;
    const bRank = b.toLowerCase().startsWith("hoved") ? 0 : 1;
    return aRank - bRank || a.localeCompare(b, "nb");
  });

  return {
    intakeCount: intakeItems.length,
    intakeItems,
    reservoirCount: magasinItems.length,
    reservoirItems: magasinItems.length ? magasinItems : ["Elvekraftverk - ingen magasin"]
  };
}

function formatFlowNumber(value: number) {
  return new Intl.NumberFormat("nb-NO", { maximumFractionDigits: value < 10 ? 2 : 0 }).format(value);
}

function formatFlowValue(value: unknown) {
  const record = readRecord(value);
  if (!record) return null;
  const ls = readNumber(record.ls);
  if (ls !== null) return `${formatFlowNumber(ls)} l/s`;
  const m3s = readNumber(record.m3s);
  if (m3s !== null) return `${new Intl.NumberFormat("nb-NO", { maximumFractionDigits: 2 }).format(m3s)} m3/s`;
  return null;
}

function formatSeasonFlow(intake: Record<string, unknown>, field: string) {
  const details = intake[`${field}_delperioder`];
  if (Array.isArray(details) && details.length) {
    return details
      .map((detail) => {
        const record = readRecord(detail);
        const ls = readNumber(record?.ls);
        if (ls === null) return null;
        const flow = `${formatFlowNumber(ls)} l/s`;
        const period = readString(record?.periode);
        return period ? `${flow} (${period})` : flow;
      })
      .filter((value): value is string => Boolean(value));
  }

  const ls = readNumber(intake[`${field}_ls`]);
  if (ls !== null) {
    const flow = `${formatFlowNumber(ls)} l/s`;
    const period = readString(intake[`${field}_periode`]);
    return [period ? `${flow} (${period})` : flow];
  }

  const textValue = readString(intake[field]);
  return textValue ? [textValue] : [];
}

function formatMinimumFlowEntry(entry: unknown) {
  const record = readRecord(entry);
  if (!record) return { text: "Ikke indeksert", items: [] };
  if (record.funnet !== true) return { text: "Ingen krav registrert", items: [] };

  const intakes = Array.isArray(record.inntak) ? record.inntak : [];
  if (!intakes.length) return { text: "Ingen krav registrert", items: [] };

  const seasonLabels: Record<string, string> = {
    heileAret: "hele året",
    heleAret: "hele året",
    var: "vår",
    sommer: "sommer",
    host: "høst",
    "høst": "høst",
    vinter: "vinter"
  };
  const orderedKeys = ["heileAret", "heleAret", "var", "sommer", "host", "høst", "vinter"];
  const items: string[] = [];

  for (const rawIntake of intakes) {
    const intake = readRecord(rawIntake);
    if (!intake) continue;
    const title = readString(intake.navn) || readString(intake.inntakFunksjon) || "Inntakspunkt";
    const text = readString(intake.verdier);
    if (text) {
      items.push(`${title}: ${text}`);
      continue;
    }

    const parts: string[] = [];
    for (const value of formatSeasonFlow(intake, "sommer")) parts.push(`sommer: ${value}`);
    for (const value of formatSeasonFlow(intake, "vinter")) parts.push(`vinter: ${value}`);
    for (const key of orderedKeys) {
      const flow = formatFlowValue(intake[key]);
      if (flow) parts.push(`${seasonLabels[key] ?? key}: ${flow}`);
    }

    if (parts.length) items.push(`${title}: ${parts.join(", ")}`);
  }

  return items.length ? { text: null, items } : { text: "Ingen krav registrert", items: [] };
}

async function loadMinimumFlow(nveId: number) {
  const data = readRecord(await fetchJsonOrNull(`/api/nveid/${nveId}`));
  return formatMinimumFlowEntry(data?.minimumFlow);
}

interface WikipediaDetails {
  url: string | null;
  imageUrl: string | null;
}

async function fetchWikipediaDetails(name: string): Promise<WikipediaDetails> {
  const terms = [`${name} kraftverk`, `${name} kraftstasjon`, name];
  for (const host of ["no.wikipedia.org", "nn.wikipedia.org", "en.wikipedia.org"]) {
    for (const term of terms) {
      const search = await fetchJsonOrNull(
        `https://${host}/w/api.php?action=opensearch&format=json&origin=*&limit=1&search=${encodeURIComponent(term)}`
      );
      if (!Array.isArray(search)) continue;
      const title = Array.isArray(search[1]) ? readString(search[1][0]) : null;
      if (!title) continue;
      const summary = readRecord(await fetchJsonOrNull(`https://${host}/api/rest_v1/page/summary/${encodeURIComponent(title)}`));
      const url = readString(readRecord(readRecord(summary?.content_urls)?.desktop)?.page);
      const originalImage = readString(readRecord(summary?.originalimage)?.source);
      const thumbnail = readString(readRecord(summary?.thumbnail)?.source);
      const imageUrl = originalImage ?? (thumbnail ? thumbnail.replace(/\/\d+px-/, "/800px-") : null);
      if (url || imageUrl) return { url, imageUrl };
    }
  }

  return { url: null, imageUrl: null };
}

export async function fetchNvePlantDetails(nveIdValue: string | number): Promise<NvePlantDetails | null> {
  const nveId = Number.parseInt(String(nveIdValue), 10);
  if (!Number.isFinite(nveId) || nveId <= 0) return null;

  const params = new URLSearchParams({
    where: `vannkraftverkNr=${nveId}`,
    outFields: "*",
    f: "json",
    returnGeometry: "false",
    resultRecordCount: "1"
  });
  const plantPayload = await fetchJsonOrNull(`${NVE_MAPSERVER}/1/query?${params.toString()}`);
  const plantAttributes = readRecord(readRecord(readFeatures(plantPayload)[0])?.attributes);
  if (!plantAttributes) return null;

  const name = readString(plantAttributes.vannkraftStasjonNavn) || readString(plantAttributes.vannkraftverkNavn) || `NVE ${nveId}`;
  const kdbNumber = readString(plantAttributes.kdbNr) ?? (plantAttributes.kdbNr != null ? String(plantAttributes.kdbNr) : null);
  const [extras, minimumFlow, wikipedia] = await Promise.all([
    loadPlantExtras(nveId),
    loadMinimumFlow(nveId),
    fetchWikipediaDetails(name)
  ]);

  return {
    name,
    stationId: String(nveId),
    owner: readString(plantAttributes.vannkraftverkEier),
    municipality: readString(plantAttributes.kommuneNavn),
    county: readString(plantAttributes.fylke),
    maxOutputMW: readNumber(plantAttributes.maksYtelse_MW),
    productionGWh: readNumber(plantAttributes.produksjonGWh_Aar),
    grossHeadM: readNumber(plantAttributes.bruttoFallhoyde_m),
    commissionedYear: plantAttributes.idriftsattAar != null ? String(plantAttributes.idriftsattAar) : null,
    plantType: readString(plantAttributes.vannkraftverkType),
    kdbNumber,
    concessionUrl: createConcessionUrl(kdbNumber),
    wikiUrl: wikipedia.url,
    imageUrl: wikipedia.imageUrl,
    minFlowText: minimumFlow.text,
    minFlowItems: minimumFlow.items,
    intakeCount: extras.intakeCount,
    intakeItems: extras.intakeItems,
    reservoirCount: extras.reservoirCount,
    reservoirItems: extras.reservoirItems
  };
}
