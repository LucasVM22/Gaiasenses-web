"use client";

import type { RefObject } from "react";
import { useEffect, useRef, useState } from "react";
import type { MapRef } from "react-map-gl";

import type { Map3Pd4WebMoment } from "./pd4web-patches";
import { resolveMap3Pd4WebPatch } from "./pd4web-patches";
import { usePd4WebInstance } from "./pd4web-instance-context";
import { Button } from "@/components/ui/button";

const DEBUG = true;

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
  mapInputActive?: boolean;
  accX?: number | null;
  accY?: number | null;
  accZ?: number | null;
};

type PdSendLogEntry = {
  id: number;
  at: string;
  receiver: string;
  value: number;
};

function logPd4Web(event: string, details?: Record<string, unknown>) {
  if (DEBUG) {
    console.log("[map3/pd4web]", event, details ?? {});
  }
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
  if (!switchContainer) {
    return false;
  }

  const audioContextState = window.Pd4WebAudioContext?.state;
  if (audioContextState === "running") {
    return true;
  }
  if (audioContextState === "suspended") {
    return false;
  }

  // Pd4Web adds pulse-icon when waiting for user gesture (audio OFF).
  return !switchContainer.classList.contains("pulse-icon");
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
  mapInputActive = true,
  accX,
  accY,
  accZ,
}: Pd4WebAudioProps) {
  const { setPdInstance } = usePd4WebInstance();
  const patch = resolveMap3Pd4WebPatch({ moment, composition });
  const pdRef = useRef<Pd4WebGlobal | null>(null);
  const lastPatchIdRef = useRef<string | null>(null);
  const isAudioPlayingRef = useRef(false);
  const pausedByInactiveModeRef = useRef(false);
  const sendLogIdRef = useRef(0);
  const [progress, setProgress] = useState(0);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isAudioOn, setIsAudioOn] = useState(false);
  const [pollMsControl, setPollMsControl] = useState(100);
  const [epsilonControl, setEpsilonControl] = useState(0.0001);
  const [accEpsilonControl, setAccEpsilonControl] = useState(0.05);
  const [alwaysSendControl, setAlwaysSendControl] = useState(false);
  const [sendLog, setSendLog] = useState<PdSendLogEntry[]>([]);

  const appendSendLog = (receiver: string, value: number) => {
    sendLogIdRef.current += 1;
    const nextEntry: PdSendLogEntry = {
      id: sendLogIdRef.current,
      at: new Date().toLocaleTimeString("en-GB", { hour12: false }),
      receiver,
      value,
    };

    setSendLog((prev) => [nextEntry, ...prev].slice(0, 40));
  };

  useEffect(() => {
    if (!patch || patch.binding.type !== "map-center") {
      return;
    }

    setPollMsControl(patch.binding.pollMs ?? 100);
    setEpsilonControl(patch.binding.epsilon ?? 0.0001);
    setAccEpsilonControl(patch.binding.accEpsilon ?? 0.05);
    setAlwaysSendControl(false);
    setSendLog([]);
    sendLogIdRef.current = 0;
  }, [patch]);

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
      setPdInstance(null);
      isAudioPlayingRef.current = false;
      setIsAudioOn(false);
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
        setPdInstance(pd);
        isAudioPlayingRef.current = isPd4WebPlaying();
        setIsAudioOn(isAudioPlayingRef.current);
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
          setIsAudioOn(isAudioPlayingRef.current);
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
      setPdInstance(null);
      setIsAudioOn(false);
      setIsLoaded(false);
    };
  }, [patch, setPdInstance]);

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
      setIsAudioOn(isAudioPlayingRef.current);
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
    if (!patch || !isLoaded || !active || !mapInputActive) {
      logPd4Web("polling-skipped", {
        patchId: patch?.id ?? null,
        hasPatch: Boolean(patch),
        isLoaded,
        active,
        mapInputActive,
      });
      return;
    }

    const binding = patch.binding;
    if (binding.type !== "map-center") {
      return;
    }

    const pollMs = Math.max(16, Math.round(pollMsControl));
    const epsilon = Math.max(0, epsilonControl);
    const accEpsilon = Math.max(0, accEpsilonControl);
    let prevLat: number | null = null;
    let prevLng: number | null = null;
    let prevAccX: number | null = null;
    let prevAccY: number | null = null;
    let prevAccZ: number | null = null;

    const intervalId = window.setInterval(() => {
      const pd = pdRef.current;
      const map = mapRef.current;

      if (!pd || !map) {
        return;
      }

      const center = map.getCenter();
      const lat = center.lat;
      const lng = center.lng;

      if (!alwaysSendControl) {
        if (prevLat !== null && Math.abs(lat - prevLat) < epsilon) {
          return;
        }
        if (prevLng !== null && Math.abs(lng - prevLng) < epsilon) {
          return;
        }
      }

      prevLat = lat;
      prevLng = lng;

      if (binding.latitudeReceiver) {
        pd.sendFloat(binding.latitudeReceiver, lat);
        appendSendLog(binding.latitudeReceiver, lat);
      }
      if (binding.longitudeReceiver) {
        pd.sendFloat(binding.longitudeReceiver, lng);
        appendSendLog(binding.longitudeReceiver, lng);
      }

      if (
        accX === null ||
        accX === undefined ||
        accY === null ||
        accY === undefined ||
        accZ === null ||
        accZ === undefined
      ) {
        return;
      }

      const nextAccX = accX;
      const nextAccY = accY;
      const nextAccZ = accZ;

      if (!alwaysSendControl) {
        if (prevAccX !== null && Math.abs(nextAccX - prevAccX) < accEpsilon) {
          return;
        }
        if (prevAccY !== null && Math.abs(nextAccY - prevAccY) < accEpsilon) {
          return;
        }
        if (prevAccZ !== null && Math.abs(nextAccZ - prevAccZ) < accEpsilon) {
          return;
        }
      }

      prevAccX = nextAccX;
      prevAccY = nextAccY;
      prevAccZ = nextAccZ;

      if (binding.accXReceiver) {
        pd.sendFloat(binding.accXReceiver, prevAccX);
        appendSendLog(binding.accXReceiver, prevAccX);
      }
      if (binding.accYReceiver) {
        pd.sendFloat(binding.accYReceiver, prevAccY);
        appendSendLog(binding.accYReceiver, prevAccY);
      }
      if (binding.accZReceiver) {
        pd.sendFloat(binding.accZReceiver, prevAccZ);
        appendSendLog(binding.accZReceiver, prevAccZ);
      }
    }, pollMs);

    logPd4Web("polling-start", {
      patchId: patch.id,
      pollMs,
      epsilon,
      alwaysSendControl,
    });

    return () => {
      logPd4Web("polling-stop", {
        patchId: patch.id,
      });
      window.clearInterval(intervalId);
    };
  }, [
    accEpsilonControl,
    accX,
    accY,
    accZ,
    active,
    epsilonControl,
    isLoaded,
    mapInputActive,
    mapRef,
    patch,
    pollMsControl,
    alwaysSendControl,
  ]);

  const showMapAudioUi = Boolean(patch) && moment === "map";
  const showPd4WebDebugUi =
    Boolean(patch) && isAudioOn && patch?.binding.type === "map-center";

  const [isDebugUIOpen, setIsDebugUIOpen] = useState(false);

  const openDebugUI = () => {
    setIsDebugUIOpen(true);
  };

  const closeDebugUI = () => {
    setIsDebugUIOpen(false);
  };

  return (
    <>
      {DEBUG && showPd4WebDebugUi && (
        <div className="absolute top-[82svh] left-4 z-20">
          <Button variant="secondary" onClick={openDebugUI}>
            Pd4Web Debug
          </Button>
        </div>
      )}

      <div
        className={`absolute top-[90svh] p-1 left-4 z-20 h-12 w-12 items-center justify-center rounded-full bg-white/90 shadow-lg backdrop-blur-sm ${showMapAudioUi ? "flex" : "hidden"}`}
      >
        <span id="Pd4WebAudioSwitch" className={"mt-3 h-12 w-12"} />
      </div>

      <canvas id="Pd4WebCanvas" tabIndex={0} className="hidden" />
      {showMapAudioUi && progress < 100 && (
        <div className="absolute top-4 left-1/2 z-20 w-[min(320px,calc(100vw-2rem))] -translate-x-1/2 rounded-lg bg-white/90 px-3 py-2 shadow-lg backdrop-blur-sm">
          <div className="text-xs text-slate-700">
            Downloading WASM... {progress}%
          </div>
          <progress className="mt-1 h-2 w-full" value={progress} max={100} />
        </div>
      )}

      {DEBUG && isDebugUIOpen && (
        <div className="absolute bottom-20 left-4 z-20 w-[min(320px,calc(100vw-2rem))] rounded-lg bg-black/80 p-3 text-xs text-white shadow-lg backdrop-blur-sm">
          <div className="mb-2 font-semibold flex justify-between items-center">
            Pd4Web live tuning{" "}
            <Button variant="secondary" onClick={closeDebugUI}>
              close
            </Button>
          </div>
          <div className="mb-3 grid grid-cols-[1fr_auto] items-center gap-2">
            <div className="flex items-center gap-1">
              <label htmlFor="pd4web-poll-ms">pollMs</label>
              <span
                tabIndex={0}
                className="group relative inline-flex h-4 w-4 cursor-help items-center justify-center rounded-full border border-white/40 text-[10px] font-semibold text-white/90"
                aria-label="Help for pollMs"
              >
                ?
                <span
                  role="tooltip"
                  className="pointer-events-none absolute left-0 top-full z-30 mt-1 hidden w-60 rounded-md bg-slate-900 px-2 py-1 text-[11px] leading-4 text-white shadow-lg group-hover:block group-focus:block"
                >
                  How often map and sensor values are sent to the patch
                  (milliseconds). Lower is more responsive but costs more CPU;
                  higher sends fewer updates and is lighter.
                </span>
              </span>
            </div>
            <input
              id="pd4web-poll-ms"
              type="number"
              min={16}
              step={1}
              value={pollMsControl}
              onChange={(event) => {
                const next = Number(event.target.value);
                if (Number.isFinite(next)) {
                  setPollMsControl(Math.max(16, Math.round(next)));
                }
              }}
              className="w-24 rounded border border-white/30 bg-white/10 px-2 py-1 text-right text-white"
            />

            <div className="flex items-center gap-1">
              <label htmlFor="pd4web-epsilon">epsilon</label>
              <span
                tabIndex={0}
                className="group relative inline-flex h-4 w-4 cursor-help items-center justify-center rounded-full border border-white/40 text-[10px] font-semibold text-white/90"
                aria-label="Help for epsilon"
              >
                ?
                <span
                  role="tooltip"
                  className="pointer-events-none absolute left-0 top-full z-30 mt-1 hidden w-60 rounded-md bg-slate-900 px-2 py-1 text-[11px] leading-4 text-white shadow-lg group-hover:block group-focus:block"
                >
                  Minimum latitude or longitude change before sending a new map
                  value. Lower is more sensitive to small movement; higher
                  filters small motion and noise.
                </span>
              </span>
            </div>
            <input
              id="pd4web-epsilon"
              type="number"
              min={0}
              step={0.0001}
              value={epsilonControl}
              onChange={(event) => {
                const next = Number(event.target.value);
                if (Number.isFinite(next)) {
                  setEpsilonControl(Math.max(0, next));
                }
              }}
              className="w-24 rounded border border-white/30 bg-white/10 px-2 py-1 text-right text-white"
            />

            <div className="flex items-center gap-1">
              <label htmlFor="pd4web-acc-epsilon">accEpsilon</label>
              <span
                tabIndex={0}
                className="group relative inline-flex h-4 w-4 cursor-help items-center justify-center rounded-full border border-white/40 text-[10px] font-semibold text-white/90"
                aria-label="Help for accEpsilon"
              >
                ?
                <span
                  role="tooltip"
                  className="pointer-events-none absolute left-0 top-full z-30 mt-1 hidden w-60 rounded-md bg-slate-900 px-2 py-1 text-[11px] leading-4 text-white shadow-lg group-hover:block group-focus:block"
                >
                  Minimum accelerometer change required before sending accX,
                  accY, and accZ. Lower is more reactive but noisier; higher is
                  steadier and filters jitter.
                </span>
              </span>
            </div>
            <input
              id="pd4web-acc-epsilon"
              type="number"
              min={0}
              step={0.01}
              value={accEpsilonControl}
              onChange={(event) => {
                const next = Number(event.target.value);
                if (Number.isFinite(next)) {
                  setAccEpsilonControl(Math.max(0, next));
                }
              }}
              className="w-24 rounded border border-white/30 bg-white/10 px-2 py-1 text-right text-white"
            />

            <div className="flex items-center gap-1">
              <label htmlFor="pd4web-always-send">always send</label>
              <span
                tabIndex={0}
                className="group relative inline-flex h-4 w-4 cursor-help items-center justify-center rounded-full border border-white/40 text-[10px] font-semibold text-white/90"
                aria-label="Help for always send"
              >
                ?
                <span
                  role="tooltip"
                  className="pointer-events-none absolute left-0 top-full z-30 mt-1 hidden w-60 rounded-md bg-slate-900 px-2 py-1 text-[11px] leading-4 text-white shadow-lg group-hover:block group-focus:block"
                >
                  Sends lat, lng, accX, accY, and accZ on every polling tick,
                  ignoring epsilon thresholds and previous-value comparisons.
                </span>
              </span>
            </div>
            <label
              htmlFor="pd4web-always-send"
              className="flex items-center justify-end gap-2"
            >
              <input
                id="pd4web-always-send"
                type="checkbox"
                checked={alwaysSendControl}
                onChange={(event) => {
                  setAlwaysSendControl(event.target.checked);
                }}
                className="h-4 w-4 rounded border border-white/40 bg-white/10"
              />
              <span>{alwaysSendControl ? "ON" : "OFF"}</span>
            </label>
          </div>

          <div className="mb-1 flex items-center justify-between">
            <span className="font-semibold">Sent to webpatch</span>
            <button
              type="button"
              onClick={() => {
                setSendLog([]);
              }}
              className="rounded border border-white/30 px-2 py-0.5 text-[11px] hover:bg-white/10"
            >
              Clear
            </button>
          </div>

          <div className="max-h-36 overflow-y-auto rounded border border-white/20 bg-black/20 p-2 font-mono text-[11px] leading-4">
            {sendLog.length === 0 ? (
              <div className="text-white/60">No values sent yet.</div>
            ) : (
              sendLog.map((entry) => (
                <div key={entry.id}>
                  [{entry.at}] {entry.receiver}: {entry.value.toFixed(4)}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </>
  );
}
