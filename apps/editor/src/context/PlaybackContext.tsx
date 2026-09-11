import { useEditor } from "./EditorContext";
import { useAudioPlayer } from "../hooks/useAudioPlayer";
import { useTimeline } from "../hooks/useTimeline";
import type { ProviderProps } from "./shared";
import { PlaybackContext } from "./PlaybackContextStore";

export function PlaybackProvider({ children }: ProviderProps) {
  const { midiData } = useEditor();
  const audioPlayer = useAudioPlayer();
  const timeline = useTimeline({ midiData, audioPlayer });

  return (
    <PlaybackContext.Provider
      value={{
        ...timeline,
        ...audioPlayer,
        audioDurationMs: audioPlayer.duration,
        audioFileName: audioPlayer.fileName,
        setAudioFileName: audioPlayer.setFileName,
      }}
    >
      {children}
    </PlaybackContext.Provider>
  );
}
