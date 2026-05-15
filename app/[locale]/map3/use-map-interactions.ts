import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type {
  MarkerDragEvent,
  ViewStateChangeEvent,
  GeolocateResultEvent,
  MapRef,
} from "react-map-gl";

type UseMapInteractionsOptions = {
  initialLat: number;
  initialLng: number;
};

export function useMapInteractions({
  initialLat,
  initialLng,
}: UseMapInteractionsOptions) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();

  const [latlng, setLatlng] = useState<[number, number]>([
    initialLat,
    initialLng,
  ]);
  const [showPopup, setShowPopup] = useState(true);
  const [isDataLoading, setIsDataLoading] = useState(false);
  const inputModeRef = useRef<string>("mouse");

  useEffect(() => {
    setShowPopup(true);
    setIsDataLoading(false);
    // Snap the marker to the confirmed server-side position.
    // During sensor movement the marker is frozen; this corrects it when motion stops.
    setLatlng([initialLat, initialLng]);
  }, [initialLat, initialLng]);

  const updatePopupPosition = useCallback(
    (lat: number, lng: number) => {
      if (showPopup) return;
      const newSearchParams = new URLSearchParams(searchParams.toString());
      newSearchParams.set("lat", lat.toString());
      newSearchParams.set("lng", lng.toString());
      console.log("router replacing");
      newSearchParams.set("mode", "map");
      newSearchParams.delete("composition");
      newSearchParams.delete("play");
      router.replace(`${pathname}?${newSearchParams.toString()}`);
      // Show popup immediately; loading clears when server responds with new initialLat/initialLng
      setShowPopup(true);
      setIsDataLoading(true);
    },
    [showPopup, searchParams, pathname, router],
  );

  const handleDrag = useCallback((event: MarkerDragEvent) => {
    const wrapped = event.lngLat.wrap();
    setLatlng([wrapped.lat, wrapped.lng]);
  }, []);

  const handleDragStart = useCallback(() => {
    setShowPopup(false);
  }, []);

  const handleDragEnd = useCallback(
    (event: MarkerDragEvent) => {
      const mode = searchParams.get("mode");
      if (!showPopup && mode === "map") {
        const lngLat = event.lngLat.wrap();
        updatePopupPosition(lngLat.lat, lngLat.lng);
      }
    },
    [showPopup, searchParams, updatePopupPosition],
  );

  const handleMove = useCallback(
    (e: ViewStateChangeEvent) => {
      if (inputModeRef.current !== "mouse") {
        // During sensor movement skip all state updates — the map canvas moves via WebGL,
        // no React re-renders needed. Only hide the popup once (the `if` guard makes
        // all subsequent 60fps calls a no-op since showPopup is already false).
        if (showPopup) setShowPopup(false);
        return;
      }

      const center = e.target.getCenter();
      setLatlng([
        parseFloat(center.lat.toString()),
        parseFloat(center.lng.toString()),
      ]);
      if (showPopup) setShowPopup(false);
    },
    [showPopup],
  );

  const handleMoveEnd = useCallback(
    (e: ViewStateChangeEvent) => {
      if (inputModeRef.current === "mouse" && !showPopup) {
        const lngLat = e.target.getCenter().wrap();
        updatePopupPosition(lngLat.lat, lngLat.lng);
      }
    },
    [showPopup, updatePopupPosition],
  );

  const onGeolocate = useCallback(
    (e: GeolocateResultEvent) => {
      setLatlng([e.coords.latitude, e.coords.longitude]);
      const newSearchParams = new URLSearchParams(searchParams.toString());
      newSearchParams.set("initial", "false");
      newSearchParams.set("lat", e.coords.latitude.toString());
      newSearchParams.set("lon", e.coords.longitude.toString());
      newSearchParams.set("mode", "map");
      router.replace(`${pathname}?${newSearchParams.toString()}`);
    },
    [searchParams, pathname, router],
  );

  const toggleMode = useCallback((mode: string) => {
    console.log("Toggling input mode to:", mode);
    inputModeRef.current = mode;
  }, []);

  function handleMouseMove() {
    // Reserved for future mouse-idle detection
  }

  return {
    latlng,
    showPopup,
    setShowPopup,
    isDataLoading,
    inputModeRef,
    handleDrag,
    handleDragStart,
    handleDragEnd,
    handleMove,
    handleMoveEnd,
    onGeolocate,
    toggleMode,
    handleMouseMove,
  };
}
