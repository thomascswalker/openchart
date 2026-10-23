import {
  useEffect,
  useLayoutEffect,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { Difficulty } from "@openchart/views";
import { useApplicationSettings } from "../../../hooks/useApplicationSettings";
import { useDocumentSnapshot } from "../../../hooks/useDocumentSnapshot";
import { useViewportSnapshot } from "../../../hooks/useViewportSnapshot";
import Platform from "../../../platform";
import { PlaybackService } from "../../../services/playback";

export function Playback({ children }: { children: ReactNode }) {
  const { midi: midiData, documentId } = useDocumentSnapshot();
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
  const playbackService = Platform.services.get<PlaybackService>("playback");
  const isPlaying = useSyncExternalStore(
    playbackService.subscribe,
    () => playbackService.getSnapshot().isPlaying,
    () => playbackService.getSnapshot().isPlaying,
  );

  useLayoutEffect(() => {
    Platform.context.set("playback.is-playing", isPlaying);
    Platform.context.set("playback.can-seek", !isPlaying);
  }, [isPlaying]);

  useEffect(() => {
    playbackService.configure({
      midiData,
      documentId,
      settings,
      snapEnabled,
      snapDenominator,
      selectedInstrument,
      selectedDifficulty,
      selectedTrackIndex,
    });
  }, [
    midiData,
    documentId,
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
    },
    [playbackService],
  );

  return <>{children}</>;
}
