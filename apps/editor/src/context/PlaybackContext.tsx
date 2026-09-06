import { createContext, useContext } from "react";
import { useEditor } from "./EditorContext";
import { type AudioPlayback, useAudioPlayer } from "../hooks/useAudioPlayer";
import {
  useTimeline as useTimeline,
  type Timeline,
} from "../hooks/useTimeline";
import type { ProviderProps } from "./shared";

interface PlaybackContextType extends Timeline, AudioPlayback {}

const PlaybackContext = createContext<PlaybackContextType | undefined>(
  undefined,
);

export function PlaybackProvider({ children }: ProviderProps) {
  const { midiData } = useEditor();
  const audioPlayer = useAudioPlayer();
  const timeline = useTimeline({ midiData, audioPlayer });

  return (
    <PlaybackContext.Provider
      value={{
        ...timeline,
        ...audioPlayer,
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
