import { Midi } from "@openchart/core";
import { Difficulty } from "@openchart/views";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import { ChartViewHost } from "../../ChartViewHost";
import type { ChartView } from "../../ChartViews";
import type { ChartViewState, SnapSettings } from "../../AbstractChartView";
import { PianoRollView } from "../index";
import { PlaybackService } from "../../../../services/playback";
import { defaultApplicationSettings } from "../../../../services/settings";
import { Button, Checkbox } from "../../../shared/Button";
import { Dropdown } from "../../../shared/Dropdown";
import type { DropdownOption } from "../../../shared/Dropdown";
import { Input } from "../../../shared/Input/Input";
import { Section } from "../../../shared/Section";
import { Label, Text } from "../../../shared/Text";
import {
  createPianoRollFixture,
  type PianoRollFixtureVariant,
} from "./createPianoRollFixture";
import "./PianoRollStoryHost.css";

const SELECTED_INSTRUMENT = "LEAD GUITAR";
const SELECTED_DIFFICULTY = Difficulty.Expert;
const SNAP_OPTIONS: DropdownOption[] = [2, 4, 8, 16].map((denominator) => ({
  value: String(denominator),
  label: `1/${denominator}`,
}));
const createPianoRollRenderer = (): PianoRollView => new PianoRollView();
const silentStorySettings = {
  ...defaultApplicationSettings,
  feedback: {
    ...defaultApplicationSettings.feedback,
    metronomeEnabled: false,
  },
};

interface PianoRollStoryHostProps {
  variant: PianoRollFixtureVariant;
  initialTrackIndex?: number;
}

interface CameraDiagnostics {
  tick: number;
  visibleTickSpan: number;
}

function webGLAvailable(): boolean {
  const canvas = document.createElement("canvas");
  return Boolean(canvas.getContext("webgl2") ?? canvas.getContext("webgl"));
}

export function PianoRollStoryHost({
  variant,
  initialTrackIndex = 1,
}: PianoRollStoryHostProps) {
  const [midi] = useState<Midi>(() => createPianoRollFixture(variant));
  const [playback] = useState(() => new PlaybackService());
  const [selectedTrackIndex, setSelectedTrackIndex] =
    useState(initialTrackIndex);
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [snapDenominator, setSnapDenominator] = useState(4);
  const [view, setView] = useState<ChartView | null>(null);
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
      selectedTrackIndex,
      selectedInstrument: SELECTED_INSTRUMENT,
      selectedDifficulty: SELECTED_DIFFICULTY,
      snap,
      isPlaying: snapshot.isPlaying,
    }),
    [midi, selectedTrackIndex, snap, snapshot.isPlaying],
  );
  const updateCamera = useCallback((activeView: ChartView) => {
    setCamera({
      tick: activeView.getCameraTick(),
      visibleTickSpan: activeView.getVisibleTickSpan(),
    });
  }, []);
  const onReady = useCallback((readyView: ChartView | null) => {
    setView(readyView);
  }, []);

  useEffect(() => {
    setWebGLSupported(webGLAvailable());
  }, []);

  useEffect(() => {
    playback.setActiveView("piano-roll");
  }, [playback]);

  useEffect(() => {
    playback.configure({
      midiData: midi,
      settings: silentStorySettings,
      snapEnabled,
      snapDenominator,
      selectedInstrument: SELECTED_INSTRUMENT,
      selectedDifficulty: SELECTED_DIFFICULTY,
      selectedTrackIndex,
    });
  }, [midi, playback, selectedTrackIndex, snapDenominator, snapEnabled]);

  useEffect(
    () => () => {
      playback.dispose();
    },
    [playback],
  );

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

  useEffect(() => {
    if (!view) return;
    const unsubscribeCamera = view.subscribeCameraChange(() =>
      updateCamera(view),
    );
    view.onNotesChanged = () => {
      playback.refresh(midi);
      setRevision((current) => current + 1);
    };
    view.onEditStart = () => setTransaction("Editing");
    view.onEditEnd = () => setTransaction("Ready");
    view.onSeekRequest = playback.setPlaybackTick;
    view.onSnapDenominatorChange = setSnapDenominator;
    updateCamera(view);

    return () => {
      unsubscribeCamera();
      view.onNotesChanged = null;
      view.onEditStart = null;
      view.onEditEnd = null;
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
  const noteData = JSON.stringify(
    notes.map(({ note, start, end, velocity }) => ({
      pitch: note,
      start,
      duration: end - start,
      velocity,
    })),
  );

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
        <Button
          type="button"
          onClick={snapshot.isPlaying ? snapshot.pause : snapshot.play}
          disabled={!snapshot.canPlay}
        >
          {snapshot.isPlaying ? "Pause" : "Play"}
        </Button>
        <Button
          type="button"
          onClick={snapshot.seekStart}
          disabled={!snapshot.canPlay || snapshot.isPlaying}
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
            disabled={!snapshot.canPlay || snapshot.isPlaying}
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
              Checking WebGL support…
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
