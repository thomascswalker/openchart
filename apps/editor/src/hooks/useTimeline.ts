import {
  ticksToMs,
  msToTicks,
  type Midi,
  type TempoChange,
} from "@midiedit/core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AudioPlayback } from "./useAudioPlayer";

export interface Timeline {
  isPlaying: boolean;
  canPlay: boolean;
  playbackTick: number;
  totalTimelineTicks: number;
  totalAudioTicks: number;
  play: () => void;
  pause: () => void;
  togglePlay: () => void;
  seekStart: () => void;
  seekEnd: () => void;
  setPlaybackTick: (tick: number) => void;
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

  useEffect(() => {
    pause();
    setPlaybackTick(0);
    playheadTickRef.current = 0;
  }, [midiData, audio, pause]);

  const play = useCallback(() => {
    if (!canPlay) {
      return;
    }

    if (totalTicks > 0 && playheadTickRef.current >= totalTicks) {
      setPlayheadTick(0);
    }

    setIsPlaying(true);
    playAudio();
  }, [canPlay, playAudio, setPlayheadTick, totalTicks]);

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

    pause();
    setPlayheadTick(0);
  }, [audioEndCount, isPlaying, pause, setPlayheadTick]);

  useEffect(() => {
    if (!isPlaying) {
      lastFrameMsRef.current = null;
      return;
    }

    const step = (frameTimeMs: number): void => {
      if (audio) {
        const audioTimeMs = audio.currentTime * 1_000;
        const currentTick = msToTicks(audioTimeMs, ppqn, tempoChanges);

        playheadTickRef.current = currentTick;
        setPlaybackTick(currentTick);

        if (totalTicks > 0 && currentTick >= totalTicks) {
          pause();
          return;
        }
      } else {
        const lastFrameMs = lastFrameMsRef.current;
        lastFrameMsRef.current = frameTimeMs;

        if (lastFrameMs !== null) {
          const elapsedMs = frameTimeMs - lastFrameMs;
          const currentMs =
            ticksToMs(playheadTickRef.current, ppqn, tempoChanges) + elapsedMs;
          const nextTick = msToTicks(currentMs, ppqn, tempoChanges);

          if (totalTicks > 0 && nextTick >= totalTicks) {
            playheadTickRef.current = totalTicks;
            setPlaybackTick(totalTicks);
            pause();
            return;
          }

          playheadTickRef.current = nextTick;
          setPlaybackTick(nextTick);
        }
      }

      animationRef.current = requestAnimationFrame(step);
    };

    animationRef.current = requestAnimationFrame(step);

    return () => {
      if (animationRef.current !== null) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [audio, isPlaying, pause, ppqn, tempoChanges, totalTicks]);

  return {
    isPlaying,
    canPlay,
    playbackTick,
    totalTimelineTicks: totalTicks,
    totalAudioTicks: audioTotalTicks,
    play,
    pause,
    togglePlay,
    seekStart,
    seekEnd,
    setPlaybackTick: setPlayheadTick,
    refreshTotalTicks,
  };
}
