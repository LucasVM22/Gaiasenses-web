"use client";

import Map, {
  FullscreenControl,
  NavigationControl,
  GeolocateControl,
  Popup,
  ViewStateChangeEvent,
  MapRef,
} from "react-map-gl";
import { MapPin } from "lucide-react";

// @ts-ignore
import "mapbox-gl/dist/mapbox-gl.css";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

import type { espCo2Response, espResponse } from "./ble-control";
import type { Map3Pd4WebMoment } from "./pd4web-patches";

import InfoButton from "./info-button";
import NotificationDialog from "./notifications-dialog";
import BLEControl from "./ble-control";
import AutoMove from "./auto-move";
import CoordinateDisplay from "./coordinate-display";
import MotionTuningPanel from "./motion-tuning-panel";
import Pd4WebAudio from "./pd4web-audio";
import { useCompositionQueue } from "./use-composition-queue";
import { useMapInteractions } from "./use-map-interactions";
import { useAutoMode } from "./use-auto-mode";
import { useBLESensor } from "./use-ble-sensor";
import { useCo2Simulation } from "./use-co2-simulation";
import {
  DEFAULT_MOTION_TUNING_SETTINGS,
  type MotionTuningSettings,
} from "./use-sensor-smoothing";
import { ClimaData } from "./use-composition-queue";
import {
  DEFAULT_CO2_LEVEL_THRESHOLD,
  enabledCompositionKeys,
} from "./map-constants";
import CompositionsInfo from "@/components/compositions/compositions-info";

const MOTION_TUNING_STORAGE_KEY = "map3-motion-tuning-settings";
const CO2_THRESHOLD_STORAGE_KEY = "map3-co2-threshold";

type GaiasensesMapProps = {
  children: ReactNode;
  initialLat: number;
  initialLng: number;
  mode: Map3Pd4WebMoment;
  composition: string | null;
  InfoButtonText: string;
  clima: ClimaData;
};

export default function GaiasensesMap({
  children,
  initialLat,
  initialLng,
  mode,
  composition,
  InfoButtonText,
  clima,
}: GaiasensesMapProps) {
  const hasSharedPd4WebPatch =
    composition !== null &&
    Boolean(
      CompositionsInfo[composition as keyof typeof CompositionsInfo]?.pd4web,
    );
  const isMapAudioActive = mode === "map" || hasSharedPd4WebPatch;
  const isMapInputActive = mode === "map";

  const mapRef = useRef<MapRef>(null);
  const latestSensorDataRef = useRef<espResponse | null>(null);
  const latestCo2DataRef = useRef<espCo2Response | null>(null);
  const [motionTuning, setMotionTuning] = useState<MotionTuningSettings>(
    DEFAULT_MOTION_TUNING_SETTINGS,
  );
  const [co2Threshold, setCo2Threshold] = useState(DEFAULT_CO2_LEVEL_THRESHOLD);

  useEffect(() => {
    const saved = window.localStorage.getItem(MOTION_TUNING_STORAGE_KEY);
    if (!saved) {
      return;
    }

    try {
      const parsed = JSON.parse(saved) as Partial<MotionTuningSettings>;
      setMotionTuning((current) => ({ ...current, ...parsed }));
    } catch {
      window.localStorage.removeItem(MOTION_TUNING_STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    const saved = window.localStorage.getItem(CO2_THRESHOLD_STORAGE_KEY);
    if (!saved) {
      return;
    }

    const parsed = Number(saved);
    if (!Number.isFinite(parsed)) {
      window.localStorage.removeItem(CO2_THRESHOLD_STORAGE_KEY);
      return;
    }

    setCo2Threshold(parsed);
  }, []);

  useEffect(() => {
    window.localStorage.setItem(
      MOTION_TUNING_STORAGE_KEY,
      JSON.stringify(motionTuning),
    );
  }, [motionTuning]);

  useEffect(() => {
    window.localStorage.setItem(CO2_THRESHOLD_STORAGE_KEY, `${co2Threshold}`);
  }, [co2Threshold]);

  const { getNextComposition } = useCompositionQueue(clima);

  const {
    latlng,
    showPopup,
    setShowPopup,
    isDataLoading,
    inputModeRef,
    handleMove,
    handleMoveEnd,
    onGeolocate,
    handleMouseMove,
  } = useMapInteractions({ initialLat, initialLng, getNextComposition });

  const {
    autoActive,
    autoLocations,
    onAutoActivateToggle,
    onMoveEndAuto,
    saveAutoLocations,
  } = useAutoMode(mapRef);

  const {
    handleOnSensor,
    handleOnCO2Sensor,
    handleControllerConnect,
    handleControllerDisconnect,
    recalibrateSensor,
    motionDiagnostics,
  } = useBLESensor({
    mapRef,
    inputModeRef,
    getNextComposition,
    initialLat,
    initialLng,
    motionTuning,
    co2LevelThreshold: co2Threshold,
  });

  const {
    startSimulation: startCo2Simulation,
    isSimulating: isCo2Simulating,
    simulatedPpm: simulatedCo2Ppm,
  } = useCo2Simulation({
    onCo2Sample: handleOnCO2Sensor,
    startPpm: co2Threshold + 500,
    endPpm: co2Threshold,
    durationMs: 30_000,
    tickMs: 250,
  });

  return (
    <div
      style={{ height: "100svh", width: "100svw" }}
      className="relative"
      onMouseMove={handleMouseMove}
    >
      <CoordinateDisplay lat={latlng[0]} lng={latlng[1]} />
      <div>
        <NotificationDialog />
      </div>
      <div>
        <InfoButton />
      </div>
      <MotionTuningPanel
        settings={motionTuning}
        diagnostics={motionDiagnostics}
        co2Threshold={co2Threshold}
        onChange={setMotionTuning}
        onCo2ThresholdChange={setCo2Threshold}
        onReset={() => setMotionTuning(DEFAULT_MOTION_TUNING_SETTINGS)}
        onRecalibrate={recalibrateSensor}
        onSimulateCo2={startCo2Simulation}
        isCo2Simulating={isCo2Simulating}
        simulatedCo2Ppm={simulatedCo2Ppm}
      />
      <div>
        <AnimatePresence>
          {false && (
            <motion.div
              className="absolute top-1/2 left-1/2 bg-white z-[1] p-2 -translate-x-[50%] rounded-sm shadow-md"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <div>
                <p className="text-sm italic">
                  Mova o globo para descobrir novas composições
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <Map
        ref={mapRef}
        reuseMaps
        mapboxAccessToken={process.env.NEXT_PUBLIC_MAPBOX_API_ACCESS_TOKEN}
        initialViewState={{
          latitude: latlng[0],
          longitude: latlng[1],
          zoom: 2,
        }}
        mapStyle="mapbox://styles/mapbox/standard"
        projection={{ name: "globe" }}
        onMove={handleMove}
        onMoveEnd={(e: ViewStateChangeEvent) => {
          handleMoveEnd(e);
          if (autoActive) onMoveEndAuto(e);
        }}
      >
        <FullscreenControl containerId="total-container" />
        <NavigationControl />
        <AutoMove
          isActive={autoActive}
          locations={autoLocations}
          compositionOptions={enabledCompositionKeys}
          onSaveLocations={saveAutoLocations}
          onActivate={onAutoActivateToggle}
          onDeactivate={onAutoActivateToggle}
        />
        <BLEControl
          onSensor={(data) => {
            latestSensorDataRef.current = data;
            handleOnSensor(data);
          }}
          onCo2Sensor={(data) => {
            latestCo2DataRef.current = data;
            handleOnCO2Sensor(data);
          }}
          onConnect={handleControllerConnect}
          onDisconnect={handleControllerDisconnect}
        />
        <GeolocateControl onGeolocate={onGeolocate} />
        {showPopup && (
          <Popup
            latitude={latlng[0]}
            longitude={latlng[1]}
            anchor="bottom"
            offset={36}
            onClose={() => setShowPopup(false)}
            closeOnClick={true}
            closeButton={false}
            maxWidth="40rem"
          >
            {isDataLoading ? (
              <div className="p-3 min-w-[200px] space-y-2">
                <div className="h-4 bg-gray-200 rounded animate-pulse w-3/4" />
                <div className="h-4 bg-gray-200 rounded animate-pulse w-1/2" />
                <div className="h-4 bg-gray-200 rounded animate-pulse w-5/6" />
                <div className="h-4 bg-gray-200 rounded animate-pulse w-2/3" />
              </div>
            ) : (
              children
            )}
          </Popup>
        )}
      </Map>

      <Pd4WebAudio
        moment={mode}
        composition={composition}
        mapRef={mapRef}
        active={isMapAudioActive}
        mapInputActive={isMapInputActive}
      />

      {/*
        CSS-centered pin — always at the visual center of the map canvas.
        Pure CSS positioning: zero React re-renders during globe movement.
        translate(-50%, -100%) puts the pin tip precisely at 50%/50%.
      */}
      <div className="absolute inset-0 pointer-events-none z-10">
        <MapPin
          size={36}
          fill="white"
          strokeWidth={2}
          className="text-blue-600 drop-shadow-lg absolute"
          style={{
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -100%)",
          }}
        />
      </div>
    </div>
  );
}
