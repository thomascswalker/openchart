import { useEditor } from "./EditorContext";
import { Difficulty } from "@midiedit/views";
import { useAudioPlayer } from "../hooks/useAudioPlayer";
import { useTimeline } from "../hooks/useTimeline";
import { usePlaybackFeedback } from "../audio/usePlaybackFeedback";
import { useApplicationSettings } from "./ApplicationSettingsContext";
import type { ProviderProps } from "./shared";
import { PlaybackContext } from "./PlaybackContextStore";

export function PlaybackProvider({ children }: ProviderProps) {
  const {
    midiData,
    viewportSessions,
    activeViewportId,
  } = useEditor();
  const activeViewport = viewportSessions.find((session) => session.id === activeViewportId);
  const selectedTrackIndex = activeViewport && midiData
    ? midiData.tracks.findIndex((track) => track.name === activeViewport.instrument)
    : null;
  const { settings } = useApplicationSettings();
  const audioPlayer = useAudioPlayer();
  const feedback = usePlaybackFeedback({
    midiData,
    settings,
    selectedInstrument: activeViewport?.instrument ?? "LEAD GUITAR",
    selectedDifficulty: activeViewport?.difficulty ?? Difficulty.Expert,
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
