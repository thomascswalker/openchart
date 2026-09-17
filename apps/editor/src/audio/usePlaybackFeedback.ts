import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Midi, MidiNote } from "@midiedit/core";
import { Difficulty, SongView } from "@midiedit/views";
import type { ApplicationSettings } from "../context/ApplicationSettingsContext";
import {
  PlaybackFeedbackEngine,
  type PitchRange,
  type PreviewNote,
} from "./PlaybackFeedbackEngine";

export interface PlaybackFeedback {
  start: (tick: number) => void;
  stop: () => void;
  seek: (tick: number) => void;
  updateTick: (tick: number) => void;
  isMetronomeEnabled: boolean;
  isClapEnabled: boolean;
  toggleMetronome: () => void;
  toggleClap: () => void;
  setActiveView: (viewId: string) => void;
  /** Preview the current track; an explicit range overrides the settings range. */
  previewTrack: (trackIndex?: number, range?: PitchRange) => void;
  /** Preview an explicit piano-roll selection; an explicit range filters that selection. */
  previewNotes: (notes: readonly PreviewNote[], range?: PitchRange) => void;
  stopPreview: () => void;
}

function notesForHighway(
  midi: Midi | null,
  instrument: string,
  difficulty: Difficulty,
): readonly MidiNote[] {
  if (!midi) return [];
  const song = new SongView(midi);
  return (
    song.getInstrumentTrackView(instrument)?.getChart(difficulty)?.getNotes() ??
    []
  );
}

export function usePlaybackFeedback({
  midiData,
  settings,
  selectedInstrument,
  selectedDifficulty,
  selectedTrackIndex,
}: {
  midiData: Midi | null;
  settings: ApplicationSettings;
  selectedInstrument: string;
  selectedDifficulty: Difficulty;
  selectedTrackIndex: number | null;
}): PlaybackFeedback {
  const engineRef = useRef<PlaybackFeedbackEngine | null>(null);
  if (!engineRef.current) engineRef.current = new PlaybackFeedbackEngine();
  const engine = engineRef.current;
  const [metronomeEnabled, setMetronomeEnabled] = useState(
    settings.feedback.metronomeEnabled,
  );
  const [clapEnabled, setClapEnabled] = useState(false);
  const [isHighwayActive, setIsHighwayActive] = useState(false);
  const metronomeEnabledRef = useRef(metronomeEnabled);
  metronomeEnabledRef.current = metronomeEnabled;
  const clapEnabledRef = useRef(clapEnabled);
  clapEnabledRef.current = clapEnabled;

  useEffect(() => {
    setMetronomeEnabled(settings.feedback.metronomeEnabled);
  }, [settings.feedback.metronomeEnabled]);

  const highwayNotes = useMemo(
    () => notesForHighway(midiData, selectedInstrument, selectedDifficulty),
    [midiData, selectedDifficulty, selectedInstrument],
  );
  const feedbackSettings = useMemo(
    () => ({ ...settings.feedback, metronomeEnabled }),
    [metronomeEnabled, settings.feedback],
  );

  useEffect(() => {
    engine.configure({
      midi: midiData,
      ppqn: midiData?.header.division ?? 480,
      tempoChanges: midiData?.getTempoChanges() ?? [
        { tick: 0, microsecondsPerQuarterNote: 500_000 },
      ],
      timeSignatureChanges: midiData?.getTimeSignatureChanges() ?? [
        { tick: 0, numerator: 4, denominator: 2 },
      ],
      settings: feedbackSettings,
      clapEnabled,
      highwayActive: isHighwayActive,
      highwayNotes,
      // The shared tracker uses chart identity; a selected track change also
      // resets it so a newly active viewport cannot replay stale crossings.
      highwayKey: `${selectedTrackIndex ?? -1}:${selectedInstrument}:${selectedDifficulty}`,
    });
  }, [
    engine,
    feedbackSettings,
    highwayNotes,
    midiData,
    clapEnabled,
    isHighwayActive,
    metronomeEnabled,
    selectedDifficulty,
    selectedInstrument,
    selectedTrackIndex,
  ]);

  useEffect(() => () => engine.dispose(), [engine]);

  // Start/resume the context in the original M/N or menu gesture. This is
  // important in embedded hosts such as the VSCode webview, where a later
  // React effect is not considered user activation by autoplay policy.
  const toggleMetronome = useCallback(() => {
    const nextEnabled = !metronomeEnabledRef.current;
    metronomeEnabledRef.current = nextEnabled;
    if (nextEnabled) void engine.ensureStarted();
    setMetronomeEnabled(nextEnabled);
  }, [engine]);
  const toggleClap = useCallback(() => {
    const nextEnabled = !clapEnabledRef.current;
    clapEnabledRef.current = nextEnabled;
    if (nextEnabled) void engine.ensureStarted();
    setClapEnabled(nextEnabled);
  }, [engine]);
  const setActiveView = useCallback(
    (viewId: string) => setIsHighwayActive(viewId === "highway"),
    [],
  );

  return useMemo(
    () => ({
      start: (tick: number) => engine.start(tick),
      stop: () => engine.stop(),
      seek: (tick: number) => engine.seek(tick),
      updateTick: (tick: number) => engine.updateTick(tick),
      isMetronomeEnabled: metronomeEnabled,
      isClapEnabled: clapEnabled,
      toggleMetronome,
      toggleClap,
      setActiveView,
      previewTrack: (
        trackIndex = selectedTrackIndex ?? 0,
        range?: PitchRange,
      ) => {
        const track = midiData?.tracks[trackIndex];
        if (!track) return;
        engine.previewTrack(
          track.getNotes().map((note) => ({
            pitch: note.note,
            startTick: note.start,
            endTick: note.end,
            velocity: note.velocity,
          })),
          range,
        );
      },
      previewNotes: (notes: readonly PreviewNote[], range?: PitchRange) =>
        engine.previewTrack(notes, range),
      stopPreview: () => engine.stopPreview(),
    }),
    [
      clapEnabled,
      engine,
      midiData,
      metronomeEnabled,
      selectedTrackIndex,
      setActiveView,
      toggleClap,
      toggleMetronome,
    ],
  );
}
