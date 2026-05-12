"use client";

/**
 * pd4web-map-audio.tsx
 *
 * Manages the full lifecycle of a single Pd4Web patch: loading, initialising,
 * forwarding live map data, and handling play/pause.
 *
 * --- Lifecycle overview ---
 *
 *  Mount
 *    │
 *    ▼
 *  Effect #1 — Script loading & instantiation
 *    ├─ If <script id="map3-pd4web-runtime-{id}"> already exists in the DOM
 *    │    (e.g. from a previous render): reuse it and skip injection.
 *    └─ Otherwise: inject a new <script src="/{bundleFolder}/pd4web.js">.
 *         The script sets window.Pd4WebModule when it loads.
 *         Once available, instantiate: new pd4WebModule.Pd4Web()
 *         → primePd4WebRuntime() → pdRef.current + window.Pd4Web
 *         Sets isReady = true when done.
 *
 *  Effect #2 — Position polling (runs when isReady becomes true)
 *    └─ If patch.binding.type === "map-center":
 *         Polls mapRef.current.getCenter() every `pollMs` ms.
 *         On each tick, if the center moved more than `epsilon` degrees,
 *         sends lat/lng (and optionally speed) to named pd receivers via
 *         pd.sendFloat(). Clears the interval on unmount.
 *
 *  Effect #3 — Auto-resume playback (runs when isReady + preferredPlaying)
 *    └─ Calls pd.init() once to start the Web Audio context and the patch.
 *         Required by browsers: audio context must start from a user gesture,
 *         but once the user has clicked Play we persist the preference and can
 *         call init() automatically on subsequent mounts.
 *
 *  Unmount
 *    └─ resetRuntime(): stops position polling, suspends audio, nulls pdRef,
 *         and places a hollow stub on window.Pd4Web so the orphaned gui.js
 *         DOM event listeners don't throw after teardown.
 *
 * --- play/pause toggle modes ---
 * Pd4Web patches may support audio toggling via two different APIs:
 *   "resumeSuspend" — pd.resumeAudio() / pd.suspendAudio()  (preferred)
 *   "soundToggle"   — pd.soundToggle() alternates on/off each call
 * The first call to toggleAfterInit() detects which API is available and
 * caches the result in toggleModeRef to avoid repeated feature checks.
 *
 * --- Sending data to a patch ---
 * Use pd.sendFloat(receiverName, value).
 * The receiver name must match a [receive <name>] object in the .pd file.
 * All data forwarding happens inside syncPosition; if you need to add new
 * receivers, extend the binding types in pd4web-patches.ts and add the
 * corresponding sendFloat call there.
 */

import { useEffect, useRef, useState } from "react";
import type { MapRef } from "react-map-gl";

import type { espCo2Response, espResponse } from "./ble-control";

import { primePd4WebRuntime } from "@/lib/pd4web-runtime";
import { Button } from "@/components/ui/button";
import {
  getPd4WebBundleBasePath,
  getPd4WebBundleScriptPath,
  getPd4WebScriptId,
  type Map3Pd4WebPatch,
} from "./pd4web-patches";

/**
 * Minimal interface for the object returned by `new pd4WebModule.Pd4Web()`.
 * Only methods actually used by this component are listed; Pd4Web exposes
 * additional methods (e.g. for MIDI, GUI) that we don't need here.
 */
type Pd4WebInstance = {
  /** Starts the Web Audio context and begins running the patch. Must be called
   *  from a user-gesture handler (or deferred until after the user has interacted). */
  init: () => Promise<void>;
  /** Sends a float message to a named [receive] object in the running patch. */
  sendFloat: (receiver: string, value: number) => void;
  /** Alternate play/pause — available on some patch builds. */
  soundToggle?: () => void;
  /** Pause audio without disposing the instance — preferred over soundToggle. */
  suspendAudio?: () => void;
  /** Resume after suspendAudio. */
  resumeAudio?: () => void;
  /** Active pointer/touch state tracked by pd4web.gui.js DOM event handlers. */
  Touches?: Record<string | number, unknown>;
  /** Present in newer generated runtimes; binds patch/ui wiring before init(). */
  openPatch?: (patchName: string) => void;
};

/** Shape of the Emscripten module factory exposed by the pd4web.js loader script. */
type Pd4WebModuleType = {
  Pd4Web: new () => Pd4WebInstance;
};

/** Options accepted by the Emscripten module factory. */
type Pd4WebModuleOptions = {
  locateFile?: (path: string, scriptDirectory: string) => string;
  mainScriptUrlOrBlob?: string;
  wasmBinary?: ArrayBuffer;
};

declare global {
  interface Window {
    /**
     * The live Pd4Web instance (or a hollow stub after teardown).
     * pd4web.gui.js accesses this global directly from DOM event listeners,
     * so it must always be defined — never delete it, only replace it.
     */
    Pd4Web?: Pd4WebInstance | null;
    /**
     * The Emscripten module factory injected by the pd4web.js <script> tag.
     * Calling it returns a promise that resolves to an object with the Pd4Web
     * constructor. Set by the loader script; undefined before the script loads.
     */
    Pd4WebModule?: (opts?: Pd4WebModuleOptions) => Promise<Pd4WebModuleType>;
  }
}

type Pd4WebMapAudioProps = {
  patch: Map3Pd4WebPatch;
  mapRef: React.RefObject<MapRef>;
  sensorDataRef: React.MutableRefObject<espResponse | null>;
  co2DataRef: React.MutableRefObject<espCo2Response | null>;
  preferredPlaying: boolean;
  onPreferredPlayingChange: (nextPlaying: boolean) => void;
};

function normalizeLongitude(lng: number): number {
  const normalized = ((((lng + 180) % 360) + 360) % 360) - 180;
  return Object.is(normalized, -180) ? 180 : normalized;
}

function clampLatitude(lat: number): number {
  return Math.max(-90, Math.min(90, lat));
}

function angularDeltaDegrees(a: number, b: number): number {
  return ((b - a + 540) % 360) - 180;
}

function clampAbs(value: number, limit: number): number {
  return Math.max(-limit, Math.min(limit, value));
}

export default function Pd4WebMapAudio({
  patch,
  mapRef,
  sensorDataRef,
  co2DataRef,
  preferredPlaying,
  onPreferredPlayingChange,
}: Pd4WebMapAudioProps) {
  // --- Refs (no re-render on change) ---
  /** The live Pd4Web instance; null until Effect #1 instantiates it. */
  const pdRef = useRef<Pd4WebInstance | null>(null);
  /** True once pd.init() has been called successfully (audio context started). */
  const initializedRef = useRef(false);
  /** Cached result of the toggle API detection — set on first toggle after init. */
  const toggleModeRef = useRef<"soundToggle" | "resumeSuspend" | null>(null);
  /** setInterval handle for the map-center position polling loop. */
  const positionTimerRef = useRef<number | null>(null);
  /** Last map center dispatched to the patch; used for epsilon filtering. */
  const lastPositionRef = useRef<{ lat: number; lng: number } | null>(null);
  /** Last map values actually sent to Pd after smoothing/slew limiting. */
  const lastSentMapRef = useRef<{ lat: number; lng: number } | null>(null);
  /** performance.now() timestamp of the last dispatched position; used for speed calculation. */
  const lastPositionTimeRef = useRef<number | null>(null);
  /** Last BLE accel values sent to pd; used to suppress duplicate sends. */
  const lastSentAccRef = useRef<{ x: number; y: number; z: number } | null>(
    null,
  );
  /** Last CO2 value sent to pd; used to suppress duplicate sends. */
  const lastSentCo2Ref = useRef<number | null>(null);
  /** Reference to the <script> element this component injected, so it can be
   *  removed on unmount (only set when we created the script ourselves). */
  const createdScriptRef = useRef<HTMLScriptElement | null>(null);

  // --- State (triggers re-render) ---
  const [isLoading, setIsLoading] = useState(true); // True while script + WASM are loading
  const [isReady, setIsReady] = useState(false); // True once the Pd4Web instance is created
  const [isPlaying, setIsPlaying] = useState(false); // Reflects current audio play state
  const [error, setError] = useState<string | null>(null); // User-visible error message
  const [debugLongitudeValue, setDebugLongitudeValue] = useState<number | null>(
    null,
  );

  // Derive the URLs needed to inject and configure the Emscripten loader.
  const scriptId = getPd4WebScriptId(patch.id);
  const bundleBasePath = getPd4WebBundleBasePath(patch.bundleFolder);
  const scriptSrc = getPd4WebBundleScriptPath(patch.bundleFolder);

  // ---------------------------------------------------------------------------
  // Effect #1 — Script loading & Pd4Web instantiation
  //
  // This effect runs whenever the patch changes (bundleBasePath / scriptId /
  // scriptSrc all change together when a different patch is selected).
  // It injects the Emscripten loader <script>, waits for it to run, then
  // calls window.Pd4WebModule() to create the compiled patch instance.
  // ---------------------------------------------------------------------------
  useEffect(() => {
    let cancelled = false;

    const loadScript = (script: HTMLScriptElement) =>
      new Promise<void>((resolve, reject) => {
        const onLoad = () => {
          script.dataset.loaded = "true";
          resolve();
        };

        const onError = () => {
          reject(new Error(`Failed to load runtime script: ${script.src}`));
        };

        script.addEventListener("load", onLoad, { once: true });
        script.addEventListener("error", onError, { once: true });
      });

    /**
     * Tears down everything related to the current pd instance.
     * Called both during unmount and before a re-initialisation.
     * Note: we intentionally keep window.Pd4Web as a stub (not null) because
     * pd4web.gui.js may have registered DOM event listeners that outlive the
     * instance and will fire asynchronously after teardown.
     */
    const resetRuntime = () => {
      if (positionTimerRef.current !== null) {
        window.clearInterval(positionTimerRef.current);
        positionTimerRef.current = null;
      }

      if (initializedRef.current) {
        pdRef.current?.suspendAudio?.();
      }
      pdRef.current = null;
      // Keep a stub with Touches so orphaned window-level pd4web.gui.js
      // event listeners (mousemove/mouseup/touchend) don't crash when they
      // access Pd4Web.Touches after the instance is torn down.
      window.Pd4Web = {
        Touches: {},
        init: async () => {},
        sendFloat: () => {},
      };
      initializedRef.current = false;
      toggleModeRef.current = null;
      lastPositionRef.current = null;
      lastSentMapRef.current = null;
      lastPositionTimeRef.current = null;
      lastSentAccRef.current = null;
      lastSentCo2Ref.current = null;
      setDebugLongitudeValue(null);
      setIsPlaying(false);
      setIsReady(false);
      setIsLoading(true);
    };

    /**
     * Creates the Pd4Web instance using the Emscripten factory.
     * `locateFile` redirects .wasm / .data file requests to the bundle folder
     * so they resolve correctly regardless of the Next.js base path.
     */
    const instantiatePd4Web = async () => {
      const moduleFactory = window.Pd4WebModule;
      if (!moduleFactory) {
        throw new Error("Pd4Web runtime is unavailable");
      }

      const moduleOptions: Pd4WebModuleOptions = {
        locateFile: (path) => `${bundleBasePath}${path}`,
      };

      try {
        const wasmResponse = await fetch(`${bundleBasePath}pd4web.wasm`);
        if (wasmResponse.ok) {
          moduleOptions.wasmBinary = await wasmResponse.arrayBuffer();
        }
      } catch {
        // Fallback to runtime's default wasm loading path when prefetch fails.
      }

      const pd4WebModule = await moduleFactory(moduleOptions);
      if (cancelled) {
        return;
      }

      pdRef.current = primePd4WebRuntime(new pd4WebModule.Pd4Web());

      // Newer Pd4Web builds require an explicit openPatch() call before init().
      // Keep this conditional so older bundles continue to work unchanged.
      if (typeof pdRef.current.openPatch === "function") {
        pdRef.current.openPatch("index.pd");
      }

      window.Pd4Web = pdRef.current;
      setError(null);
      setIsReady(true);
      setIsLoading(false);
    };

    const ensureRuntimeScriptsAndInit = async () => {
      try {
        const existingScript = document.getElementById(
          scriptId,
        ) as HTMLScriptElement | null;

        if (!existingScript) {
          const script = document.createElement("script");
          script.id = scriptId;
          script.src = scriptSrc;
          script.async = false;
          createdScriptRef.current = script;
          document.body.appendChild(script);
          await loadScript(script);
        } else if (existingScript.dataset.loaded !== "true") {
          await loadScript(existingScript);
        }

        if (cancelled) {
          return;
        }

        await instantiatePd4Web();
      } catch (err: unknown) {
        if (cancelled) {
          return;
        }

        setError(
          err instanceof Error ? err.message : "Failed to initialize Pd4Web",
        );
        setIsLoading(false);
      }
    };

    ensureRuntimeScriptsAndInit();

    return () => {
      cancelled = true;

      if (createdScriptRef.current) {
        createdScriptRef.current.remove();
      }

      createdScriptRef.current = null;
      resetRuntime();
    };
  }, [bundleBasePath, scriptId, scriptSrc]);

  // ---------------------------------------------------------------------------
  // Effect #2 — Map center + BLE sensor → pd receivers (position polling)
  //
  // Starts an interval that reads the live Mapbox map center and forwards it
  // to the patch as float messages. BLE acceleration values are also forwarded
  // whenever present. Only runs for "map-center" bindings.
  // Re-runs if isReady changes (patch re-instantiated) or if patch.binding
  // changes (different patch selected).
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (
      !isReady ||
      !isPlaying ||
      !initializedRef.current ||
      !pdRef.current ||
      patch.binding.type !== "map-center"
    ) {
      return;
    }

    const pd = pdRef.current;
    const binding = patch.binding;
    const positionEpsilon = binding.epsilon ?? 0.0001;
    const positionPollMs = binding.pollMs ?? 100;
    const sensorEpsilon = 0.0001;
    const mapSmoothingAlpha = 0.25;
    const maxLongitudeStepPerTick = 6;
    const maxLatitudeStepPerTick = 3;

    /**
     * Reads the current map center, applies epsilon filtering, and dispatches
     * lat/lng (and optionally angular speed) to the patch via sendFloat.
     *
     * Speed calculation:
     *   Δlat and cos-corrected Δlng give a displacement in degrees that is
     *   approximately scale-invariant on the globe. Dividing by Δt gives
     *   degrees/second — a reasonable proxy for "how fast is the user spinning
     *   the globe", independent of zoom level.
     */
    const syncPosition = () => {
      const center = mapRef.current?.getCenter();
      if (!center) {
        return;
      }

      const nextPosition = {
        lat: clampLatitude(center.lat),
        lng: normalizeLongitude(center.lng),
      };
      const lastPosition = lastPositionRef.current;
      const now = performance.now();

      const hasPositionChanged =
        !lastPosition ||
        Math.abs(lastPosition.lat - nextPosition.lat) >= positionEpsilon ||
        Math.abs(lastPosition.lng - nextPosition.lng) >= positionEpsilon;

      if (hasPositionChanged) {
        let nextLongitudeToSend = nextPosition.lng;
        let nextLatitudeToSend = nextPosition.lat;

        if (lastSentMapRef.current) {
          const previousSent = lastSentMapRef.current;
          const longitudeDelta = angularDeltaDegrees(
            previousSent.lng,
            nextPosition.lng,
          );
          const latitudeDelta = nextPosition.lat - previousSent.lat;

          const slewedLongitude = normalizeLongitude(
            previousSent.lng +
              clampAbs(longitudeDelta, maxLongitudeStepPerTick),
          );
          const slewedLatitude = clampLatitude(
            previousSent.lat + clampAbs(latitudeDelta, maxLatitudeStepPerTick),
          );

          nextLongitudeToSend = normalizeLongitude(
            previousSent.lng +
              angularDeltaDegrees(previousSent.lng, slewedLongitude) *
                mapSmoothingAlpha,
          );
          nextLatitudeToSend = clampLatitude(
            previousSent.lat +
              (slewedLatitude - previousSent.lat) * mapSmoothingAlpha,
          );
        }

        binding.longitudeReceiver &&
          pd.sendFloat(binding.longitudeReceiver, nextLongitudeToSend);
        if (binding.longitudeReceiver === "rotacaoSite") {
          setDebugLongitudeValue(nextLongitudeToSend);
        }
        binding.latitudeReceiver &&
          pd.sendFloat(binding.latitudeReceiver, nextLatitudeToSend);

        lastSentMapRef.current = {
          lat: nextLatitudeToSend,
          lng: nextLongitudeToSend,
        };
      }

      const acc = sensorDataRef.current?.acc;
      if (!lastSentAccRef.current && acc) {
        lastSentAccRef.current = {
          x: typeof acc.x === "number" && Number.isFinite(acc.x) ? acc.x : 0,
          y: typeof acc.y === "number" && Number.isFinite(acc.y) ? acc.y : 0,
          z: typeof acc.z === "number" && Number.isFinite(acc.z) ? acc.z : 0,
        };
      }
      if (
        binding.accXReceiver &&
        typeof acc?.x === "number" &&
        Number.isFinite(acc.x) &&
        (!lastSentAccRef.current ||
          Math.abs(lastSentAccRef.current.x - acc.x) >= sensorEpsilon)
      ) {
        pd.sendFloat(binding.accXReceiver, acc.x);
        lastSentAccRef.current = {
          x: acc.x,
          y: lastSentAccRef.current?.y ?? 0,
          z: lastSentAccRef.current?.z ?? 0,
        };
      }
      if (
        binding.accYReceiver &&
        typeof acc?.y === "number" &&
        Number.isFinite(acc.y) &&
        (!lastSentAccRef.current ||
          Math.abs(lastSentAccRef.current.y - acc.y) >= sensorEpsilon)
      ) {
        pd.sendFloat(binding.accYReceiver, acc.y);
        lastSentAccRef.current = {
          x: lastSentAccRef.current?.x ?? 0,
          y: acc.y,
          z: lastSentAccRef.current?.z ?? 0,
        };
      }
      if (
        binding.accZReceiver &&
        typeof acc?.z === "number" &&
        Number.isFinite(acc.z) &&
        (!lastSentAccRef.current ||
          Math.abs(lastSentAccRef.current.z - acc.z) >= sensorEpsilon)
      ) {
        pd.sendFloat(binding.accZReceiver, acc.z);
        lastSentAccRef.current = {
          x: lastSentAccRef.current?.x ?? 0,
          y: lastSentAccRef.current?.y ?? 0,
          z: acc.z,
        };
      }

      const co2 = co2DataRef.current?.co2?.ppm;
      if (
        binding.co2Receiver &&
        typeof co2 === "number" &&
        Number.isFinite(co2) &&
        (lastSentCo2Ref.current === null ||
          Math.abs(lastSentCo2Ref.current - co2) >= sensorEpsilon)
      ) {
        pd.sendFloat(binding.co2Receiver, co2);
        lastSentCo2Ref.current = co2;
      }

      if (
        hasPositionChanged &&
        binding.speedReceiver &&
        lastPosition &&
        lastPositionTimeRef.current !== null
      ) {
        const dtSeconds = (now - lastPositionTimeRef.current) / 1000;
        if (dtSeconds > 0) {
          const dlat = nextPosition.lat - lastPosition.lat;
          // cos correction: accounts for longitude lines converging near poles
          const dlng =
            angularDeltaDegrees(lastPosition.lng, nextPosition.lng) *
            Math.cos((nextPosition.lat * Math.PI) / 180);
          const speed = Math.sqrt(dlat * dlat + dlng * dlng) / dtSeconds;
          pd.sendFloat(binding.speedReceiver, speed);
        }
      }

      if (hasPositionChanged) {
        lastPositionRef.current = nextPosition;
        lastPositionTimeRef.current = now;
      }
    };

    syncPosition();
    positionTimerRef.current = window.setInterval(syncPosition, positionPollMs);

    return () => {
      if (positionTimerRef.current !== null) {
        window.clearInterval(positionTimerRef.current);
        positionTimerRef.current = null;
      }
    };
  }, [isReady, isPlaying, mapRef, patch.binding, sensorDataRef, co2DataRef]);

  // ---------------------------------------------------------------------------
  // Effect #3 — Auto-resume playback
  //
  // When the patch is ready and the user's stored preference is "playing",
  // automatically call pd.init() to start audio without requiring another click.
  // This is safe because the preference is only set to true after an explicit
  // user gesture (see handleToggle), satisfying browser autoplay policies.
  // The `initializedRef` guard ensures init() is called at most once per
  // component lifetime.
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!isReady || !preferredPlaying || initializedRef.current) {
      return;
    }

    let cancelled = false;

    const restorePlayback = async () => {
      const pd = pdRef.current;
      if (!pd) {
        return;
      }

      setError(null);

      try {
        await pd.init();
        if (cancelled) {
          return;
        }

        initializedRef.current = true;
        setIsPlaying(true);
      } catch (err) {
        if (cancelled) {
          return;
        }

        setError(
          err instanceof Error ? err.message : "Failed to restore audio",
        );
      }
    };

    restorePlayback();

    return () => {
      cancelled = true;
    };
  }, [isReady, preferredPlaying]);

  /**
   * Toggles audio after pd.init() has already been called.
   * Detects and caches which pause/resume API the patch supports on first use
   * so subsequent toggles don't repeat the feature check.
   */
  const toggleAfterInit = async (nextPlaying: boolean) => {
    const pd = pdRef.current;
    if (!pd) {
      return;
    }

    if (toggleModeRef.current === null) {
      if (
        typeof pd.resumeAudio === "function" &&
        typeof pd.suspendAudio === "function"
      ) {
        toggleModeRef.current = "resumeSuspend";
      } else if (typeof pd.soundToggle === "function") {
        toggleModeRef.current = "soundToggle";
      }
    }

    if (toggleModeRef.current === "resumeSuspend") {
      if (nextPlaying) {
        pd.resumeAudio?.();
      } else {
        pd.suspendAudio?.();
      }
      return;
    }

    pd.soundToggle?.();
  };

  /**
   * Play/pause button handler — the only place pd.init() may be called from a
   * direct user gesture. On first press: initialises the Web Audio context.
   * On subsequent presses: delegates to toggleAfterInit().
   * Also notifies the parent (Pd4WebMapAudioManager) so the preference is
   * persisted to localStorage.
   */
  const handleToggle = async () => {
    const pd = pdRef.current;
    if (!pd || isLoading) {
      return;
    }

    setError(null);

    try {
      if (!initializedRef.current) {
        await pd.init();
        initializedRef.current = true;
        setIsPlaying(true);
        onPreferredPlayingChange(true);
        return;
      }

      const nextPlaying = !isPlaying;
      await toggleAfterInit(nextPlaying);
      setIsPlaying(nextPlaying);
      onPreferredPlayingChange(nextPlaying);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to toggle audio");
    }
  };

  return (
    <div className="absolute left-4 bottom-4 z-20 flex flex-col gap-2 pointer-events-auto">
      <Button
        onClick={handleToggle}
        disabled={!isReady || isLoading}
        variant="secondary"
      >
        {isLoading
          ? `Loading ${patch.label.toLowerCase()}`
          : isPlaying
            ? `Pause ${patch.label.toLowerCase()}`
            : `Play ${patch.label.toLowerCase()}`}
      </Button>
      {error ? (
        <div className="max-w-[18rem] rounded bg-white/90 px-3 py-2 text-xs text-red-600 shadow-sm">
          {error}
        </div>
      ) : null}
      {patch.binding.type === "map-center" &&
      patch.binding.longitudeReceiver ? (
        <div className="rounded bg-black/65 px-2 py-1 font-mono text-[10px] leading-none text-white shadow-sm">
          {patch.binding.longitudeReceiver}:{" "}
          {debugLongitudeValue?.toFixed(4) ?? "-"}
        </div>
      ) : null}
    </div>
  );
}
