import Composition from "../composition";
import CloudBubbleSketch from "./cloud-bubble-sketch";
import CompositionControls from "../composition-controls";
import DebugPanel from "@/components/debug-panel/debug-panel";
import { getWeather } from "@/components/getData";
import { usePd4WebInstance } from "@/app/[locale]/map3/pd4web-instance-context";
import { useEffect } from "react";

export type CloudBubbleProps = {
  lat: string;
  lon: string;
  clouds?: number;
  play: boolean;
  debug?: boolean;
  today?: boolean;
  refresh?: string;
};

export default async function CloudBubble(props: CloudBubbleProps) {
  let clouds = props.clouds ?? 0;
  let play = props.play;
  const { pdRef } = usePd4WebInstance();
  if (props.today) {
    try {
      const data = await getWeather(props.lat, props.lon);
      clouds = data.clouds;
    } catch (error) {
      console.log(error);
    }
  }
  useEffect(() => {
    if (!play) {
      return;
    }

    const intervalId = setInterval(() => {
      const pd = pdRef.current;
      if (!pd) {
        return;
      }

      const lat = Math.random() * 180 - 90;
      const lon = Math.random() * 360 - 180;

      pd.sendFloat("lati", lat);
      pd.sendFloat("rotacaoSite", lon);
    }, 2000);

    return () => {
      clearInterval(intervalId);
    };
  }, [pdRef, play]);

  const refreshKey = props.refresh ?? "default";

  return (
    <Composition>
      <CloudBubbleSketch key={refreshKey} clouds={clouds} play={props.play} />
      <CompositionControls play={props.play} />
      {<DebugPanel data={[{ clouds }]} />}
    </Composition>
  );
}
