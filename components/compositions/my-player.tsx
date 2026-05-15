"use client";

import { useEffect, useMemo, useRef, useState } from "react";

let sharedAudio: HTMLAudioElement | null = null;
let sharedFadeIntervalId: number | null = null;
let sharedFadeToken = 0;
let sharedActiveOwnerId: string | null = null;

function getSharedAudio(): HTMLAudioElement {
  if (!sharedAudio) {
    sharedAudio = new Audio();
    sharedAudio.loop = true;
    sharedAudio.preload = "auto";
    sharedAudio.volume = 1;
  }

  return sharedAudio;
}

function clearSharedFadeInterval() {
  if (sharedFadeIntervalId !== null) {
    window.clearInterval(sharedFadeIntervalId);
    sharedFadeIntervalId = null;
  }
}

function fadeOutSharedAudio(durationMs: number) {
  const audio = getSharedAudio();
  const token = ++sharedFadeToken;
  clearSharedFadeInterval();

  const safeDurationMs = Math.max(0, durationMs);
  if (safeDurationMs === 0 || audio.paused) {
    audio.pause();
    audio.volume = 1;
    return;
  }

  const intervalMs = 40;
  const totalSteps = Math.max(1, Math.ceil(safeDurationMs / intervalMs));
  const startVolume = Number.isFinite(audio.volume) ? audio.volume : 1;
  const step = startVolume / totalSteps;

  sharedFadeIntervalId = window.setInterval(() => {
    if (token !== sharedFadeToken) {
      clearSharedFadeInterval();
      return;
    }

    const nextVolume = Math.max(0, audio.volume - step);
    audio.volume = nextVolume;

    if (nextVolume <= 0.001) {
      clearSharedFadeInterval();
      audio.pause();
      audio.volume = 1;
    }
  }, intervalMs);
}

export default function Player({
  path,
  play,
  fadeOutMs = 1200,
}: {
  path: string;
  play: boolean | "true" | "false";
  fadeOutMs?: number;
}) {
  const ownerIdRef = useRef(
    `mp3-player-${Math.random().toString(36).slice(2)}`,
  );
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const shouldPlay = play === true || play === "true";
  const progressValue = useMemo(() => {
    if (!Number.isFinite(duration) || duration <= 0) {
      return 0;
    }

    return Math.min(duration, Math.max(0, currentTime));
  }, [currentTime, duration]);

  useEffect(() => {
    const audio = getSharedAudio();
    const ownerId = ownerIdRef.current;

    if (shouldPlay) {
      sharedActiveOwnerId = ownerId;
      clearSharedFadeInterval();

      const requestedPath = new URL(path, window.location.origin).toString();
      if (audio.src !== requestedPath) {
        audio.src = requestedPath;
        audio.currentTime = 0;
      }

      audio.loop = true;
      audio.volume = 1;
      void audio.play().catch((error) => {
        console.log("Audio play was blocked:", error);
      });
      return;
    }

    if (sharedActiveOwnerId === ownerId) {
      fadeOutSharedAudio(fadeOutMs);
    }
  }, [fadeOutMs, path, shouldPlay]);

  useEffect(() => {
    const audio = getSharedAudio();
    const ownerId = ownerIdRef.current;

    const syncProgress = () => {
      if (sharedActiveOwnerId !== ownerId) {
        return;
      }

      setCurrentTime(audio.currentTime || 0);
      setDuration(Number.isFinite(audio.duration) ? audio.duration : 0);
    };

    audio.addEventListener("timeupdate", syncProgress);
    audio.addEventListener("loadedmetadata", syncProgress);
    audio.addEventListener("durationchange", syncProgress);
    audio.addEventListener("play", syncProgress);
    audio.addEventListener("pause", syncProgress);

    syncProgress();

    return () => {
      audio.removeEventListener("timeupdate", syncProgress);
      audio.removeEventListener("loadedmetadata", syncProgress);
      audio.removeEventListener("durationchange", syncProgress);
      audio.removeEventListener("play", syncProgress);
      audio.removeEventListener("pause", syncProgress);

      if (sharedActiveOwnerId === ownerId) {
        fadeOutSharedAudio(fadeOutMs);
      }
    };
  }, [fadeOutMs]);

  const handleSeek = (nextValue: number) => {
    const audio = getSharedAudio();
    if (!Number.isFinite(nextValue)) {
      return;
    }

    const safeTime = Math.max(0, Math.min(nextValue, duration || 0));
    audio.currentTime = safeTime;
    setCurrentTime(safeTime);
  };

  return (
    <div className="absolute bottom-0 w-full">
      <div
        className={`${
          play ? "opacity-0" : "opacity-80"
        } bg-transparent duration-700 transition-opacity px-4 pb-2`}
      >
        <input
          type="range"
          min={0}
          max={duration > 0 ? duration : 1}
          step={0.01}
          value={progressValue}
          onChange={(event) => {
            handleSeek(Number(event.target.value));
          }}
          className="w-full accent-white"
          aria-label="Audio progress"
        />
      </div>
    </div>
  );
}
