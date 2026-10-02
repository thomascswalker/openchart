import { useEffect, useSyncExternalStore, type ReactNode } from "react";
import { Difficulty } from "@midiedit/views";
import { usePlaybackFeedback } from "../audio/usePlaybackFeedback";
import { useApplicationSettings } from "../hooks/useApplicationSettings";
import { useDocumentSnapshot } from "../hooks/useDocumentSnapshot";
import { useViewportSnapshot } from "../hooks/useViewportSnapshot";
import Platform from "../platform";
import { AudioService } from "../services/audio";
import { PlaybackFeedbackService } from "../services/playback/feedback";
import { TimelineService } from "../services/timeline";

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
  const feedback = usePlaybackFeedback({
    midiData,
    settings,
    selectedInstrument: activeViewport?.instrument ?? "LEAD GUITAR",
    selectedDifficulty: activeViewport?.difficulty ?? Difficulty.Expert,
    selectedTrackIndex,
  });
  const audioService = Platform.services.get<AudioService>("audio");
  const timelineService = Platform.services.get<TimelineService>("timeline");
  const feedbackService =
    Platform.services.get<PlaybackFeedbackService>("playback.feedback");
  const timeline = useSyncExternalStore(
    timelineService.subscribe,
    timelineService.getSnapshot,
    timelineService.getSnapshot,
  );

  Platform.context.set("playback.can-play", timeline.canPlay);
  Platform.context.set("playback.is-playing", timeline.isPlaying);
  Platform.context.set(
    "playback.can-seek",
    timeline.canPlay && !timeline.isPlaying,
  );

  useEffect(() => {
    feedbackService.setFeedback(feedback);
  }, [feedback, feedbackService]);

  useEffect(() => {
    timelineService.configure({
      midiData,
      feedback,
      snapEnabled,
      snapDenominator,
    });
  }, [feedback, midiData, snapDenominator, snapEnabled, timelineService]);

  useEffect(
    () => () => {
      feedbackService.setFeedback(null);
      timelineService.dispose();
      audioService.dispose();
    },
    [audioService, feedbackService, timelineService],
  );

  return <>{children}</>;
}
