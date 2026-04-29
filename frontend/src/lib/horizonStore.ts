/**
 * Simple in-memory store for the last-fetched horizon profile.
 * Not persisted — lives only during the session.
 * Written by useSolarRadiationFetch, read by AnalysisPage.
 */

import { useSyncExternalStore } from "react";
import type { HorizonProfile } from "./solarEngine";

let currentProfile: HorizonProfile | null = null;
const listeners = new Set<() => void>();

function notify() {
  for (const l of listeners) l();
}

export function setHorizonProfile(profile: HorizonProfile | null) {
  currentProfile = profile;
  notify();
}

export function useHorizonProfile(): HorizonProfile | null {
  return useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => listeners.delete(cb); },
    () => currentProfile,
  );
}
