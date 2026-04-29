import { useEffect, useRef, useState, type MutableRefObject } from "react";
import { ensureLeaflet, LeafletMap, LeafletMarker, LeafletMouseEvent, LeafletNamespace, LeafletPolyline } from "../utils/leaflet";
import type { RadioLinkPoint } from "../utils/radioLink";
import { useLanguage } from "../i18n";

const KARTVERKET_TILE_URL =
  "https://cache.kartverket.no/v1/wmts/1.0.0/topo/default/webmercator/{z}/{y}/{x}.png";
const DEFAULT_CENTER: [number, number] = [60.472, 8.4689];
const DEFAULT_ZOOM = 5;
const NAVIGATION_CLICK_GUARD_MS = 220;
const MOBILE_BREAKPOINT_PX = 768;
const MOBILE_FIT_PADDING: [number, number] = [56, 56];
const DESKTOP_FIT_PADDING: [number, number] = [36, 36];
const FIT_BOUNDS_MAX_ZOOM = 14;

function getCalculatedFitOptions() {
  const isMobile = typeof window !== "undefined" && window.innerWidth < MOBILE_BREAKPOINT_PX;

  return {
    padding: isMobile ? MOBILE_FIT_PADDING : DESKTOP_FIT_PADDING,
    maxZoom: FIT_BOUNDS_MAX_ZOOM,
    animate: false
  };
}

function createMarkerIcon(L: LeafletNamespace, label: string, tone: "warm" | "cool") {
  const palette =
    tone === "cool"
      ? { fill: "#9bd3ff", stroke: "#163447", text: "#163447" }
      : { fill: "#f3c48b", stroke: "#4a2a12", text: "#4a2a12" };

  return L.divIcon({
    className: "",
    html: `
      <div style="display:flex;align-items:center;justify-content:center;width:34px;height:34px;border-radius:999px;background:${palette.fill};border:2px solid ${palette.stroke};box-shadow:0 10px 24px rgba(15,23,42,.18);font:700 12px/1 Manrope, sans-serif;color:${palette.text};">
        ${label}
      </div>
    `,
    iconSize: [34, 34],
    iconAnchor: [17, 17]
  });
}

interface RadioLinkMapProps {
  pointA: RadioLinkPoint | null;
  pointB: RadioLinkPoint | null;
  onMapClick?: (point: RadioLinkPoint) => void;
  onPointChange?: (pointKey: "pointA" | "pointB", point: RadioLinkPoint) => void;
  nextPoint?: "pointA" | "pointB";
  fitKey?: string;
}

export default function RadioLinkMap({
  pointA,
  pointB,
  onMapClick,
  onPointChange,
  nextPoint = "pointA",
  fitKey
}: RadioLinkMapProps) {
  const { t } = useLanguage();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const leafletRef = useRef<LeafletNamespace | null>(null);
  const pointAMarkerRef = useRef<LeafletMarker | null>(null);
  const pointBMarkerRef = useRef<LeafletMarker | null>(null);
  const lineRef = useRef<LeafletPolyline | null>(null);
  const onMapClickRef = useRef(onMapClick);
  const onPointChangeRef = useRef(onPointChange);
  const lastNavigationAtRef = useRef(0);
  const lastAppliedFitKeyRef = useRef<string | undefined>(undefined);
  const [failed, setFailed] = useState(false);
  const [mapReady, setMapReady] = useState(false);

  onMapClickRef.current = onMapClick;
  onPointChangeRef.current = onPointChange;

  useEffect(() => {
    if (!fitKey) {
      lastAppliedFitKeyRef.current = undefined;
    }
  }, [fitKey]);

  useEffect(() => {
    let cancelled = false;

    const setup = async () => {
      if (!containerRef.current) {
        return;
      }

      try {
        const L = await ensureLeaflet();
        if (cancelled || !containerRef.current) {
          return;
        }

        leafletRef.current = L;
        if (!mapRef.current) {
          mapRef.current = L.map(containerRef.current, {
            zoomControl: true,
            attributionControl: false,
            doubleClickZoom: false
          });

          L.tileLayer(KARTVERKET_TILE_URL, {
            attribution: "&copy; Kartverket",
            maxZoom: 19
          }).addTo(mapRef.current);

          mapRef.current.setView(DEFAULT_CENTER, DEFAULT_ZOOM);

          const markNavigation = () => {
            lastNavigationAtRef.current = Date.now();
          };

          mapRef.current.on("dragstart", markNavigation);
          mapRef.current.on("movestart", markNavigation);
          mapRef.current.on("moveend", markNavigation);
          mapRef.current.on("zoomstart", markNavigation);
          mapRef.current.on("zoomend", markNavigation);

          let clickTimeout: ReturnType<typeof setTimeout> | null = null;

          mapRef.current.on("dblclick", (event: LeafletMouseEvent) => {
            if (clickTimeout) {
              clearTimeout(clickTimeout);
              clickTimeout = null;
            }
            mapRef.current?.setZoomAround(event.latlng, (mapRef.current?.getZoom() ?? 5) + 1);
          });

          mapRef.current.on("click", (event: LeafletMouseEvent) => {
            if (Date.now() - lastNavigationAtRef.current < NAVIGATION_CLICK_GUARD_MS) {
              return;
            }

            const point = {
              lat: Number(event.latlng.lat.toFixed(6)),
              lng: Number(event.latlng.lng.toFixed(6))
            };

            if (clickTimeout) {
              clearTimeout(clickTimeout);
            }

            clickTimeout = setTimeout(() => {
              clickTimeout = null;
              onMapClickRef.current?.(point);
            }, 250);
          });
        }

        window.setTimeout(() => mapRef.current?.invalidateSize(), 80);
        setMapReady(true);
      } catch {
        if (!cancelled) {
          setFailed(true);
        }
      }
    };

    void setup();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const L = leafletRef.current;
    if (!map || !L) {
      return;
    }

    const syncMarker = (
      markerRef: MutableRefObject<LeafletMarker | null>,
      pointKey: "pointA" | "pointB",
      point: RadioLinkPoint | null,
      label: string,
      tone: "warm" | "cool"
    ) => {
      if (!point) {
        markerRef.current?.remove();
        markerRef.current = null;
        return;
      }

      if (!markerRef.current) {
        markerRef.current = L.marker([point.lat, point.lng], {
          icon: createMarkerIcon(L, label, tone),
          draggable: true,
          autoPan: true
        }).addTo(map);

        markerRef.current.on("dragend", () => {
          const position = markerRef.current?.getLatLng();
          if (!position) {
            return;
          }

          onPointChangeRef.current?.(pointKey, {
            lat: Number(position.lat.toFixed(6)),
            lng: Number(position.lng.toFixed(6))
          });
        });
      } else {
        markerRef.current.setLatLng([point.lat, point.lng]);
      }
    };

    syncMarker(pointAMarkerRef, "pointA", pointA, "A", "cool");
    syncMarker(pointBMarkerRef, "pointB", pointB, "B", "warm");

    if (lineRef.current) {
      lineRef.current.remove();
      lineRef.current = null;
    }

    if (pointA && pointB) {
      lineRef.current = L.polyline(
        [
          [pointA.lat, pointA.lng],
          [pointB.lat, pointB.lng]
        ],
        {
          color: "#0f4c81",
          weight: 3,
          opacity: 0.9
        }
      ).addTo(map);

      if (fitKey && fitKey !== lastAppliedFitKeyRef.current) {
        map.fitBounds(lineRef.current.getBounds(), getCalculatedFitOptions());
        lastAppliedFitKeyRef.current = fitKey;
      }
    } else if (pointA || pointB) {
      const point = pointA ?? pointB;
      if (point) {
        map.panTo([point.lat, point.lng], { animate: false });
      }
    } else {
      map.setView(DEFAULT_CENTER, DEFAULT_ZOOM, { animate: false });
    }

    window.setTimeout(() => map.invalidateSize(), 80);
  }, [pointA, pointB, fitKey, mapReady]);

  useEffect(() => {
    return () => {
      pointAMarkerRef.current?.remove();
      pointAMarkerRef.current = null;
      pointBMarkerRef.current?.remove();
      pointBMarkerRef.current = null;
      lineRef.current?.remove();
      lineRef.current = null;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  return (
    <div className="radio-link-map relative h-full min-h-[280px] overflow-hidden rounded-[2rem] border border-slate-200 bg-slate-100">
      <div ref={containerRef} className="h-full w-full" />

      <div className="absolute right-4 top-4 z-20 max-w-[calc(100%-5.5rem)] rounded-full border border-slate-200 bg-white/95 px-3 py-1.5 text-center text-xs font-semibold text-slate-700 shadow-sm">
        {pointA && pointB
          ? t("radioMap.clickToMove").replace("{point}", nextPoint === "pointA" ? "A" : "B")
          : t("radioMap.nextClick").replace("{point}", nextPoint === "pointA" ? "A" : "B")}
      </div>

      {failed ? (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-950/45 px-6 text-center text-sm font-medium text-white">
          {t("radioMap.mapFailed")}
        </div>
      ) : null}

      <div className="absolute bottom-0 right-0 z-20 bg-white/90 px-1.5 py-0.5 text-[11px] leading-none text-slate-700">
        <a
          href="https://leafletjs.com"
          target="_blank"
          rel="noreferrer"
          className="text-[#2563eb] underline underline-offset-1"
        >
          Leaflet
        </a>{" "}
        | &copy; Kartverket
      </div>
    </div>
  );
}
