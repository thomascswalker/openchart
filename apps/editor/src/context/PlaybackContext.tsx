import { ticksToMs, msToTicks, type TempoChange } from "@midiedit/core";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useEditor } from "./EditorContext";
import type { Audio } from "ts-audio";

type AudioPlayer = ReturnType<typeof Audio>;

interface PlaybackContextType {
  isPlaying: boolean;
  canPlay: boolean;
  playheadTick: number;
  totalTicks: number;
  audioDurationMs: number;
  audioTotalTicks: number;
  audioFileName: string | null;

  audio?: AudioPlayer;
  setAudio: (newAudio: AudioPlayer) => void;
  setAudioFileName: (name: string | null) => void;

  play: () => void;
  pause: () => void;
  togglePlay: () => void;
  setPlayheadTick: (tick: number) => void;
  refreshTotalTicks: () => void;
}

const PlaybackContext = createContext<PlaybackContextType | undefined>(
  undefined,
);

export function PlaybackProvider({ children }: { children: React.ReactNode }) {
  const { midiData } = useEditor();
  const [audio, setAudio] = useState<AudioPlayer>();

  const [isPlaying, setIsPlaying] = useState(false);
  const [playheadTick, setPlayheadTickState] = useState(0);
  const [totalTicks, setTotalTicks] = useState(0);
  const [midiTotalTicks, setMidiTotalTicks] = useState(0);
  const [hasMidiNotes, setHasMidiNotes] = useState(false);
  const [audioDurationMs, setAudioDurationMs] = useState(0);
  const [audioFileName, setAudioFileName] = useState<string | null>(null);

  const ppqn = midiData?.header.division ?? 480;
  const tempoChanges: TempoChange[] = useMemo(
    () =>
      midiData?.getTempoChanges() ?? [
        { tick: 0, microsecondsPerQuarterNote: 500_000 },
      ],
    [midiData],
  );

  const playheadTickRef = useRef(playheadTick);
  playheadTickRef.current = playheadTick;

  const animationRef = useRef<number | null>(null);
  const lastFrameMsRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      audio?.destroy();
    };
  }, [audio]);

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

  useEffect(() => {
    const playback = computeMidiPlayback();
    setMidiTotalTicks(playback.totalTicks);
    setHasMidiNotes(playback.hasNotes);
  }, [computeMidiPlayback]);

  const refreshTotalTicks = useCallback(() => {
    const playback = computeMidiPlayback();
    setMidiTotalTicks(playback.totalTicks);
    setHasMidiNotes(playback.hasNotes);
  }, [computeMidiPlayback]);

  const audioTotalTicks = useMemo(
    () =>
      audioDurationMs > 0 ? msToTicks(audioDurationMs, ppqn, tempoChanges) : 0,
    [audioDurationMs, ppqn, tempoChanges],
  );

  useEffect(() => {
    setTotalTicks(Math.max(midiTotalTicks, audioTotalTicks));
  }, [audioTotalTicks, midiTotalTicks]);

  useEffect(() => {
    if (!audio) {
      setAudioDurationMs(0);
      return;
    }

    let isCurrent = true;
    const updateDuration = () => {
      if (isCurrent) {
        setAudioDurationMs(audio.duration * 1_000);
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
      if (!isCurrent || !isPlaying) {
        return;
      }

      audio.seek(0);
      audio.play();
    };

    audio.on("end", handleEnd);

    return () => {
      isCurrent = false;
    };
  }, [audio, isPlaying]);

  const canPlay = hasMidiNotes || audio !== undefined;

  const setPlayheadTick = useCallback(
    (tick: number) => {
      const nextTick = Math.max(0, tick);
      playheadTickRef.current = nextTick;
      setPlayheadTickState(nextTick);

      if (audio) {
        audio.seek(ticksToMs(nextTick, ppqn, tempoChanges) / 1_000);
      }
    },
    [audio, ppqn, tempoChanges],
  );

  const pause = useCallback(() => {
    setIsPlaying(false);
    if (audio) {
      audio.pause();
    }
  }, [audio]);

  const play = useCallback(() => {
    if (!canPlay) {
      return;
    }

    setIsPlaying(true);
    if (audio) {
      audio.play();
    }
  }, [audio, canPlay]);

  const togglePlay = useCallback(() => {
    if (isPlaying) {
      pause();
      return;
    }

    play();
  }, [isPlaying, pause, play]);

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
        setPlayheadTickState(nextTick);
      }

      animationRef.current = requestAnimationFrame(step);
    };

    animationRef.current = requestAnimationFrame(step);

    return () => {
      if (animationRef.current !== null) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [audio, hasMidiNotes, isPlaying, ppqn, tempoChanges, totalTicks]);

  return (
    <PlaybackContext.Provider
      value={{
        isPlaying,
        canPlay,
        playheadTick,
        totalTicks,
        audioDurationMs,
        audioTotalTicks,
        audioFileName,
        audio,
        setAudio,
        setAudioFileName,
        play,
        pause,
        togglePlay,
        setPlayheadTick,
        refreshTotalTicks,
      }}
    >
      {children}
    </PlaybackContext.Provider>
  );
}

export function usePlayback(): PlaybackContextType {
  const context = useContext(PlaybackContext);
  if (!context) {
    throw new Error("usePlayback must be used within a PlaybackProvider");
  }
  return context;
}
