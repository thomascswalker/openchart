import {
  useEffect,
  useLayoutEffect,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { Difficulty } from "@midiedit/views";
import { useApplicationSettings } from "../hooks/useApplicationSettings";
import { useDocumentSnapshot } from "../hooks/useDocumentSnapshot";
import { useViewportSnapshot } from "../hooks/useViewportSnapshot";
import Platform from "../platform";
import { AudioService } from "../services/audio";
import { PlaybackService } from "../services/playback";

export function Playback({ children }: { children: ReactNode }) {
  const { midiData } = useDocumentSnapshot();
  const { viewportSessions, activeViewportId, snapEnabled, snapDenominator } =
    useViewportSnapshot();
  const activeViewport = viewportSessions.find(
    (session) => session.id === activeViewportId,
  );
  const selectedTrackIndex =
    activeViewport && midiData
      ? midiData.tracks.findIndex(
          (track) => track.name === activeViewport.instrument,
        )
      : null;
  const { settings } = useApplicationSettings();
  const selectedInstrument = activeViewport?.instrument ?? "LEAD GUITAR";
  const selectedDifficulty = activeViewport?.difficulty ?? Difficulty.Expert;
  const audioService = Platform.services.get<AudioService>("audio");
  const playbackService = Platform.services.get<PlaybackService>("playback");
  const canPlay = useSyncExternalStore(
    playbackService.subscribe,
    () => playbackService.getSnapshot().canPlay,
    () => playbackService.getSnapshot().canPlay,
  );
  const isPlaying = useSyncExternalStore(
    playbackService.subscribe,
    () => playbackService.getSnapshot().isPlaying,
    () => playbackService.getSnapshot().isPlaying,
  );

  useLayoutEffect(() => {
    Platform.context.set("playback.can-play", canPlay);
    Platform.context.set("playback.is-playing", isPlaying);
    Platform.context.set("playback.can-seek", canPlay && !isPlaying);
  }, [canPlay, isPlaying]);

  useEffect(() => {
    playbackService.configure({
      midiData,
      settings,
      snapEnabled,
      snapDenominator,
      selectedInstrument,
      selectedDifficulty,
      selectedTrackIndex,
    });
  }, [
    midiData,
    playbackService,
    selectedDifficulty,
    selectedInstrument,
    selectedTrackIndex,
    settings,
    snapDenominator,
    snapEnabled,
  ]);

  useEffect(
    () => () => {
      playbackService.dispose();
      audioService.dispose();
    },
    [audioService, playbackService],
  );

  return <>{children}</>;
}
