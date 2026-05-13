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
    __pd4webPausedByMode?: Record<string, boolean>;
    Pd4WebAudioContext?: AudioContext;
  }
}

type Pd4WebAudioProps = {
  moment: Map3Pd4WebMoment;
  composition: string | null;
  mapRef: RefObject<MapRef | null>;
  active?: boolean;
};

function logPd4Web(event: string, details?: Record<string, unknown>) {
  console.log("[map3/pd4web]", event, details ?? {});
}

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

function getPd4WebPausedByModeRegistry(): Record<string, boolean> {
  return (window.__pd4webPausedByMode ??= {});
}

function isPd4WebPlaying(): boolean {
  const switchContainer = document.getElementById("Pd4WebAudioSwitch");
  return switchContainer?.classList.contains("pulse-icon") ?? false;
}

function clickPd4WebSwitch(): boolean {
  const switchContainer = document.getElementById("Pd4WebAudioSwitch");
  if (!(switchContainer instanceof HTMLElement)) {
    return false;
  }
  switchContainer.click();
  return true;
}

function forcePd4WebSwitchOff(): boolean {
  if (!clickPd4WebSwitch()) {
    return false;
  }

  // If first click turned it on (or left it on), click once more to guarantee off.
  if (isPd4WebPlaying()) {
    clickPd4WebSwitch();
  }

  return true;
}

function suspendPd4WebAudioContext(): boolean {
  const ctx = window.Pd4WebAudioContext;
  if (!ctx) {
    return false;
  }

  if (ctx.state === "suspended") {
    return true;
  }

  if (ctx.state === "running") {
    void ctx.suspend();
    return true;
  }

  return false;
}

function resumePd4WebAudioContext(): boolean {
  const ctx = window.Pd4WebAudioContext;
  if (!ctx) {
    return false;
  }

  if (ctx.state === "running") {
    return true;
  }

  if (ctx.state === "suspended") {
    void ctx.resume();
    return true;
  }

  return false;
}

export default function Pd4WebAudio({
  moment,
  composition,
  mapRef,
  active = true,
}: Pd4WebAudioProps) {
  const patch = resolveMap3Pd4WebPatch({ moment, composition });
  const pdRef = useRef<Pd4WebGlobal | null>(null);
  const lastPatchIdRef = useRef<string | null>(null);
  const isAudioPlayingRef = useRef(false);
  const pausedByInactiveModeRef = useRef(false);
  const [progress, setProgress] = useState(0);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    logPd4Web("render-state", {
      patchId: patch?.id ?? null,
      moment,
      composition,
      active,
      isLoaded,
    });
  }, [active, composition, isLoaded, moment, patch?.id]);

  useEffect(() => {
    if (!patch) {
      const previousPatchId = lastPatchIdRef.current;
      const pausedByModeRegistry = getPd4WebPausedByModeRegistry();

      if (previousPatchId) {
        const shouldPause = isPd4WebPlaying();
        logPd4Web("patch-deactivated", {
          previousPatchId,
          nativeSwitchPlaying: shouldPause,
          audioContextState: window.Pd4WebAudioContext?.state ?? "missing",
        });

        const suspended = suspendPd4WebAudioContext();
        const switchToggled = forcePd4WebSwitchOff();
        if (suspended || switchToggled) {
          pausedByModeRegistry[previousPatchId] = true;
          pausedByInactiveModeRef.current = true;
          isAudioPlayingRef.current = false;
          logPd4Web("patch-deactivated-paused", {
            previousPatchId,
            suspended,
            switchToggled,
            nativeSwitchPlayingBefore: shouldPause,
            nativeSwitchPlayingAfterClick: isPd4WebPlaying(),
            audioContextStateAfter:
              window.Pd4WebAudioContext?.state ?? "missing",
          });
        }
      }

      logPd4Web("no-patch", {
        hasPreviousPatch: Boolean(previousPatchId),
      });
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
    const pausedByModeRegistry = getPd4WebPausedByModeRegistry();
    lastPatchIdRef.current = patch.id;

    logPd4Web("effect-start", {
      patchId: patch.id,
      bundleFolder: patch.bundleFolder,
      hasInstance: Boolean(instanceRecord.instance),
      hasLoadPromise: Boolean(instanceRecord.loadPromise),
    });

    const run = async () => {
      try {
        setProgress(0);
        setIsLoaded(false);
        if (!instanceRecord.loadPromise) {
          logPd4Web("instance-create-begin", {
            patchId: patch.id,
            bundleFolder: patch.bundleFolder,
          });
          instanceRecord.loadPromise = (async () => {
            await appendScriptOnce(
              `pd4web-threads-${patch.bundleFolder}`,
              `/${patch.bundleFolder}/pd4web.threads.js`,
            );
            logPd4Web("threads-script-ready", {
              patchId: patch.id,
            });
            await appendScriptOnce(
              `pd4web-main-${patch.bundleFolder}`,
              `/${patch.bundleFolder}/pd4web.js`,
            );
            logPd4Web("main-script-ready", {
              patchId: patch.id,
            });

            const wasmBinary = await fetchWasm(
              `/${patch.bundleFolder}/pd4web.wasm`,
              setProgress,
            );
            logPd4Web("wasm-ready", {
              patchId: patch.id,
              byteLength: wasmBinary.byteLength,
            });

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

            logPd4Web("instance-create-complete", {
              patchId: patch.id,
              openedPatch: "index.pd",
            });

            instanceRecord.instance = pd;
            return pd;
          })();
        } else {
          logPd4Web("instance-reuse-load-promise", {
            patchId: patch.id,
            hasInstance: Boolean(instanceRecord.instance),
          });
        }

        const pd = await instanceRecord.loadPromise;

        if (cancelled) {
          logPd4Web("effect-cancelled-after-load", {
            patchId: patch.id,
          });
          return;
        }

        pdRef.current = pd;
        isAudioPlayingRef.current = isPd4WebPlaying();
        logPd4Web("instance-attached", {
          patchId: patch.id,
          nativeSwitchPlaying: isAudioPlayingRef.current,
          pausedByMode: pausedByModeRegistry[patch.id] ?? false,
        });

        if (pausedByModeRegistry[patch.id]) {
          const resumed = resumePd4WebAudioContext();
          if (!resumed && !isPd4WebPlaying() && clickPd4WebSwitch()) {
            logPd4Web("resume-after-mode-deactivation-clicked", {
              patchId: patch.id,
              nativeSwitchPlayingAfterClick: isPd4WebPlaying(),
            });
          }
          logPd4Web("resume-after-mode-deactivation", {
            patchId: patch.id,
            resumed,
            audioContextStateAfter:
              window.Pd4WebAudioContext?.state ?? "missing",
          });
          pausedByModeRegistry[patch.id] = false;
          pausedByInactiveModeRef.current = false;
          isAudioPlayingRef.current = isPd4WebPlaying();
        }

        setProgress(100);
        setIsLoaded(true);
      } catch (error) {
        console.error("Failed to initialize Pd4Web:", error);
      }
    };

    void run();

    return () => {
      cancelled = true;
      logPd4Web("effect-cleanup", {
        patchId: patch.id,
        nativeSwitchPlaying: isPd4WebPlaying(),
      });
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
      logPd4Web("native-switch-state", {
        patchId: patch?.id ?? null,
        active,
        isLoaded,
        nativeSwitchPlaying: isAudioPlayingRef.current,
        className: switchContainer.className,
      });
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
  }, [active, isLoaded, patch?.id]);

  useEffect(() => {
    if (!isLoaded || !pdRef.current) {
      return;
    }

    const isCurrentlyPlaying = isPd4WebPlaying() || isAudioPlayingRef.current;
    isAudioPlayingRef.current = isCurrentlyPlaying;

    logPd4Web("mode-transition-check", {
      patchId: patch?.id ?? null,
      active,
      isLoaded,
      nativeSwitchPlaying: isPd4WebPlaying(),
      refPlaying: isAudioPlayingRef.current,
      pausedByInactiveMode: pausedByInactiveModeRef.current,
    });

    if (!active && isCurrentlyPlaying) {
      logPd4Web("pause-on-player-entry-attempt", {
        patchId: patch?.id ?? null,
        nativeSwitchPlayingBefore: isPd4WebPlaying(),
      });
      if (clickPd4WebSwitch()) {
        isAudioPlayingRef.current = false;
        pausedByInactiveModeRef.current = true;
        logPd4Web("pause-on-player-entry-clicked", {
          patchId: patch?.id ?? null,
          nativeSwitchPlayingAfterClick: isPd4WebPlaying(),
        });
      } else {
        logPd4Web("pause-on-player-entry-missing-switch", {
          patchId: patch?.id ?? null,
        });
      }
      return;
    }

    if (active && pausedByInactiveModeRef.current) {
      logPd4Web("resume-on-map-return-attempt", {
        patchId: patch?.id ?? null,
        nativeSwitchPlayingBefore: isPd4WebPlaying(),
      });
      if (clickPd4WebSwitch()) {
        isAudioPlayingRef.current = true;
        pausedByInactiveModeRef.current = false;
        logPd4Web("resume-on-map-return-clicked", {
          patchId: patch?.id ?? null,
          nativeSwitchPlayingAfterClick: isPd4WebPlaying(),
        });
      } else {
        logPd4Web("resume-on-map-return-missing-switch", {
          patchId: patch?.id ?? null,
        });
      }
    }
  }, [active, isLoaded, patch?.id]);

  useEffect(() => {
    if (!patch || !isLoaded || !active) {
      logPd4Web("polling-skipped", {
        patchId: patch?.id ?? null,
        hasPatch: Boolean(patch),
        isLoaded,
        active,
      });
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

    logPd4Web("polling-start", {
      patchId: patch.id,
      pollMs,
      epsilon,
    });

    return () => {
      logPd4Web("polling-stop", {
        patchId: patch.id,
      });
      window.clearInterval(intervalId);
    };
  }, [active, isLoaded, mapRef, patch]);

  const showMapAudioUi = Boolean(patch) && moment === "map";

  return (
    <>
      <span
        id="Pd4WebAudioSwitch"
        className={`absolute top-4 left-4 z-20 h-12 w-12 items-center justify-center rounded-full bg-white/90 shadow-lg backdrop-blur-sm ${showMapAudioUi ? "flex" : "hidden"}`}
      />
      <canvas id="Pd4WebCanvas" tabIndex={0} className="hidden" />
      {showMapAudioUi && progress < 100 && (
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
