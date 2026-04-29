import { useEffect, useMemo, useRef, useState } from "react";
import { useLanguage } from "../i18n";

interface NveStandaloneMapProps {
  value: string;
  lat: number | null;
  lng: number | null;
  nveId: string | null;
  onChange: (location: string, metadata?: { placeId?: string | null; lat?: number | null; lng?: number | null }) => void;
  startCollapsed?: boolean;
}

interface NveLocationMessage {
  name?: unknown;
  lat?: unknown;
  lng?: unknown;
  hydroPlant?: { vannkraftverkNr?: unknown } | null;
}

const SET_LOCATION_MESSAGE = "hydroguide:set-location";
const LOCATION_MESSAGE = "hydroguide:nve-location";
const HEIGHT_MESSAGE = "hydroguide:nve-map-height";
const MAX_IFRAME_HEIGHT = 1800;

function clampHeight(nextHeight: number) {
  return Math.min(MAX_IFRAME_HEIGHT, nextHeight);
}

export default function NveStandaloneMap({ value, lat, lng, nveId, onChange, startCollapsed = false }: NveStandaloneMapProps) {
  const { language } = useLanguage();
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [frameReady, setFrameReady] = useState(false);
  const [iframeHeight, setIframeHeight] = useState(0);
  const iframeSrc = useMemo(() => {
    const params = new URLSearchParams({
      lang: language,
      collapsed: startCollapsed ? "1" : "0"
    });
    return `/nve-kart-standalone.html?${params.toString()}`;
  }, [language, startCollapsed]);

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
      const nextName =
        typeof detail.name === "string" && detail.name.trim()
          ? detail.name.trim()
          : nextLat !== null && nextLng !== null
            ? `${nextLat.toFixed(6)}, ${nextLng.toFixed(6)}`
            : value;

      if (nextLat === lat && nextLng === lng && nextName === value) {
        return;
      }

      const hydroPlant = detail.hydroPlant;
      const nextNveId = hydroPlant && typeof hydroPlant.vannkraftverkNr === "number" ? String(hydroPlant.vannkraftverkNr) : null;
      onChange(nextName, { placeId: nextNveId, lat: nextLat, lng: nextLng });
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
