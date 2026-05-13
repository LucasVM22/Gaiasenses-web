"use client";

import type { RefObject } from "react";
import { useEffect, useRef, useState } from "react";
import type { MapRef } from "react-map-gl";

import type { Map3Pd4WebMoment } from "./pd4web-patches";
import { resolveMap3Pd4WebPatch } from "./pd4web-patches";

type Pd4WebModuleOptions = {
  wasmBinary: ArrayBuffer;
  locateFile?: (path: string, prefix?: string) => string;
  mainScriptUrlOrBlob?: string;
};

type Pd4WebGlobal = typeof Pd4Web;

type Pd4WebModuleFactory = (options: Pd4WebModuleOptions) => Promise<{
  Pd4Web: new () => Pd4WebGlobal;
}>;

type Pd4WebInstanceRecord = {
  loadPromise?: Promise<Pd4WebGlobal>;
  instance?: Pd4WebGlobal;
};

declare global {
  interface Window {
    __pd4webScriptLoads?: Record<string, Promise<HTMLScriptElement>>;
    __pd4webInstances?: Record<string, Pd4WebInstanceRecord>;
  }
}

type Pd4WebAudioProps = {
  moment: Map3Pd4WebMoment;
  composition: string | null;
  mapRef: RefObject<MapRef | null>;
  active?: boolean;
};

function appendScriptOnce(id: string, src: string): Promise<HTMLScriptElement> {
  const activeLoads = (window.__pd4webScriptLoads ??= {});
  const existingLoad = activeLoads[id];
  if (existingLoad) {
    return existingLoad;
  }

  const existingScript = document.getElementById(
    id,
  ) as HTMLScriptElement | null;
  if (existingScript) {
    if (existingScript.dataset.pd4webLoaded === "true") {
      const loaded = Promise.resolve(existingScript);
      activeLoads[id] = loaded;
      return loaded;
    }

    const pending = new Promise<HTMLScriptElement>((resolve, reject) => {
      const onLoad = () => {
        existingScript.dataset.pd4webLoaded = "true";
        existingScript.removeEventListener("load", onLoad);
        existingScript.removeEventListener("error", onError);
        resolve(existingScript);
      };
      const onError = () => {
        existingScript.removeEventListener("load", onLoad);
        existingScript.removeEventListener("error", onError);
        delete activeLoads[id];
        reject(new Error(`Failed to load script: ${src}`));
      };
      existingScript.addEventListener("load", onLoad, { once: true });
      existingScript.addEventListener("error", onError, { once: true });
    });

    activeLoads[id] = pending;
    return pending;
  }

  const created = new Promise<HTMLScriptElement>((resolve, reject) => {
    const script = document.createElement("script");
    script.id = id;
    script.src = src;
    script.async = false;
    script.onload = () => {
      script.dataset.pd4webLoaded = "true";
      resolve(script);
    };
    script.onerror = () => {
      delete activeLoads[id];
      reject(new Error(`Failed to load script: ${src}`));
    };
    document.body.appendChild(script);
  });

  activeLoads[id] = created;
  return created;
}

function fetchWasm(
  url: string,
  onProgress: (percentage: number) => void,
): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("GET", url);
    xhr.responseType = "arraybuffer";
    xhr.onprogress = ({ loaded, total, lengthComputable }) => {
      if (!lengthComputable || total <= 0) {
        return;
      }
      const pct = Math.floor((loaded / total) * 100);
      onProgress(pct);
    };
    xhr.onload = () => {
      if (xhr.status === 200) {
        resolve(xhr.response as ArrayBuffer);
        return;
      }
      reject(new Error(`Failed to load ${url}, status ${xhr.status}`));
    };
    xhr.onerror = () => reject(new Error(`Network error loading ${url}`));
    xhr.send();
  });
}

function getPd4WebInstanceRecord(key: string): Pd4WebInstanceRecord {
  const registry = (window.__pd4webInstances ??= {});
  return (registry[key] ??= {});
}

function isPd4WebPlaying(): boolean {
  const switchContainer = document.getElementById("Pd4WebAudioSwitch");
  return switchContainer?.classList.contains("pulse-icon") ?? false;
}

export default function Pd4WebAudio({
  moment,
  composition,
  mapRef,
  active = true,
}: Pd4WebAudioProps) {
  const patch = resolveMap3Pd4WebPatch({ moment, composition });
  const pdRef = useRef<Pd4WebGlobal | null>(null);
  const isAudioPlayingRef = useRef(false);
  const pausedByInactiveModeRef = useRef(false);
  const [progress, setProgress] = useState(0);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    if (!patch) {
      pdRef.current = null;
      isAudioPlayingRef.current = false;
      pausedByInactiveModeRef.current = false;
      setProgress(0);
      setIsLoaded(false);
      return;
    }

    let cancelled = false;
    const bundleBasePath = `/${patch.bundleFolder}/`;
    const instanceRecord = getPd4WebInstanceRecord(patch.id);

    const run = async () => {
      try {
        setProgress(0);
        setIsLoaded(false);
        if (!instanceRecord.loadPromise) {
          instanceRecord.loadPromise = (async () => {
            await appendScriptOnce(
              `pd4web-threads-${patch.bundleFolder}`,
              `/${patch.bundleFolder}/pd4web.threads.js`,
            );
            await appendScriptOnce(
              `pd4web-main-${patch.bundleFolder}`,
              `/${patch.bundleFolder}/pd4web.js`,
            );

            const wasmBinary = await fetchWasm(
              `/${patch.bundleFolder}/pd4web.wasm`,
              setProgress,
            );

            const moduleFactory = (
              globalThis as { Pd4WebModule?: Pd4WebModuleFactory }
            ).Pd4WebModule;
            if (typeof moduleFactory !== "function") {
              throw new Error("Pd4WebModule is not available on window");
            }

            const pdModule = await moduleFactory({
              wasmBinary,
              locateFile: (fileName: string) => `${bundleBasePath}${fileName}`,
              mainScriptUrlOrBlob: `${bundleBasePath}pd4web.js`,
            });

            const pd = new pdModule.Pd4Web();
            pd.openPatch("index.pd", {
              canvasId: "Pd4WebCanvas",
              soundToggleId: "Pd4WebAudioSwitch",
            });

            instanceRecord.instance = pd;
            return pd;
          })();
        }

        const pd = await instanceRecord.loadPromise;

        if (cancelled) {
          return;
        }

        pdRef.current = pd;
        isAudioPlayingRef.current = isPd4WebPlaying();
        setProgress(100);
        setIsLoaded(true);
      } catch (error) {
        console.error("Failed to initialize Pd4Web:", error);
      }
    };

    void run();

    return () => {
      cancelled = true;
      pdRef.current = null;
      setIsLoaded(false);
    };
  }, [patch]);

  useEffect(() => {
    if (!isLoaded) {
      return;
    }

    const switchContainer = document.getElementById("Pd4WebAudioSwitch");
    if (!switchContainer) {
      return;
    }

    const syncPlayingState = () => {
      isAudioPlayingRef.current = isPd4WebPlaying();
    };

    syncPlayingState();

    const observer = new MutationObserver(() => {
      syncPlayingState();
    });

    observer.observe(switchContainer, {
      attributes: true,
      attributeFilter: ["class"],
    });

    return () => {
      observer.disconnect();
    };
  }, [isLoaded]);

  useEffect(() => {
    const pd = pdRef.current;
    if (!isLoaded || !pd) {
      return;
    }

    const isCurrentlyPlaying = isPd4WebPlaying() || isAudioPlayingRef.current;
    isAudioPlayingRef.current = isCurrentlyPlaying;

    if (!active && isCurrentlyPlaying) {
      pd.toggleAudio();
      isAudioPlayingRef.current = false;
      pausedByInactiveModeRef.current = true;
      return;
    }

    if (active && pausedByInactiveModeRef.current) {
      pd.toggleAudio();
      isAudioPlayingRef.current = true;
      pausedByInactiveModeRef.current = false;
    }
  }, [active, isLoaded]);

  useEffect(() => {
    if (!patch || !isLoaded) {
      return;
    }

    const binding = patch.binding;
    if (binding.type !== "map-center") {
      return;
    }

    const pollMs = binding.pollMs ?? 100;
    const epsilon = binding.epsilon ?? 0.0001;
    let prevLat: number | null = null;
    let prevLng: number | null = null;

    const intervalId = window.setInterval(() => {
      const pd = pdRef.current;
      const map = mapRef.current;

      if (!pd || !map) {
        return;
      }

      const center = map.getCenter();
      const lat = center.lat;
      const lng = center.lng;

      if (
        prevLat !== null &&
        prevLng !== null &&
        Math.abs(lat - prevLat) < epsilon &&
        Math.abs(lng - prevLng) < epsilon
      ) {
        return;
      }

      prevLat = lat;
      prevLng = lng;

      if (binding.latitudeReceiver) {
        pd.sendFloat(binding.latitudeReceiver, lat);
      }
      if (binding.longitudeReceiver) {
        pd.sendFloat(binding.longitudeReceiver, lng);
      }
    }, pollMs);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [isLoaded, mapRef, patch]);

  if (!patch) {
    return null;
  }

  return (
    <>
      <span
        id="Pd4WebAudioSwitch"
        className="absolute top-4 left-4 z-20 flex h-12 w-12 items-center justify-center rounded-full bg-white/90 shadow-lg backdrop-blur-sm"
      />
      <canvas id="Pd4WebCanvas" tabIndex={0} className="hidden" />
      {progress < 100 && (
        <div className="absolute top-4 left-1/2 z-20 w-[min(320px,calc(100vw-2rem))] -translate-x-1/2 rounded-lg bg-white/90 px-3 py-2 shadow-lg backdrop-blur-sm">
          <div className="text-xs text-slate-700">
            Downloading WASM... {progress}%
          </div>
          <progress className="mt-1 h-2 w-full" value={progress} max={100} />
        </div>
      )}
    </>
  );
}
