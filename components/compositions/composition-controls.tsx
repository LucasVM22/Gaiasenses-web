"use client";

import TogglePlayButton from "./toggle-play-button";
import { PatchData } from "@/hooks/types";

import Player from "./my-player";

export default function CompositionControls({
  play,
  patchPath,
  messages,
  mp3 = false,
  fadeOutMs = 1000,
}: {
  play: boolean;
  patchPath?: PatchData["path"];
  messages?: PatchData["messages"];
  mp3?: boolean;
  fadeOutMs?: number;
}) {
  //  console.log(patchPath);
  // console.log(messages);

  function handlePlay() {
    //play sound

    if (patchPath) {
      console.log("webpd is removed");
    }
  }

  async function handlePause() {
    if (patchPath) {
      console.log("webpd is removed");
    }
  }

  const webpdHandlers = mp3 ? {} : { onPlay: handlePlay, onPause: handlePause };

  return (
    <>
      <TogglePlayButton play={play} {...webpdHandlers}></TogglePlayButton>
      {patchPath && mp3 && (
        <Player path={patchPath} play={play} fadeOutMs={fadeOutMs}></Player>
      )}
    </>
  );
}
