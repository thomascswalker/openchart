import { createContext, useContext } from "react";
import { useEditor } from "./EditorContext";
import { type AudioPlayer, useAudioPlayer } from "./useAudioPlayback";
import { useTimeline as useTimeline } from "./usePlaybackTimeline";

interface PlaybackContextType {
  isPlaying: boolean;
  canPlay: boolean;
  playbackTick: number;
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
  seekStart: () => void;
  seekEnd: () => void;
  setPlayheadTick: (tick: number) => void;
  refreshTotalTicks: () => void;
}

const PlaybackContext = createContext<PlaybackContextType | undefined>(
  undefined,
);

export function PlaybackProvider({ children }: { children: React.ReactNode }) {
  const { midiData } = useEditor();
  const audioPlayer = useAudioPlayer();
  const timeline = useTimeline({ midiData, audioPlayer });

  return (
    <PlaybackContext.Provider
      value={{
        ...timeline,
        audioDurationMs: audioPlayer.duration,
        audioFileName: audioPlayer.fileName,
        audio: audioPlayer.audio,
        setAudio: audioPlayer.setAudio,
        setAudioFileName: audioPlayer.setFileName,
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
