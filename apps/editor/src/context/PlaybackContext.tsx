import { useEditor } from "./EditorContext";
import { useAudioPlayer } from "../hooks/useAudioPlayer";
import { useTimeline } from "../hooks/useTimeline";
import { usePlaybackFeedback } from "../audio/usePlaybackFeedback";
import { useApplicationSettings } from "./ApplicationSettingsContext";
import type { ProviderProps } from "./shared";
import { PlaybackContext } from "./PlaybackContextStore";

export function PlaybackProvider({ children }: ProviderProps) {
  const {
    midiData,
    selectedTrackIndex,
    selectedInstrument,
    selectedDifficulty,
  } = useEditor();
  const { settings } = useApplicationSettings();
  const audioPlayer = useAudioPlayer();
  const feedback = usePlaybackFeedback({
    midiData,
    settings,
    selectedInstrument,
    selectedDifficulty,
    selectedTrackIndex,
  });
  const timeline = useTimeline({ midiData, audioPlayer, feedback });

  return (
    <PlaybackContext.Provider
      value={{
        ...timeline,
        ...audioPlayer,
        ...feedback,
        audioDurationMs: audioPlayer.duration,
        audioFileName: audioPlayer.fileName,
        setAudioFileName: audioPlayer.setFileName,
      }}
    >
      {children}
    </PlaybackContext.Provider>
  );
}
