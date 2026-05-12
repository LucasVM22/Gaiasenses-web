"use client";

/**
 * pd4web-map-audio-manager.tsx
 *
 * Stateful shell that decides WHICH Pd4Web patch (if any) should be active
 * right now and renders a single <Pd4WebMapAudio> accordingly.
 *
 * --- Responsibilities ---
 * 1. Read the current URL state (mode + composition query params) to determine
 *    the "moment" — either "map" (globe view) or "player" (composition modal).
 * 2. Call resolveMap3Pd4WebPatch() to find the matching patch descriptor from
 *    the registry in pd4web-patches.ts.
 * 3. Persist and restore the user's play/pause preference across page loads via
 *    localStorage so audio auto-resumes if the user had it playing.
 * 4. Render <Pd4WebMapAudio key={activePatch.id} …> — the `key` prop is critical:
 *    it forces a full unmount/remount whenever the active patch changes, which
 *    tears down the old WebAssembly runtime cleanly before starting the new one.
 *
 * --- Component hierarchy ---
 *   GaiasensesMap
 *     └─ Pd4WebMapAudioManager   ← you are here
 *          └─ Pd4WebMapAudio     ← manages one patch's lifecycle & play button
 */

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { MapRef } from "react-map-gl";

import type { espCo2Response, espResponse } from "./ble-control";
import Pd4WebMapAudio from "./pd4web-map-audio";
import {
  resolveMap3Pd4WebPatch,
  type Map3Pd4WebMoment,
} from "./pd4web-patches";

type Pd4WebMapAudioManagerProps = {
  mapRef: React.RefObject<MapRef>;
  sensorDataRef: React.MutableRefObject<espResponse | null>;
  co2DataRef: React.MutableRefObject<espCo2Response | null>;
};

/** localStorage key that remembers whether map audio was playing. */
const MAP_AUDIO_PREFERENCE_STORAGE_KEY = "map3-map-audio-playing";

/**
 * Maps the raw `mode` URL param to a typed Map3Pd4WebMoment.
 * Any value other than "player" is treated as the default "map" moment.
 */
function normalizeMoment(value: string | null): Map3Pd4WebMoment {
  return value === "player" ? "player" : "map";
}

export default function Pd4WebMapAudioManager({
  mapRef,
  sensorDataRef,
  co2DataRef,
}: Pd4WebMapAudioManagerProps) {
  const searchParams = useSearchParams();
  const [shouldResumeMapAudio, setShouldResumeMapAudio] = useState(false);
  const moment = normalizeMoment(searchParams.get("mode"));
  const composition = searchParams.get("composition");

  useEffect(() => {
    // Runs once on mount — hydrate play preference from localStorage.
    // We intentionally avoid reading localStorage during render to prevent
    // server/client hydration mismatches (localStorage is browser-only).
    const savedPreference = window.localStorage.getItem(
      MAP_AUDIO_PREFERENCE_STORAGE_KEY,
    );

    setShouldResumeMapAudio(savedPreference === "true");
  }, []);

  useEffect(() => {
    // Persist the play preference whenever it changes so it can be restored
    // on the next page load (see hydration effect above).
    window.localStorage.setItem(
      MAP_AUDIO_PREFERENCE_STORAGE_KEY,
      String(shouldResumeMapAudio),
    );
  }, [shouldResumeMapAudio]);

  // Resolve the patch for the current URL state. Returns null if no patch
  // matches, which causes this component to render nothing (no audio).
  const activePatch = resolveMap3Pd4WebPatch({
    moment,
    composition,
  });

  if (!activePatch) {
    return null;
  }

  return (
    <Pd4WebMapAudio
      key={activePatch.id}
      patch={activePatch}
      mapRef={mapRef}
      sensorDataRef={sensorDataRef}
      co2DataRef={co2DataRef}
      preferredPlaying={shouldResumeMapAudio}
      onPreferredPlayingChange={setShouldResumeMapAudio}
    />
  );
}
