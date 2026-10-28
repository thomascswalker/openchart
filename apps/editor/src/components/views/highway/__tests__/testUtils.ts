import { Midi } from "@openchart/midi";
import {
  DefaultCompiledRuleset,
  createStandaloneEditing,
  Difficulty,
  formatNoteId,
  SongView,
  type ClipboardPayload,
  type CompiledRuleset,
  type EditingSession,
  type PhraseEffect,
  type PreviewState,
  type TrackDescriptor,
} from "@openchart/views";
import type { ChartView } from "@openchart/views";
import type { ChartViewState } from "../../AbstractChartView";
import type { HighwayContext } from "../context";

export function createHighwayTestSetup(
  trackKey: "lead-guitar" | "drums" = "lead-guitar",
  rules: CompiledRuleset = DefaultCompiledRuleset,
  difficulty = Difficulty.Expert,
) {
  const midi = new Midi();
  const midiTrack = midi.tracks[midi.addTrack()]!;
  const trackRules = rules.byKey.get(trackKey);
  if (!trackRules) throw new Error(`Missing test track '${trackKey}'`);
  midiTrack.name = trackRules.name;
  const song = new SongView(midi, rules);
  const descriptor = song
    .getTrackDescriptors()
    .find((track) => track.key === trackKey);
  if (!descriptor) throw new Error(`Missing test track '${trackKey}'`);
  const trackIndex = midi.tracks.indexOf(midiTrack);
  const chartView = song.getInstrumentTrackView(trackKey)?.getChart(difficulty);
  if (!chartView) throw new Error(`Missing test chart '${trackKey}'`);
  const chart = withLegacyChartHelpers(chartView);
  const editing = createStandaloneEditing(midi, rules);
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
  let notePlacementType = "normal";
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
      notePlacementType =
        next === "force-hopo"
          ? "marker:forceHopo"
          : next === "force-strum"
            ? "marker:forceStrum"
            : next === "tap"
              ? "marker:forceTap"
              : next;
    },
    setDrumPlacementKind: (next: typeof drumPlacementKind) => {
      drumPlacementKind = next;
      notePlacementType =
        next === "cymbal"
          ? "padType:cymbal"
          : next === "kick"
            ? "bar:kick"
            : "normal";
    },
    setToolMode: (next: typeof toolMode) => {
      toolMode = next;
    },
    setPhraseMode: (next: typeof phraseMode) => {
      phraseMode = next;
    },
  };
}

function withLegacyChartHelpers(chart: ChartView): ChartView & {
  getOffset(): number;
  getLaneCount(): number;
} {
  return Object.assign(chart, {
    getOffset() {
      const firstColumn = chart.getColumns()[0];
      const pitches = [...chart.getChartRules().notes.values()]
        .filter((note) => note.laneId === firstColumn?.id)
        .map((note) => note.pitch);
      if (pitches.length === 0) {
        throw new Error(
          `Chart '${chart.getRules().key}' has no pitch for its first lane`,
        );
      }
      return Math.min(...pitches);
    },
    getLaneCount: () => chart.getColumns().length,
  });
}

export function getPhrasePitch(
  descriptor: TrackDescriptor,
  kind: string,
): number | undefined {
  const effectByKind: Record<string, PhraseEffect> = {
    stagepower: "starPower",
    solo: "solo",
  };
  const phrase = descriptor.rules.phrases.find(
    (item) => item.id === kind || item.effect === effectByKind[kind],
  );
  return phrase?.pitches[0];
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
      pitch: note.pitch,
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
