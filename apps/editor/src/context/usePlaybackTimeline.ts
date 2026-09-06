import {
  ticksToMs,
  msToTicks,
  type Midi,
  type TempoChange,
} from "@midiedit/core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AudioPlayback } from "./useAudioPlayback";

interface Timeline {
  isPlaying: boolean;
  canPlay: boolean;
  playbackTick: number;
  totalTicks: number;
  audioTotalTicks: number;
  play: () => void;
  pause: () => void;
  togglePlay: () => void;
  seekStart: () => void;
  seekEnd: () => void;
  setPlayheadTick: (tick: number) => void;
  refreshTotalTicks: () => void;
}

interface UseTimelineOptions {
  midiData: Midi | null | undefined;
  audioPlayer: AudioPlayback;
}

export function useTimeline({
  midiData,
  audioPlayer,
}: UseTimelineOptions): Timeline {
  const {
    audio,
    duration: audioDurationMs,
    endCount: audioEndCount,
    play: playAudio,
    pause: pauseAudio,
    seek: seekAudio,
  } = audioPlayer;
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackTick, setPlaybackTick] = useState(0);
  const [midiTotalTicks, setMidiTotalTicks] = useState(0);
  const [hasMidiNotes, setHasMidiNotes] = useState(false);

  const ppqn = midiData?.header.division ?? 480;
  const tempoChanges: TempoChange[] = useMemo(
    () =>
      midiData?.getTempoChanges() ?? [
        { tick: 0, microsecondsPerQuarterNote: 500_000 },
      ],
    [midiData],
  );
  const playheadTickRef = useRef(playbackTick);
  playheadTickRef.current = playbackTick;
  const animationRef = useRef<number | null>(null);
  const lastFrameMsRef = useRef<number | null>(null);

  const computeMidiPlayback = useCallback(() => {
    let maxTick = 0;
    let hasNotes = false;

    for (const track of midiData?.tracks ?? []) {
      for (const note of track.getNotes()) {
        hasNotes = true;
        maxTick = Math.max(maxTick, note.end);
      }
    }

    return { hasNotes, totalTicks: Math.max(maxTick, hasNotes ? 1 : 0) };
  }, [midiData]);

  const refreshTotalTicks = useCallback(() => {
    const playback = computeMidiPlayback();
    setMidiTotalTicks(playback.totalTicks);
    setHasMidiNotes(playback.hasNotes);
  }, [computeMidiPlayback]);

  useEffect(() => {
    refreshTotalTicks();
  }, [refreshTotalTicks]);

  const audioTotalTicks = useMemo(
    () =>
      audioDurationMs > 0 ? msToTicks(audioDurationMs, ppqn, tempoChanges) : 0,
    [audioDurationMs, ppqn, tempoChanges],
  );
  const totalTicks = Math.max(midiTotalTicks, audioTotalTicks);
  const canPlay = hasMidiNotes || audio !== undefined;

  const setPlayheadTick = useCallback(
    (tick: number) => {
      const nextTick = Math.max(0, tick);
      playheadTickRef.current = nextTick;
      setPlaybackTick(nextTick);
      seekAudio(ticksToMs(nextTick, ppqn, tempoChanges) / 1_000);
    },
    [ppqn, seekAudio, tempoChanges],
  );

  const pause = useCallback(() => {
    setIsPlaying(false);
    pauseAudio();
  }, [pauseAudio]);

  const play = useCallback(() => {
    if (!canPlay) {
      return;
    }

    setIsPlaying(true);
    playAudio();
  }, [canPlay, playAudio]);

  const togglePlay = useCallback(() => {
    if (isPlaying) {
      pause();
      return;
    }
    play();
  }, [isPlaying, pause, play]);

  const seekStart = useCallback(() => {
    if (!isPlaying) {
      setPlayheadTick(0);
    }
  }, [isPlaying, setPlayheadTick]);

  const seekEnd = useCallback(() => {
    if (!isPlaying) {
      setPlayheadTick(midiTotalTicks);
    }
  }, [isPlaying, midiTotalTicks, setPlayheadTick]);

  useEffect(() => {
    if (!isPlaying || audioEndCount === 0) {
      return;
    }

    seekAudio(0);
    playAudio();
  }, [audioEndCount, isPlaying, playAudio, seekAudio]);

  useEffect(() => {
    if (!isPlaying) {
      lastFrameMsRef.current = null;
      return;
    }

    const step = (frameTimeMs: number): void => {
      const lastFrameMs = lastFrameMsRef.current;
      lastFrameMsRef.current = frameTimeMs;

      if (lastFrameMs !== null) {
        const elapsedMs = frameTimeMs - lastFrameMs;
        const nextTick = msToTicks(
          ticksToMs(playheadTickRef.current, ppqn, tempoChanges) + elapsedMs,
          ppqn,
          tempoChanges,
        );

        playheadTickRef.current = nextTick;
        setPlaybackTick(nextTick);
      }

      animationRef.current = requestAnimationFrame(step);
    };

    animationRef.current = requestAnimationFrame(step);

    return () => {
      if (animationRef.current !== null) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [isPlaying, ppqn, tempoChanges]);

  return {
    isPlaying,
    canPlay,
    playbackTick,
    totalTicks,
    audioTotalTicks,
    play,
    pause,
    togglePlay,
    seekStart,
    seekEnd,
    setPlayheadTick,
    refreshTotalTicks,
  };
}
