import { createContext, useContext } from "react";
import type { AudioPlayback } from "../hooks/useAudioPlayer";
import type { Timeline } from "../hooks/useTimeline";

export interface PlaybackContextType extends Timeline, AudioPlayback {
  audioDurationMs: number;
  audioFileName: string | null;
  setAudioFileName: (name: string | null) => void;
}

export const PlaybackContext = createContext<PlaybackContextType | undefined>(
  undefined,
);

export function usePlayback(): PlaybackContextType {
  const context = useContext(PlaybackContext);
  if (!context) {
    throw new Error("usePlayback must be used within a PlaybackProvider");
  }
  return context;
}
