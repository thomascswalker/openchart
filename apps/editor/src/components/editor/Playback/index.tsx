import {
  useEffect,
  useLayoutEffect,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { Difficulty } from "@openchart/views";
import { useSettings } from "../../../hooks/useApplication";
import { useDocument } from "../../../hooks/useDocument";
import { useRuleset } from "../../../hooks/useRuleset";
import { useViewport } from "../../../hooks/useViewport";
import Platform from "../../../platform";
import { PlaybackService } from "../../../services/playback";

export function Playback({ children }: { children: ReactNode }) {
  const { midi: midiData, documentId } = useDocument();
  const { viewportSessions, activeViewportId, snapEnabled, snapDenominator } =
    useViewport();
  const activeViewport = viewportSessions.find(
    (session) => session.id === activeViewportId,
  );
  const selectedTrackIndex =
    activeViewport && midiData
      ? midiData.tracks.findIndex(
          (track) => track.name === activeViewport.instrument,
        )
      : null;
  const { settings } = useSettings();
  const { compiled: rules } = useRuleset();
  // Fall back to the ruleset's first editable track, not a hard-coded name.
  const selectedInstrument =
    activeViewport?.instrument ??
    rules.descriptors().find((track) => track.visible && track.editable)
      ?.name ??
    "";
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
