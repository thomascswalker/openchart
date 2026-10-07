import { useSyncExternalStore } from "react";
import Platform from "../platform";
import { PlaybackService, type PlaybackSnapshot } from "../services/playback";

export function usePlayback() {
  const playbackService = Platform.services.get<PlaybackService>("playback");
  const playback = useSyncExternalStore(
    playbackService.subscribe,
    playbackService.getSnapshot,
    playbackService.getSnapshot,
  );

  return playback;
}

/** Select a primitive or stable snapshot reference, never a fresh object or array. */
export function usePlaybackSelector<T>(
  select: (snapshot: PlaybackSnapshot) => T,
): T {
  const playback = Platform.services.get<PlaybackService>("playback");
  const read = () => select(playback.getSnapshot());
  return useSyncExternalStore(playback.subscribe, read, read);
}
