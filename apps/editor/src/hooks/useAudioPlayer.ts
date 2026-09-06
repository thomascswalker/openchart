import { useCallback, useEffect, useState } from "react";
import type { Audio } from "ts-audio";

export type AudioPlayer = ReturnType<typeof Audio>;

export interface AudioPlayback {
  audio: AudioPlayer | undefined;
  duration: number;
  fileName: string | null;
  endCount: number;
  setAudio: (audio: AudioPlayer) => void;
  setFileName: (name: string | null) => void;
  play: () => void;
  pause: () => void;
  seek: (seconds: number) => void;
}

export function useAudioPlayer(): AudioPlayback {
  const [audio, setAudio] = useState<AudioPlayer>();
  const [duration, setDuration] = useState(0);
  const [fileName, setFileName] = useState<string | null>(null);
  const [endCount, setEndCount] = useState(0);

  useEffect(() => {
    return () => {
      audio?.destroy();
    };
  }, [audio]);

  useEffect(() => {
    if (!audio) {
      setDuration(0);
      return;
    }

    let isCurrent = true;
    const updateDuration = () => {
      if (isCurrent) {
        setDuration(audio.duration * 1_000);
      }
    };

    audio.on("ready", updateDuration);
    updateDuration();

    return () => {
      isCurrent = false;
    };
  }, [audio]);

  useEffect(() => {
    if (!audio) {
      return;
    }

    let isCurrent = true;
    const handleEnd = () => {
      if (isCurrent) {
        setEndCount((count) => count + 1);
      }
    };

    audio.on("end", handleEnd);

    return () => {
      isCurrent = false;
    };
  }, [audio]);

  const play = useCallback(() => {
    audio?.play();
  }, [audio]);

  const pause = useCallback(() => {
    audio?.pause();
  }, [audio]);

  const seek = useCallback(
    (timeSeconds: number) => {
      audio?.seek(timeSeconds);
    },
    [audio],
  );

  return {
    audio,
    duration,
    fileName,
    endCount,
    setAudio,
    setFileName,
    play,
    pause,
    seek,
  };
}
