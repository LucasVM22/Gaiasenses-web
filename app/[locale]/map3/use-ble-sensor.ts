import { useRef, useCallback, useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { MapRef } from "react-map-gl";
import {
  useSensorSmoothing,
  type MotionDiagnostics,
  type MotionTuningSettings,
} from "./use-sensor-smoothing";
import type { espCo2Response } from "./ble-control";

type UseBLESensorOptions = {
  mapRef: React.RefObject<MapRef>;
  inputModeRef: React.MutableRefObject<string>;
  getNextComposition: () => [string, any];
  initialLat: number;
  initialLng: number;
  motionTuning: MotionTuningSettings;
  co2LevelThreshold: number;
};

export function useBLESensor({
  mapRef,
  inputModeRef,
  getNextComposition,
  initialLat,
  initialLng,
  motionTuning,
  co2LevelThreshold,
}: UseBLESensorOptions) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();

  const isCompositionPlayingRef = useRef(false);

  useEffect(() => {
    isCompositionPlayingRef.current = searchParams.get("mode") === "player";
  }, [searchParams]);

  const handleMotionStop = useCallback(() => {
    const mode = searchParams.get("mode") ?? "map";
    if (
      inputModeRef.current !== "mouse" &&
      mode === "map" &&
      !isCompositionPlayingRef.current
    ) {
      const center = mapRef.current?.getCenter().wrap();
      if (center) {
        const composition = getNextComposition();
        const newSearchParams = new URLSearchParams(searchParams.toString());
        newSearchParams.set("lat", center.lat.toString());
        newSearchParams.set("lng", center.lng.toString());
        newSearchParams.set("mode", "map");
        newSearchParams.set("composition", composition[0]);
        router.replace(`${pathname}?${newSearchParams.toString()}`);
      }
    }
  }, [
    searchParams,
    inputModeRef,
    mapRef,
    getNextComposition,
    pathname,
    router,
  ]);

  const { handleOnSensor, resetCalibration, diagnostics } = useSensorSmoothing(
    mapRef,
    handleMotionStop,
    motionTuning,
  );

  const handleControllerConnect = useCallback(
    (mode: string) => {
      inputModeRef.current = mode;
      resetCalibration();
    },
    [inputModeRef, resetCalibration],
  );

  const handleControllerDisconnect = useCallback(
    (mode: string) => {
      inputModeRef.current = mode;
      resetCalibration();
    },
    [inputModeRef, resetCalibration],
  );

  const handleOnCO2Sensor = useCallback(
    (data: espCo2Response) => {
      if (!isCompositionPlayingRef.current) {
        if (data.co2.ppm > co2LevelThreshold) {
          const composition = getNextComposition();
          const newSearchParams = new URLSearchParams(searchParams.toString());
          newSearchParams.set(
            "lat",
            mapRef.current?.getCenter().lat.toString() ?? initialLat.toString(),
          );
          newSearchParams.set(
            "lng",
            mapRef.current?.getCenter().lng.toString() ?? initialLng.toString(),
          );
          newSearchParams.set("composition", composition[0]);
          newSearchParams.set("mode", "player");
          newSearchParams.set("play", "true");
          router.replace(`${pathname}?${newSearchParams.toString()}`);
          isCompositionPlayingRef.current = true;
        }
      } else {
        if (data.co2.ppm <= co2LevelThreshold) {
          const newSearchParams = new URLSearchParams(searchParams.toString());
          newSearchParams.set("lat", searchParams.get("lat") ?? "0");
          newSearchParams.set("lng", searchParams.get("lng") ?? "0");
          newSearchParams.set(
            "composition",
            searchParams.get("composition") ?? "windLines",
          );
          newSearchParams.set("mode", "map");
          router.replace(`${pathname}?${newSearchParams.toString()}`);
          isCompositionPlayingRef.current = false;
        }
      }
    },
    [
      searchParams,
      mapRef,
      getNextComposition,
      initialLat,
      initialLng,
      pathname,
      router,
      co2LevelThreshold,
    ],
  );

  return {
    handleOnSensor,
    handleOnCO2Sensor,
    handleControllerConnect,
    handleControllerDisconnect,
    recalibrateSensor: resetCalibration,
    motionDiagnostics: diagnostics as MotionDiagnostics,
  };
}
