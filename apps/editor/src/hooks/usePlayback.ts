import { useSyncExternalStore } from "react";
import Platform from "../platform";
import { AudioService } from "../services/audio";
import { PlaybackService } from "../services/playback";

export function usePlayback() {
  const audioService = Platform.services.get<AudioService>("audio");
  const audio = useSyncExternalStore(
    audioService.subscribe,
    audioService.getSnapshot,
    audioService.getSnapshot,
  );
  const playbackService = Platform.services.get<PlaybackService>("playback");
  const playback = useSyncExternalStore(
    playbackService.subscribe,
    playbackService.getSnapshot,
    playbackService.getSnapshot,
  );

  return {
    ...playback,
    ...audio,
    setAudio: audioService.setAudio,
    setFileName: audioService.setFileName,
    setAudioSource: audioService.setAudioSource,
    clearAudioSource: audioService.clearAudioSource,
    setSourceEnabled: audioService.setSourceEnabled,
    setSourceVolume: audioService.setSourceVolume,
    play: audioService.play,
    pause: audioService.pause,
    seek: audioService.seek,
    audioDurationMs: audio.duration,
    audioFileName: audio.fileName,
    setAudioFileName: audioService.setFileName,
  };
}
