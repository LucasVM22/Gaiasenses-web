import { useCallback, useEffect, useRef, useState } from "react";

import type { espCo2Response } from "./ble-control";

type UseCo2SimulationOptions = {
  onCo2Sample: (data: espCo2Response) => void;
  startPpm?: number;
  endPpm?: number;
  durationMs?: number;
  tickMs?: number;
};

type UseCo2SimulationResult = {
  startSimulation: () => void;
  isSimulating: boolean;
  simulatedPpm: number | null;
};

const DEFAULT_START_PPM = 2100;
const DEFAULT_END_PPM = 420;
const DEFAULT_DURATION_MS = 10000;
const DEFAULT_TICK_MS = 250;

export function useCo2Simulation({
  onCo2Sample,
  startPpm = DEFAULT_START_PPM,
  endPpm = DEFAULT_END_PPM,
  durationMs = DEFAULT_DURATION_MS,
  tickMs = DEFAULT_TICK_MS,
}: UseCo2SimulationOptions): UseCo2SimulationResult {
  const [isSimulating, setIsSimulating] = useState(false);
  const [simulatedPpm, setSimulatedPpm] = useState<number | null>(null);

  const onCo2SampleRef = useRef(onCo2Sample);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    onCo2SampleRef.current = onCo2Sample;
  }, [onCo2Sample]);

  const stopSimulation = useCallback(() => {
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setIsSimulating(false);
  }, []);

  const startSimulation = useCallback(() => {
    stopSimulation();

    const startTime = Date.now();
    setIsSimulating(true);
    setSimulatedPpm(startPpm);
    onCo2SampleRef.current({ co2: { ppm: startPpm } });

    intervalRef.current = setInterval(() => {
      const elapsed = Date.now() - startTime;
      if (elapsed >= durationMs) {
        onCo2SampleRef.current({ co2: { ppm: endPpm } });
        setSimulatedPpm(endPpm);
        stopSimulation();
        return;
      }

      const t = elapsed / durationMs;
      const ppm = Math.round(startPpm + (endPpm - startPpm) * t);
      setSimulatedPpm(ppm);
      onCo2SampleRef.current({ co2: { ppm } });
    }, tickMs);
  }, [durationMs, endPpm, startPpm, stopSimulation, tickMs]);

  useEffect(() => {
    return stopSimulation;
  }, [stopSimulation]);

  return {
    startSimulation,
    isSimulating,
    simulatedPpm,
  };
}
