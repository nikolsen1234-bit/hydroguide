export type LeafletMouseEvent = import("leaflet").LeafletMouseEvent;
export type LeafletMap = import("leaflet").Map;
export type LeafletMarker = import("leaflet").Marker;
export type LeafletPolyline = import("leaflet").Polyline;
export type LeafletNamespace = typeof import("leaflet");

let leafletLoader: Promise<LeafletNamespace> | null = null;

export function ensureLeaflet(): Promise<LeafletNamespace> {
  if (!leafletLoader) {
    leafletLoader = import("leaflet");
  }

  return leafletLoader;
}
