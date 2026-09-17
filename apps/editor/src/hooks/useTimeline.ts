import {
  ticksToMs,
  msToTicks,
  type Midi,
  type TempoChange,
} from "@midiedit/core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PlaybackFeedback } from "../audio/usePlaybackFeedback";
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
  refresh: () => void;
}

interface UseTimelineOptions {
  midiData: Midi | null | undefined;
  audioPlayer: AudioPlayback;
  feedback: PlaybackFeedback;
}

export function useTimeline({
  midiData,
  audioPlayer,
  feedback,
}: UseTimelineOptions): Timeline {
  const {
    audio,
    duration: audioDurationMs,
    endCount: audioEndCount,
    play: playAudio,
    pause: pauseAudio,
    seek: seekAudio,
  } = audioPlayer;
  const [canPlay, setCanPlay] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackTick, setPlaybackTick] = useState(0);
  const [midiTotalTicks, setMidiTotalTicks] = useState(0);

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

  const refresh = useCallback(() => {
    const playback = computeMidiPlayback();
    setMidiTotalTicks(playback.totalTicks);
    setCanPlay(playback.hasNotes || audio !== undefined);
  }, [computeMidiPlayback]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const totalAudioTicks = useMemo(
    () =>
      audioDurationMs > 0 ? msToTicks(audioDurationMs, ppqn, tempoChanges) : 0,
    [audioDurationMs, ppqn, tempoChanges],
  );
  const totalTimelineTicks = Math.max(midiTotalTicks, totalAudioTicks);

  const handleSetPlaybackTick = useCallback(
    (tick: number) => {
      const nextTick = Math.max(0, tick);
      playheadTickRef.current = nextTick;
      setPlaybackTick(nextTick);
      seekAudio(ticksToMs(nextTick, ppqn, tempoChanges) / 1_000);
      feedback.seek(nextTick);
    },
    [feedback, ppqn, seekAudio, tempoChanges],
  );

  const pause = useCallback(() => {
    setIsPlaying(false);
    pauseAudio();
    feedback.stop();
  }, [feedback, pauseAudio]);

  useEffect(() => {
    pause();
    setPlaybackTick(0);
    playheadTickRef.current = 0;
  }, [midiData, audio, pause]);

  const play = useCallback(() => {
    if (!canPlay) {
      return;
    }

    if (
      totalTimelineTicks > 0 &&
      playheadTickRef.current >= totalTimelineTicks
    ) {
      handleSetPlaybackTick(0);
    }

    setIsPlaying(true);
    feedback.start(playheadTickRef.current);
    playAudio();
  }, [canPlay, feedback, playAudio, handleSetPlaybackTick, totalTimelineTicks]);

  const togglePlay = useCallback(() => {
    if (isPlaying) {
      pause();
      return;
    }
    play();
  }, [isPlaying, pause, play]);

  const seekStart = useCallback(() => {
    if (!isPlaying) {
      handleSetPlaybackTick(0);
    }
  }, [isPlaying, handleSetPlaybackTick]);

  const seekEnd = useCallback(() => {
    if (!isPlaying) {
      handleSetPlaybackTick(midiTotalTicks);
    }
  }, [isPlaying, midiTotalTicks, handleSetPlaybackTick]);

  useEffect(() => {
    if (!isPlaying || audioEndCount === 0) {
      return;
    }

    pause();
    handleSetPlaybackTick(0);
  }, [audioEndCount, isPlaying, pause, handleSetPlaybackTick]);

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
        feedback.updateTick(currentTick);

        if (totalTimelineTicks > 0 && currentTick >= totalTimelineTicks) {
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

          if (totalTimelineTicks > 0 && nextTick >= totalTimelineTicks) {
            playheadTickRef.current = totalTimelineTicks;
            setPlaybackTick(totalTimelineTicks);
            pause();
            return;
          }

          playheadTickRef.current = nextTick;
          setPlaybackTick(nextTick);
          feedback.updateTick(nextTick);
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
  }, [audio, feedback, isPlaying, pause, ppqn, tempoChanges, totalTimelineTicks]);

  return {
    isPlaying,
    canPlay,
    playbackTick,
    totalTimelineTicks,
    totalAudioTicks,
    play,
    pause,
    togglePlay,
    seekStart,
    seekEnd,
    setPlaybackTick: handleSetPlaybackTick,
    refresh,
  };
}
