"use client";

import { Button } from "@/components/ui/button";
import Leaflet, { LatLngExpression } from "leaflet";
import "leaflet/dist/leaflet.css";
import { usePathname, useSearchParams, useRouter } from "next/navigation";
import { PropsWithChildren, useEffect } from "react";
import {
  MapContainer,
  Marker,
  TileLayer,
  useMap,
  useMapEvents,
} from "react-leaflet";

export type MapProps = {
  lat: string | number;
  lon: string | number;
};

type LocationMarkerProps = PropsWithChildren<{
  position: Leaflet.LatLngLiteral;
  onUpdateMarker?: (lat: number, lon: number) => void;
  onSelectPosition?: (lat: number, lon: number) => void;
}>;

const DEFAULT_POSITION = [-22.85, -47.12];
const DEFAULT_ZOOM = 10;
const DEFAULT_BOUNDS = [
  [-60, -100],
  [25, -30],
];

function LocationMarker(props: LocationMarkerProps) {
  const map = useMap();

  useEffect(() => {
    // the props set for the `MapContainer` are immutable
    // and only applied on the first render. To reflect
    // position updates we must imperatively set the map's
    // center coordinate
    map.setView(props.position);
  }, [props.position, map]);

  useMapEvents({
    click: (e) => {
      if (props.onUpdateMarker !== undefined) {
        props.onUpdateMarker(e.latlng.lat, e.latlng.lng);
      }
    },
  });

  return props.position && <Marker position={props.position}></Marker>;
}

export default function Map(props: MapProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();

  const lat = Number(props.lat) || DEFAULT_POSITION[0];
  const lng = Number(props.lon) || DEFAULT_POSITION[1];

  // update Leaflet icons path
  // https://github.com/colbyfayock/next-leaflet-starter/blob/5f5cb801456138cdaa2ee454166b1b4bdbfcbb29/src/components/Map/DynamicMap.js#L17C3-L26C10
  useEffect(() => {
    (async function init() {
      // @ts-ignore
      delete Leaflet.Icon.Default.prototype._getIconUrl;
      Leaflet.Icon.Default.mergeOptions({
        iconRetinaUrl: "leaflet/marker-icon-2x.png",
        iconUrl: "leaflet/marker-icon.png",
        shadowUrl: "leaflet/marker-shadow.png",
      });
    })();
  }, []);

  const handleUpdatePosition = (lat: number, lon: number) => {
    const newParams = new URLSearchParams(searchParams.toString());
    newParams.set("lat", lat.toString());
    newParams.set("lon", lon.toString());
    router.replace(`${pathname}?${newParams}`);
  };

  const handleSelectPosition = (lat: number, lon: number) => {
    const params = new URLSearchParams();
    params.set("lat", lat.toString());
    params.set("lon", lon.toString());
    router.replace(`/?${params.toString()}`);
  };

  return (
    <div className="w-full h-full">
      <div className="absolute z-10 w-full flex justify-center m-3.5">
        <Button
          variant={"outline"}
          onClick={() => handleSelectPosition(lat, lng)}
        >
          Select Position
        </Button>
      </div>
      <MapContainer
        className="z-0"
        style={{ width: "100%", height: "100%" }}
        center={DEFAULT_POSITION as LatLngExpression}
        zoom={DEFAULT_ZOOM}
        minZoom={5}
        maxZoom={15}
        bounceAtZoomLimits={false}
        maxBounds={DEFAULT_BOUNDS as Leaflet.LatLngBoundsExpression}
        scrollWheelZoom={true}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <LocationMarker
          position={{ lat, lng }}
          onUpdateMarker={handleUpdatePosition}
          onSelectPosition={handleSelectPosition}
        />
      </MapContainer>
    </div>
  );
}