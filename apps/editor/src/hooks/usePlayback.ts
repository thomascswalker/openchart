import { useSyncExternalStore } from "react";
import Platform from "../platform";
import { AudioService } from "../services/audio";
import { TimelineService } from "../services/timeline";
import { PlaybackFeedbackService } from "../services/playback/feedback";

export function usePlayback() {
  const audioService = Platform.services.get<AudioService>("audio");
  const audio = useSyncExternalStore(
    audioService.subscribe,
    audioService.getSnapshot,
    audioService.getSnapshot,
  );
  const timelineService = Platform.services.get<TimelineService>("timeline");
  const timeline = useSyncExternalStore(
    timelineService.subscribe,
    timelineService.getSnapshot,
    timelineService.getSnapshot,
  );
  const feedbackService =
    Platform.services.get<PlaybackFeedbackService>("playback.feedback");
  const feedback = useSyncExternalStore(
    feedbackService.subscribe,
    feedbackService.getSnapshot,
    feedbackService.getSnapshot,
  );

  return {
    ...timeline,
    ...audio,
    ...feedback,
    setAudio: audioService.setAudio,
    setFileName: audioService.setFileName,
    setAudioSource: audioService.setAudioSource,
    clearAudioSource: audioService.clearAudioSource,
    setSourceEnabled: audioService.setSourceEnabled,
    setSourceVolume: audioService.setSourceVolume,
    play: audioService.play,
    pause: audioService.pause,
    seek: audioService.seek,
    start: feedbackService.start,
    stop: feedbackService.stop,
    updateTick: feedbackService.updateTick,
    toggleMetronome: feedbackService.toggleMetronome,
    toggleClap: feedbackService.toggleClap,
    setActiveView: feedbackService.setActiveView,
    previewTrack: feedbackService.previewTrack,
    previewNotes: feedbackService.previewNotes,
    stopPreview: feedbackService.stopPreview,
    audioDurationMs: audio.duration,
    audioFileName: audio.fileName,
    setAudioFileName: audioService.setFileName,
  };
}
