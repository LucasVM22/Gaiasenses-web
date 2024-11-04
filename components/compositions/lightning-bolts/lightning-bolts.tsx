import Composition from "../composition";
import LightningBoltsSketch from "./lightning-bolts-sketch";
import CompositionControls from "../composition-controls";
import DebugPanel from "@/components/debug-panel/debug-panel";
import { getLightning } from "@/components/getData";

export type LightningBoltsProps = {
  lat: string;
  lon: string;
  boltCount?: number;
  play: boolean;
  debug?: boolean;
  today?: boolean;
};

export default async function LightningBolts(props: LightningBoltsProps) {
  let boltCount = props.boltCount ?? 0;

  try {
    if (props.today) {
      const data = await getLightning(props.lat, props.lon, 100); 
      boltCount = data.count;
    }
  } catch (error) {
    console.log(error);
  }

  return (
    <Composition>
	      <LightningBoltsSketch boltCount={boltCount} play={props.play} />
        <CompositionControls play={props.play} />
        {props.debug && <DebugPanel></DebugPanel>}
    </Composition>
  );
}