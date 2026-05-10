import { useEffect, useMemo, useRef, useState } from "react";
import { useLanguage } from "../i18n";
import type { NvePlantDetails } from "../types";

interface NveStandaloneMapProps {
  value: string;
  lat: number | null;
  lng: number | null;
  nveId: string | null;
  onChange: (
    location: string,
    metadata?: { placeId?: string | null; lat?: number | null; lng?: number | null; plantDetails?: NvePlantDetails | null }
  ) => void;
  startCollapsed?: boolean;
  showPlantDetails?: boolean;
}

interface NveLocationMessage {
  name?: unknown;
  lat?: unknown;
  lng?: unknown;
  hydroPlant?: { vannkraftverkNr?: unknown; [key: string]: unknown } | null;
  plantDetails?: unknown;
}

const SET_LOCATION_MESSAGE = "hydroguide:set-location";
const LOCATION_MESSAGE = "hydroguide:nve-location";
const HEIGHT_MESSAGE = "hydroguide:nve-map-height";
const MAX_IFRAME_HEIGHT = 1800;

function clampHeight(nextHeight: number) {
  return Math.min(MAX_IFRAME_HEIGHT, nextHeight);
}

function stringOrNull(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numberOrNull(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function stringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim())
    : [];
}

function normalizePlantDetails(value: unknown): NvePlantDetails | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const detail = value as Record<string, unknown>;
  const name = stringOrNull(detail.name);
  if (!name) {
    return null;
  }

  return {
    name,
    stationId: stringOrNull(detail.stationId),
    owner: stringOrNull(detail.owner),
    municipality: stringOrNull(detail.municipality),
    county: stringOrNull(detail.county),
    maxOutputMW: numberOrNull(detail.maxOutputMW),
    productionGWh: numberOrNull(detail.productionGWh),
    grossHeadM: numberOrNull(detail.grossHeadM),
    commissionedYear: stringOrNull(detail.commissionedYear),
    plantType: stringOrNull(detail.plantType),
    kdbNumber: stringOrNull(detail.kdbNumber),
    concessionUrl: stringOrNull(detail.concessionUrl),
    wikiUrl: stringOrNull(detail.wikiUrl),
    imageUrl: stringOrNull(detail.imageUrl),
    minFlowText: stringOrNull(detail.minFlowText),
    minFlowItems: stringArray(detail.minFlowItems),
    intakeCount: numberOrNull(detail.intakeCount),
    intakeItems: stringArray(detail.intakeItems),
    reservoirCount: numberOrNull(detail.reservoirCount),
    reservoirItems: stringArray(detail.reservoirItems)
  };
}

export default function NveStandaloneMap({ value, lat, lng, nveId, onChange, startCollapsed = false, showPlantDetails = true }: NveStandaloneMapProps) {
  const { language } = useLanguage();
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [frameReady, setFrameReady] = useState(false);
  const [iframeHeight, setIframeHeight] = useState(0);
  const iframeSrc = useMemo(() => {
    const params = new URLSearchParams({
      lang: language,
      collapsed: startCollapsed ? "1" : "0",
      plantDetails: showPlantDetails ? "1" : "0"
    });
    return `/nve-kart-standalone.html?${params.toString()}`;
  }, [language, showPlantDetails, startCollapsed]);

  useEffect(() => {
    setFrameReady(false);
    setIframeHeight(0);
  }, [iframeSrc]);

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (!iframeRef.current || event.source !== iframeRef.current.contentWindow) {
        return;
      }

      const data = event.data as { type?: string; height?: unknown; detail?: NveLocationMessage } | null;
      if (!data || typeof data.type !== "string") {
        return;
      }

      if (data.type === HEIGHT_MESSAGE && typeof data.height === "number" && Number.isFinite(data.height)) {
        setIframeHeight(clampHeight(data.height));
        return;
      }

      if (data.type !== LOCATION_MESSAGE) {
        return;
      }

      const detail = data.detail ?? {};
      const nextLat = typeof detail.lat === "number" && Number.isFinite(detail.lat) ? detail.lat : null;
      const nextLng = typeof detail.lng === "number" && Number.isFinite(detail.lng) ? detail.lng : null;
      const plantDetails = normalizePlantDetails(detail.plantDetails);
      const nextName =
        typeof detail.name === "string" && detail.name.trim()
          ? detail.name.trim()
          : nextLat !== null && nextLng !== null
            ? `${nextLat.toFixed(6)}, ${nextLng.toFixed(6)}`
            : value;

      if (nextLat === lat && nextLng === lng && nextName === value) {
        if (!plantDetails) {
          return;
        }
      }

      const hydroPlant = detail.hydroPlant;
      const nextNveId = hydroPlant && typeof hydroPlant.vannkraftverkNr === "number" ? String(hydroPlant.vannkraftverkNr) : null;
      onChange(nextName, { placeId: nextNveId, lat: nextLat, lng: nextLng, plantDetails });
    }

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [lat, lng, onChange, value]);

  useEffect(() => {
    if (!frameReady || !iframeRef.current?.contentWindow) {
      return;
    }

    const hasCoords = typeof lat === "number" && typeof lng === "number";
    const hasNveId = !!nveId;
    if (!hasCoords && !hasNveId) {
      return;
    }

    iframeRef.current.contentWindow.postMessage(
      {
        type: SET_LOCATION_MESSAGE,
        detail: {
          name: value,
          lat: hasCoords ? lat : null,
          lng: hasCoords ? lng : null,
          nveId: hasNveId ? Number(nveId) : null
        }
      },
      window.location.origin
    );
  }, [frameReady, lat, lng, nveId, value]);

  return (
    <iframe
      ref={iframeRef}
      title="NVE kart"
      src={iframeSrc}
      onLoad={() => setFrameReady(true)}
      className="block w-full border-0"
      style={{ height: `${iframeHeight}px` }}
    />
  );
}
