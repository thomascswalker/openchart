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
import { useEditor } from "./Context";

interface PlaybackContextType {
  isPlaying: boolean;
  playheadTick: number;
  totalTicks: number;
  play: () => void;
  pause: () => void;
  togglePlay: () => void;
  setPlayheadTick: (tick: number) => void;
}

const PlaybackContext = createContext<PlaybackContextType | undefined>(
  undefined,
);

export function PlaybackProvider({ children }: { children: React.ReactNode }) {
  const { midiData } = useEditor();

  const [isPlaying, setIsPlaying] = useState(false);
  const [playheadTick, setPlayheadTickState] = useState(0);
  const [totalTicks, setTotalTicks] = useState(0);

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

  const rafRef = useRef<number | null>(null);
  const lastFrameMsRef = useRef<number | null>(null);

  useEffect(() => {
    let maxTick = 0;

    for (const track of midiData?.tracks ?? []) {
      for (const note of track.getNotes()) {
        maxTick = Math.max(maxTick, note.end);
      }
    }

    setTotalTicks(maxTick);
  }, [midiData]);

  const setPlayheadTick = useCallback(
    (tick: number) => {
      setPlayheadTickState(Math.max(0, Math.min(tick, totalTicks)));
    },
    [totalTicks],
  );

  const pause = useCallback(() => {
    setIsPlaying(false);
  }, []);

  const play = useCallback(() => {
    if (totalTicks <= 0) {
      return;
    }

    // Restart from the beginning once playback has reached the end.
    if (playheadTickRef.current >= totalTicks) {
      setPlayheadTickState(0);
    }

    setIsPlaying(true);
  }, [totalTicks]);

  const togglePlay = useCallback(() => {
    if (isPlaying) {
      pause();
    } else {
      play();
    }
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
        const currentMs = ticksToMs(
          playheadTickRef.current,
          ppqn,
          tempoChanges,
        );
        const nextTick = msToTicks(currentMs + elapsedMs, ppqn, tempoChanges);

        if (nextTick >= totalTicks) {
          playheadTickRef.current = totalTicks;
          setPlayheadTickState(totalTicks);
          setIsPlaying(false);
          return;
        }

        playheadTickRef.current = nextTick;
        setPlayheadTickState(nextTick);
      }

      rafRef.current = requestAnimationFrame(step);
    };

    rafRef.current = requestAnimationFrame(step);

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [isPlaying, ppqn, tempoChanges, totalTicks]);

  return (
    <PlaybackContext.Provider
      value={{
        isPlaying,
        playheadTick,
        totalTicks,
        play,
        pause,
        togglePlay,
        setPlayheadTick,
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
