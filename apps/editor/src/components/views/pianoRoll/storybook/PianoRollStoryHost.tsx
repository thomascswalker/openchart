import { MetaType, Midi, type MidiNote, type MidiTrack } from "@openchart/midi";
import { Difficulty, type VocalNoteKind } from "@openchart/views";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import { ChartViewHost } from "../../ChartViewHost";
import type { AnyChartView } from "../../ChartViews";
import type { ChartViewState, SnapSettings } from "../../AbstractChartView";
import { PianoRollView, profileForInstrument } from "../index";
import { PlaybackService } from "../../../../services/playback";
import { defaultApplicationSettings } from "../../../../services/settings/schema";
import {
  Button,
  Checkbox,
  Dropdown,
  Input,
  Label,
  Section,
  Text,
  type DropdownOption,
} from "../../../shared";
import {
  createPianoRollFixture,
  type PianoRollFixtureVariant,
} from "./createPianoRollFixture";
import { usePianoRollStoryHotkeys } from "./usePianoRollStoryHotkeys";
import "./PianoRollStoryHost.css";

/** Instrument whose profile is used when a story names none. */
const DEFAULT_INSTRUMENT = "LEAD GUITAR";

/** Note types offered by the vocal toolbar dropdown. */
const VOCAL_KIND_OPTIONS: DropdownOption[] = [
  { value: "pitched", label: "Pitched" },
  { value: "percussion", label: "Percussion" },
  { value: "pitchless", label: "Pitchless" },
];
/** Difficulty reported to the view; the piano roll ignores it. */
const SELECTED_DIFFICULTY = Difficulty.Expert;

/** Snap denominators offered by the toolbar dropdown. */
const SNAP_OPTIONS: DropdownOption[] = [2, 4, 8, 16].map((denominator) => ({
  value: String(denominator),
  label: `1/${denominator}`,
}));
/** Creates the view under test for the chart host. */
const createPianoRollRenderer = (): PianoRollView => new PianoRollView();

/** Settings with the metronome off, so stories stay quiet. */
const silentStorySettings = {
  ...defaultApplicationSettings,
  feedback: {
    ...defaultApplicationSettings.feedback,
    metronomeEnabled: false,
  },
};

/** Props of the story host. */
interface PianoRollStoryHostProps {
  /** Which fixture document to load. */
  variant: PianoRollFixtureVariant;

  /** Track selected when the story opens. */
  initialTrackIndex?: number;

  /** Instrument whose Piano Roll profile is applied (e.g. "VOCALS"). */
  instrument?: string;
}

/** Camera readout shown in the diagnostics bar. */
interface CameraDiagnostics {
  /** Tick at the left edge of the viewport. */
  tick: number;

  /** Ticks visible across the viewport. */
  visibleTickSpan: number;
}

/** True when the browser can create a WebGL context. */
function webGLAvailable(): boolean {
  const canvas = document.createElement("canvas");
  return Boolean(canvas.getContext("webgl2") ?? canvas.getContext("webgl"));
}

/** Serializes a track's notes for the `data-note-data` test attribute. */
function serializeNotes(notes: readonly MidiNote[]): string {
  return JSON.stringify(
    notes.map(({ note, start, end, velocity }) => ({
      pitch: note,
      start,
      duration: end - start,
      velocity,
    })),
  );
}

/** Serializes a track's lyrics as `[tick, text]` pairs for tests. */
function serializeLyrics(track: MidiTrack | undefined): string {
  const lyrics = (track?.getTextEvents() ?? []).filter(
    (event) => event.type === MetaType.Lyric,
  );
  return JSON.stringify(lyrics.map(({ tick, text }) => [tick, text]));
}

/** Mounts a real piano-roll view on an in-memory chart with toolbar controls. */
export function PianoRollStoryHost({
  variant,
  initialTrackIndex = 1,
  instrument = DEFAULT_INSTRUMENT,
}: PianoRollStoryHostProps) {
  const profile = profileForInstrument(instrument);
  const [vocalKind, setVocalKind] = useState<VocalNoteKind>("pitched");
  const [midi] = useState<Midi>(() => createPianoRollFixture(variant));
  const [playback] = useState(() => new PlaybackService());
  const [selectedTrackIndex, setSelectedTrackIndex] =
    useState(initialTrackIndex);
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [snapDenominator, setSnapDenominator] = useState(4);
  const [view, setView] = useState<AnyChartView | null>(null);
  const [camera, setCamera] = useState<CameraDiagnostics>({
    tick: 0,
    visibleTickSpan: 0,
  });
  const [webGLSupported, setWebGLSupported] = useState<boolean | null>(null);
  const [revision, setRevision] = useState(0);
  const [transaction, setTransaction] = useState("Ready");
  const snapshot = useSyncExternalStore(
    playback.subscribe,
    playback.getSnapshot,
    playback.getSnapshot,
  );

  const snap = useMemo<SnapSettings>(
    () => ({ enabled: snapEnabled, denominator: snapDenominator }),
    [snapEnabled, snapDenominator],
  );
  const state = useMemo<ChartViewState>(
    () => ({
      midi,
      selectedTrackKey: null,
      selectedTrackIndex,
      selectedInstrument: instrument,
      selectedDifficulty: SELECTED_DIFFICULTY,
      snap,
      lockCursor: false,
      isPlaying: snapshot.isPlaying,
    }),
    [midi, selectedTrackIndex, snap, snapshot.isPlaying, instrument],
  );
  const updateCamera = useCallback((activeView: AnyChartView) => {
    setCamera({
      tick: activeView.getCameraTick(),
      visibleTickSpan: activeView.getVisibleTickSpan(),
    });
  }, []);
  const onReady = useCallback((readyView: AnyChartView | null) => {
    setView(readyView);
  }, []);

  // Hotkeys normally come from the editor shell; mirror them for this story.
  usePianoRollStoryHotkeys(view);

  // Probe WebGL once so the story can explain a missing context.
  useEffect(() => {
    setWebGLSupported(webGLAvailable());
  }, []);

  // Tell the playback service this story is the piano roll.
  useEffect(() => {
    playback.setActiveView("piano-roll");
  }, [playback]);

  // Keep playback in step with the selected track and snap settings.
  useEffect(() => {
    playback.configure({
      midiData: midi,
      settings: silentStorySettings,
      snapEnabled,
      snapDenominator,
      selectedInstrument: instrument,
      selectedDifficulty: SELECTED_DIFFICULTY,
      selectedTrackIndex,
    });
  }, [
    midi,
    playback,
    selectedTrackIndex,
    snapDenominator,
    snapEnabled,
    instrument,
  ]);

  // Push the instrument profile and vocal toolbar choice into the view.
  useEffect(() => {
    if (!(view instanceof PianoRollView)) return;
    view.setProfile(profile);
    view.setVocalPlacement({ noteKind: vocalKind, phrase: null });
  }, [profile, view, vocalKind]);

  // Release audio resources when the story unmounts.
  useEffect(
    () => () => {
      playback.dispose();
    },
    [playback],
  );

  // Follow the playback cursor with the playhead and, if locked, the camera.
  useEffect(() => {
    if (!view) return;
    const syncPlayback = (): void => {
      const tick = playback.getSnapshot().playbackTick;
      view.setPlayheadTick(tick);
      const cameraTick = view.getCameraTickForPlayhead(tick);
      if (cameraTick !== null) view.setCameraTick(cameraTick);
    };
    syncPlayback();
  }, [playback, snapshot.playbackTick, view]);

  // Wire the view's callbacks to story state, and unwire on cleanup.
  useEffect(() => {
    if (!view) return;
    const unsubscribeCamera = view.subscribeCameraChange(() =>
      updateCamera(view),
    );
    view.onNotesChanged = () => {
      playback.refresh(midi);
      setRevision((current) => current + 1);
    };
    view.onBeginEdit = () => setTransaction("Editing");
    view.onEndEdit = () => setTransaction("Ready");
    view.onSeekRequest = playback.setPlaybackTick;
    view.onSnapDenominatorChange = setSnapDenominator;
    updateCamera(view);

    return () => {
      unsubscribeCamera();
      view.onNotesChanged = null;
      view.onBeginEdit = null;
      view.onEndEdit = null;
      view.onSeekRequest = null;
      view.onSnapDenominatorChange = null;
    };
  }, [midi, playback, updateCamera, view]);

  const trackOptions = useMemo(
    () =>
      midi.tracks
        .map((track, index) => ({ track, index }))
        .filter(({ index }) => index > 0)
        .map(({ track, index }) => ({
          value: String(index),
          label: `${index}: ${track.name}`,
        })),
    [midi],
  );
  const notes = midi.tracks[selectedTrackIndex]?.getNotes() ?? [];
  const noteData = serializeNotes(notes);

  return (
    <Section
      flexDirection="column"
      p={0}
      className="piano-roll-story"
      data-testid="piano-roll-story"
      data-selected-track-index={selectedTrackIndex}
      data-is-playing={snapshot.isPlaying}
      data-camera-tick={camera.tick}
      data-visible-tick-span={camera.visibleTickSpan}
      data-revision={revision}
      data-profile={profile.id}
      data-lyrics={serializeLyrics(midi.tracks[selectedTrackIndex])}
      data-note-data={noteData}
    >
      <div
        className="piano-roll-story__toolbar"
        aria-label="Piano roll story controls"
      >
        <div className="piano-roll-story__field">
          <Label htmlFor="piano-roll-selected-track">Selected track</Label>
          <Dropdown
            id="piano-roll-selected-track"
            value={String(selectedTrackIndex)}
            options={trackOptions}
            onChange={(value) => setSelectedTrackIndex(Number(value))}
          />
        </div>
        <div className="piano-roll-story__check">
          <Checkbox
            label="Snap"
            aria-label="Snap to grid"
            checked={snapEnabled}
            onChange={(event) => setSnapEnabled(event.target.checked)}
          />
        </div>
        <div className="piano-roll-story__field">
          <Label htmlFor="piano-roll-snap-denominator">Snap denominator</Label>
          <Dropdown
            id="piano-roll-snap-denominator"
            value={String(snapDenominator)}
            options={SNAP_OPTIONS}
            onChange={(value) => setSnapDenominator(Number(value))}
          />
        </div>
        {profile.editing === "vocals" ? (
          <div className="piano-roll-story__field">
            <Label htmlFor="piano-roll-vocal-kind">Vocal note type</Label>
            <Dropdown
              id="piano-roll-vocal-kind"
              value={vocalKind}
              options={VOCAL_KIND_OPTIONS}
              onChange={(value) => setVocalKind(value as VocalNoteKind)}
            />
          </div>
        ) : null}
        <Button
          type="button"
          onClick={snapshot.isPlaying ? snapshot.pause : snapshot.play}
        >
          {snapshot.isPlaying ? "Pause" : "Play"}
        </Button>
        <Button
          type="button"
          onClick={snapshot.seekStart}
          disabled={snapshot.isPlaying}
        >
          Seek to Start
        </Button>
        <div className="piano-roll-story__field">
          <Label htmlFor="piano-roll-seek-tick">Seek tick</Label>
          <Input
            id="piano-roll-seek-tick"
            aria-label="Seek tick"
            type="number"
            min="0"
            placeholder=""
            value={snapshot.playbackTick}
            disabled={snapshot.isPlaying}
            onChange={(event) => {
              const tick = Number(event.target.value);
              if (Number.isFinite(tick)) snapshot.setPlaybackTick(tick);
            }}
          />
        </div>
        <output aria-label="Current tick" data-testid="current-tick">
          <Text>Tick: {Math.round(snapshot.playbackTick)}</Text>
        </output>
        <output data-testid="playback-state">
          <Text>{snapshot.isPlaying ? "Playing" : "Paused"}</Text>
        </output>
      </div>

      <div className="piano-roll-story__diagnostics" aria-live="polite">
        <span data-testid="selected-track">
          <Text>
            Track {selectedTrackIndex}:{" "}
            {midi.tracks[selectedTrackIndex]?.name ?? "None"}
          </Text>
        </span>
        <span data-testid="note-count">
          <Text>Notes: {notes.length}</Text>
        </span>
        <span data-testid="camera-tick">
          <Text>Camera tick: {Math.round(camera.tick)}</Text>
        </span>
        <span data-testid="visible-tick-span">
          <Text>Visible ticks: {Math.round(camera.visibleTickSpan)}</Text>
        </span>
        <span data-testid="edit-transaction">
          <Text>Transaction: {transaction}</Text>
        </span>
      </div>

      {webGLSupported === false ? (
        <Text className="piano-roll-story__status" role="alert">
          WebGL is unavailable in this browser; the piano roll cannot be
          rendered.
        </Text>
      ) : (
        <div
          className="piano-roll-story__renderer"
          data-testid="story-renderer"
        >
          {webGLSupported === null ? (
            <Text className="piano-roll-story__status" role="status">
              Checking WebGL support...
            </Text>
          ) : null}
          <ChartViewHost
            createRenderer={createPianoRollRenderer}
            state={state}
            onReady={onReady}
          />
        </div>
      )}
    </Section>
  );
}
