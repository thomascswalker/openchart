import { Midi } from "@openchart/midi";
import {
  createStandaloneEditing,
  defaultConfig,
  Difficulty,
  formatNoteId,
  SongView,
  type ClipboardPayload,
  type EditingSession,
  type PreviewState,
  type SongViewConfig,
} from "@openchart/views";
import type { ChartViewState } from "../../AbstractChartView";
import type { HighwayContext } from "../context";

export function createHighwayTestSetup(
  trackKey: "lead-guitar" | "drums" = "lead-guitar",
  config: SongViewConfig = defaultConfig,
  difficulty = Difficulty.Expert,
) {
  const midi = new Midi();
  const midiTrack = midi.tracks[midi.addTrack()]!;
  const trackConfig = config.tracks.find((track) => track.key === trackKey);
  if (!trackConfig) throw new Error(`Missing test track '${trackKey}'`);
  midiTrack.name = trackConfig.name;
  const song = new SongView(midi, config);
  const descriptor = song
    .getTrackDescriptors()
    .find((track) => track.key === trackKey);
  if (!descriptor) throw new Error(`Missing test track '${trackKey}'`);
  const trackIndex = midi.tracks.indexOf(midiTrack);
  const chart = song.getInstrumentTrackView(trackKey)?.getChart(difficulty);
  if (!chart) throw new Error(`Missing test chart '${trackKey}'`);
  const editing = createStandaloneEditing(midi, config);
  const session = editing.createSession(
    { trackKey, trackIndex, difficulty },
    "highway",
  );
  const state: ChartViewState = {
    midi,
    selectedTrackKey: trackKey,
    selectedTrackIndex: trackIndex,
    selectedInstrument: descriptor.name,
    selectedDifficulty: difficulty,
    snap: { enabled: true, denominator: 4 },
    lockCursor: false,
    isPlaying: false,
  };
  let preview: PreviewState | null = null;
  let toolMode: "select" | "place" | "remove" = "select";
  let phraseMode: "solo" | "stagepower" | null = null;
  let playheadTick = 0;
  let cameraTick = 0;
  let selectionRange: { start: number; end: number } | null = null;
  let notePlacementType: "normal" | "force-hopo" | "force-strum" | "tap" =
    "normal";
  let drumPlacementKind: "pad" | "cymbal" | "kick" = "pad";
  const context = {
    getState: () => state,
    getMidi: () => midi,
    getPpqn: () => 480,
    getCurrentChart: () => chart,
    getEditingSession: (): EditingSession => session,
    getPreviewState: () => preview,
    setPreviewState: (next: PreviewState | null) => {
      preview = next;
    },
    getViewport: () => ({ width: 800, height: 600 }),
    getPlayheadTick: () => playheadTick,
    getCameraTick: () => cameraTick,
    getScrollSpeedMultiplier: () => 1,
    setCameraTick: (tick: number) => {
      cameraTick = tick;
    },
    getMode: () => toolMode,
    getNotePlacementType: () => notePlacementType,
    getDrumPlacementKind: () => drumPlacementKind,
    getPhraseMode: () => phraseMode,
    getPhraseHoverState: () => null,
    getSelectionRange: () => selectionRange,
    getGhostNoteLocation: () => null,
    getHoveredNoteOn: () => null,
    canShowNotePlacementPreview: () => false,
    getCanvas: () => null,
    requestRender: () => {},
    requestSeek: (tick: number) => {
      playheadTick = tick;
    },
    changeSnapDenominator: () => {},
    stepSnapDenominator: () => {},
    setPlayheadTick: () => {},
    setSelectionRange: (next: { start: number; end: number } | null) => {
      selectionRange = next;
    },
    updateMarqueeOutline: () => {},
    clearHoverOutline: () => {},
  } as unknown as HighwayContext;
  const selection = session.selection;
  return {
    midi,
    midiTrack,
    song,
    chart,
    editing,
    session,
    context,
    selection,
    setNotePlacementType: (next: typeof notePlacementType) => {
      notePlacementType = next;
    },
    setDrumPlacementKind: (next: typeof drumPlacementKind) => {
      drumPlacementKind = next;
    },
    setToolMode: (next: typeof toolMode) => {
      toolMode = next;
    },
    setPhraseMode: (next: typeof phraseMode) => {
      phraseMode = next;
    },
  };
}

export function copyHighwaySelectionToClipboard(
  setup: ReturnType<typeof createHighwayTestSetup>,
): ClipboardPayload {
  const trackIndex = setup.session.target.trackIndex;
  if (trackIndex === null) {
    throw new Error("Highway test session has no target track");
  }
  const selectedIds = new Set(setup.session.selection.getSelectedIds());
  const notes = setup.midiTrack.getNotes().flatMap((note) => {
    const id = formatNoteId(
      trackIndex,
      setup.midiTrack.getEventId(note.noteOn),
    );
    if (!selectedIds.has(id)) return [];
    const snapshot = {
      id,
      trackIndex,
      tick: note.start,
      pitch: note.note,
      duration: note.end - note.start,
      velocity: note.velocity,
    };
    return [
      {
        snapshot,
        classification: setup.session.classifyNote(snapshot),
        row: setup.session.getProjection().rowForNote(snapshot)?.id,
      },
    ];
  });
  if (notes.length === 0) {
    throw new Error("Highway test selection has no notes");
  }
  const firstTick = Math.min(...notes.map(({ snapshot }) => snapshot.tick));
  const payload: ClipboardPayload = {
    sourceModeId: setup.session.mode.id,
    entities: notes.map(({ snapshot, classification, row }) => ({
      relativeTick: snapshot.tick - firstTick,
      duration: snapshot.duration,
      velocity: snapshot.velocity,
      pitch: snapshot.pitch,
      ...(row ? { row } : {}),
      classification,
    })),
  };
  setup.session.clipboard.setData(payload);
  return payload;
}
