import type { MidiNote } from "@openchart/midi";
import { Difficulty, formatNoteId } from "@openchart/views";
import { Vector2 } from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HighwayView } from "../index";
import type { HighwayCoordinateSystem } from "../coordinates";
import type { HighwayContext } from "../context";
import { HighwayNoteEditingController } from "../editing/noteEditing";
import { HighwayPhraseEditingController } from "../editing/phraseEditing";
import type { HighwayPhrase } from "../hitTesting";
import { HighwayInputController } from "../input/input";
import type { IndexedNote } from "../noteIndex";
import { createHighwayTestSetup, getPhrasePitch } from "./testUtils";

interface NoteFixture {
  pitch?: number;
  start?: number;
  end?: number;
}

interface PhraseFixture {
  start: number;
  end: number;
  kind?: string;
}

function createHarness(
  options: {
    phrase?: PhraseFixture;
    phrases?: PhraseFixture[];
    note?: NoteFixture;
    outsidePhraseBand?: boolean;
    mode?: "select" | "place" | "remove";
    phraseMode?: "solo" | "stagepower" | null;
    sustain?: boolean;
    cameraTick?: number;
    lockCursor?: boolean;
  } = {},
) {
  const setup = createHighwayTestSetup();
  const canvas = document.createElement("canvas");
  const setPointerCapture = vi
    .spyOn(canvas, "setPointerCapture")
    .mockImplementation(() => {});
  vi.spyOn(canvas, "releasePointerCapture").mockImplementation(() => {});

  const addNote = ({
    pitch = setup.chart.getOffset(),
    start = 0,
    end = start + 1,
  }: NoteFixture): MidiNote =>
    setup.midiTrack.insertNote({
      pitch,
      tick: start,
      duration: end - start,
    });
  const notes = options.note ? [addNote(options.note)] : [];
  const toIndexed = (note: MidiNote): IndexedNote => ({
    id: formatNoteId(
      setup.session.target.trackIndex!,
      setup.midiTrack.getEventId(note.noteOn),
    ),
    source: note,
    pitch: note.pitch,
    start: note.start,
    end: note.end,
    velocity: note.velocity,
    lane: note.pitch - setup.chart.getOffset(),
    kind: "note",
    phraseKind: null,
    laneId: null,
  });
  const addPhrase = (fixture: PhraseFixture): HighwayPhrase => {
    const kind = fixture.kind ?? "solo";
    const descriptor = setup.song
      .getTrackDescriptors()
      .find((track) => track.key === "lead-guitar")!;
    const pitch = getPhrasePitch(descriptor, kind)!;
    const note = addNote({
      pitch,
      start: fixture.start,
      end: fixture.end,
    });
    return {
      id: formatNoteId(
        setup.session.target.trackIndex!,
        setup.midiTrack.getEventId(note.noteOn),
      ),
      start: note.start,
      end: note.end,
      kind,
    };
  };
  const phrases = [
    ...(options.phrase ? [addPhrase(options.phrase)] : []),
    ...(options.phrases ?? []).map(addPhrase),
  ];
  setup.setToolMode(options.mode ?? "select");
  setup.setPhraseMode(
    options.phraseMode === undefined ? "solo" : options.phraseMode,
  );
  setup.context.getState().lockCursor = options.lockCursor ?? false;
  setup.context.setCameraTick(options.cameraTick ?? 0);

  const context = setup.context as HighwayContext;
  const selection = setup.selection;
  const phraseEditing = new HighwayPhraseEditingController(context, {
    snapTick: (tick) => Math.round(tick / 240) * 240,
  } as HighwayCoordinateSystem);
  vi.spyOn(phraseEditing, "beginPhraseDrag");
  vi.spyOn(phraseEditing, "finishPhraseDrag");
  vi.spyOn(phraseEditing, "selectPhrases");
  let hoveredNote = notes[0] ? toIndexed(notes[0]) : null;
  const hitTesting = {
    getSustainAt: () =>
      options.sustain && hoveredNote ? hoveredNote : undefined,
    getNoteAt: () => hoveredNote,
    getPhraseAt: (_chart: unknown, _event: unknown, kind: string) =>
      options.outsidePhraseBand
        ? undefined
        : (phrases.find((phrase) => phrase.kind === kind) ?? undefined),
    getPhraseDragOperation: () => "resize-end" as const,
    getPhraseScreenBounds: () => ({
      left: 180,
      right: 420,
      top: 130,
      bottom: 240,
    }),
  };
  const coordinates = {
    getChartLocation: vi.fn(() => ({ lane: 0, tick: 240 })),
    getWorldLocation: () => ({
      x: options.outsidePhraseBand ? 4 : 0,
      y: -0.045,
      z: -12,
    }),
    getCanvasPoint: (event: MouseEvent) =>
      new Vector2(event.clientX, event.clientY),
    getTickAtDepth: (depth: number) => (depth < 0 ? 0 : 10_000),
    getSnapTicks: () => 480,
    getPhysicalLaneCount: () => 5,
  };
  const editing = new HighwayNoteEditingController(context);
  vi.spyOn(editing, "placeNoteAt");
  vi.spyOn(editing, "resizeNote");
  const input = new HighwayInputController(
    context,
    coordinates as unknown as HighwayCoordinateSystem,
    hitTesting as never,
    editing,
    phraseEditing,
  );
  input.attach(canvas);

  return {
    setup,
    canvas,
    context,
    input,
    chart: setup.chart,
    phraseEditing,
    selection,
    setPointerCapture,
    coordinates,
    hitTesting,
    editing,
    notes,
    phrases,
    setHoveredNote: (note: MidiNote | null) => {
      hoveredNote = note ? toIndexed(note) : null;
    },
  };
}

function pointerEvent(
  type: string,
  clientX = 300,
  clientY = 200,
): PointerEvent {
  return new PointerEvent(type, {
    bubbles: true,
    button: 0,
    buttons: type === "pointerdown" ? 1 : 0,
    pointerId: 17,
    clientX,
    clientY,
  });
}

let detachInput: (() => void) | null = null;

afterEach(() => {
  detachInput?.();
  detachInput = null;
  vi.restoreAllMocks();
});

describe("HighwayInputController phrase pointer routing", () => {
  it("selects and resizes a phrase hit before starting a marquee", () => {
    const harness = createHarness({
      phrase: { start: 480, end: 960 },
    });

    detachInput = () => harness.input.detach();
    const [phrase] = harness.phrases;

    harness.canvas.dispatchEvent(pointerEvent("pointerdown"));
    expect(harness.phraseEditing.beginPhraseDrag).toHaveBeenCalledWith(
      17,
      "solo",
      240,
      phrase,
      "resize-end",
    );
    expect(harness.setPointerCapture).toHaveBeenCalledWith(17);
    expect(harness.canvas.style.cursor).toBe("ns-resize");

    harness.canvas.dispatchEvent(pointerEvent("pointerup"));
    expect(harness.phraseEditing.finishPhraseDrag).toHaveBeenCalledOnce();
  });

  it("creates a phrase from empty space in the phrase band", () => {
    const harness = createHarness();
    detachInput = () => harness.input.detach();

    harness.canvas.dispatchEvent(pointerEvent("pointerdown"));
    expect(harness.phraseEditing.beginPhraseDrag).toHaveBeenCalledWith(
      17,
      "solo",
      240,
      null,
      "create",
    );
    expect(harness.canvas.style.cursor).toBe("default");
  });

  it("keeps direct note clicks out of note selection in phrase mode", () => {
    const harness = createHarness({
      note: { pitch: 96, start: 480, end: 481 },
    });
    const note = harness.notes[0]!;
    const id = formatNoteId(
      harness.setup.session.target.trackIndex!,
      harness.setup.midiTrack.getEventId(note.noteOn),
    );
    harness.setup.session.selection.add(id);
    detachInput = () => harness.input.detach();

    harness.canvas.dispatchEvent(pointerEvent("pointerdown"));
    harness.canvas.dispatchEvent(pointerEvent("pointerup"));
    harness.canvas.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(harness.phraseEditing.beginPhraseDrag).not.toHaveBeenCalled();
    expect(harness.selection.isSelected(id)).toBe(true);
  });

  it("marquee-selects multiple phrases independently of note selection", () => {
    const harness = createHarness({
      phrases: [
        { start: 480, end: 960 },
        { start: 1_200, end: 1_680 },
      ],
      outsidePhraseBand: true,
    });
    detachInput = () => harness.input.detach();

    harness.canvas.dispatchEvent(pointerEvent("pointerdown", 100, 80));
    harness.canvas.dispatchEvent(pointerEvent("pointermove", 500, 300));
    harness.canvas.dispatchEvent(pointerEvent("pointerup", 500, 300));

    expect(harness.phraseEditing.selectPhrases).toHaveBeenCalledWith(
      harness.phrases.map((phrase) => phrase.id),
      false,
    );
    expect(harness.selection.getSelectedIds()).toEqual(
      harness.phrases.map((phrase) => phrase.id),
    );
  });
});

describe("HighwayView playback interruption", () => {
  it("cancels active input gestures when playback starts", () => {
    const view = new HighwayView();
    const cancelActiveGestures = vi.spyOn(
      HighwayInputController.prototype,
      "cancelActiveGestures",
    );

    view.update({
      midi: null,
      selectedTrackKey: null,
      selectedTrackIndex: null,
      selectedInstrument: "LEAD GUITAR",
      selectedDifficulty: Difficulty.Expert,
      snap: { enabled: true, denominator: 4 },
      lockCursor: false,
      isPlaying: true,
    });

    expect(cancelActiveGestures).toHaveBeenCalledTimes(1);
    view.destroy();
  });
});

describe("HighwayInputController keyboard selection range", () => {
  it("extends and contracts a range independently of note selection", () => {
    const harness = createHarness({ mode: "select", phraseMode: null });
    detachInput = () => harness.input.detach();

    harness.input.stepPlayhead(1, true);
    harness.input.stepPlayhead(1, true);
    harness.input.stepPlayhead(-1, true);

    expect(harness.context.getSelectionRange()).toEqual({ start: 0, end: 480 });
    expect(harness.selection.getSelectedIds()).toHaveLength(0);

    window.dispatchEvent(new KeyboardEvent("keyup", { key: "Shift" }));
    harness.input.stepPlayhead(1);
    expect(harness.context.getSelectionRange()).toEqual({ start: 0, end: 480 });
  });

  it("selects notes inside the range in the shared selection model", () => {
    const harness = createHarness({ mode: "select", phraseMode: null });
    detachInput = () => harness.input.detach();
    const offset = harness.chart.getOffset();
    const inside = harness.setup.midiTrack.insertNote({
      pitch: offset,
      tick: 480,
      duration: 1,
    });
    const outside = harness.setup.midiTrack.insertNote({
      pitch: offset + 1,
      tick: 1_440,
      duration: 1,
    });

    harness.input.stepPlayhead(1, true);
    expect(harness.selection.getSelectedIds()).toHaveLength(0);
    harness.input.stepPlayhead(1, true);
    expect(harness.selection.getSelectedIds()).toEqual([
      formatNoteId(
        harness.setup.session.target.trackIndex!,
        harness.setup.midiTrack.getEventId(inside.noteOn),
      ),
    ]);
    harness.input.stepPlayhead(1, true);
    expect(harness.selection.getSelectedIds()).toEqual([
      formatNoteId(
        harness.setup.session.target.trackIndex!,
        harness.setup.midiTrack.getEventId(inside.noteOn),
      ),
    ]);
    harness.input.stepPlayhead(1, true);
    expect(harness.selection.getSelectedIds()).toEqual([
      formatNoteId(
        harness.setup.session.target.trackIndex!,
        harness.setup.midiTrack.getEventId(inside.noteOn),
      ),
      formatNoteId(
        harness.setup.session.target.trackIndex!,
        harness.setup.midiTrack.getEventId(outside.noteOn),
      ),
    ]);
    harness.input.stepPlayhead(-1, true);
    expect(harness.selection.getSelectedIds()).toEqual([
      formatNoteId(
        harness.setup.session.target.trackIndex!,
        harness.setup.midiTrack.getEventId(inside.noteOn),
      ),
    ]);
  });
});

describe("HighwayInputController note interaction", () => {
  it("refreshes hover and placement cursor after wheel scrolling", () => {
    const harness = createHarness({
      mode: "place",
      phraseMode: null,
      note: { pitch: 96, start: 0, end: 960 },
      cameraTick: 480,
    });
    detachInput = () => harness.input.detach();
    const note = harness.notes[0]!;
    const requestSeek = vi.spyOn(harness.context, "requestSeek");
    const setCameraTick = vi.spyOn(harness.context, "setCameraTick");
    harness.setHoveredNote(note);

    harness.canvas.dispatchEvent(
      new WheelEvent("wheel", {
        bubbles: true,
        cancelable: true,
        deltaY: 100,
        clientX: 300,
        clientY: 200,
      }),
    );

    expect(setCameraTick).toHaveBeenCalledWith(960);
    expect(requestSeek).not.toHaveBeenCalled();
    expect(harness.input.getGhostNoteLocation()).toMatchObject({
      lane: 0,
      tick: 240,
    });
    expect(harness.input.getHoveredNoteOn()).toBe(note.noteOn);
  });

  it("moves the cursor with wheel scrolling when cursor lock is enabled", () => {
    const harness = createHarness({
      phraseMode: null,
      cameraTick: 480,
      lockCursor: true,
    });
    detachInput = () => harness.input.detach();
    const setCameraTick = vi.spyOn(harness.context, "setCameraTick");
    const requestSeek = vi.spyOn(harness.context, "requestSeek");

    harness.canvas.dispatchEvent(
      new WheelEvent("wheel", {
        bubbles: true,
        cancelable: true,
        deltaY: 100,
        clientX: 300,
        clientY: 200,
      }),
    );

    expect(setCameraTick).toHaveBeenCalledWith(960);
    expect(requestSeek).toHaveBeenCalledWith(480);
  });

  it("keeps click placement on a sustain available in Place mode", () => {
    const harness = createHarness({
      mode: "place",
      phraseMode: null,
      note: { pitch: 96, start: 0, end: 960 },
      sustain: true,
    });
    detachInput = () => harness.input.detach();
    const note = harness.notes[0]!;

    harness.canvas.dispatchEvent(pointerEvent("pointerdown"));
    harness.canvas.dispatchEvent(pointerEvent("pointerup"));
    harness.canvas.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(harness.editing.placeNoteAt).toHaveBeenCalledWith(
      harness.chart,
      0,
      240,
      false,
      note,
    );
  });

  it("previews a held lane note and commits its sustain length on release", () => {
    const harness = createHarness({ mode: "select", phraseMode: null });
    detachInput = () => harness.input.detach();
    harness.context.requestSeek(480);

    harness.input.toggleLaneNote(0);
    expect(harness.chart.getNotes()).toHaveLength(0);

    harness.input.stepPlayhead(-1);
    expect(harness.setup.context.getPreviewState()?.added[0]?.duration).toBe(1);
    harness.input.stepPlayhead(1);
    harness.input.stepPlayhead(1);
    expect(harness.setup.context.getPreviewState()?.added[0]?.duration).toBe(
      480,
    );

    harness.input.releaseLaneNote(0);
    const note = harness.chart.getNotes()[0]!;
    expect(note.end).toBe(960);
    expect(harness.setup.editing.history.undoDepth).toBe(1);
    harness.input.stepPlayhead(1);
    expect(note.end).toBe(960);
  });

  it("stops a held sustain at the next note start", () => {
    const harness = createHarness({ mode: "select", phraseMode: null });
    detachInput = () => harness.input.detach();
    harness.context.requestSeek(480);
    harness.setup.midiTrack.insertNote({
      pitch: harness.chart.getOffset() + 1,
      tick: 720,
      duration: 1,
    });

    harness.input.toggleLaneNote(0);
    harness.input.stepPlayhead(1);

    expect(harness.chart.getNotes()).toHaveLength(1);
    expect(harness.setup.context.getPreviewState()?.added[0]?.duration).toBe(
      240,
    );
    harness.input.releaseLaneNote(0);
    expect(
      harness.chart
        .getNotes()
        .find((note) => note.pitch === harness.chart.getOffset())?.end,
    ).toBe(720);
  });

  it("previews and commits a sustain resize in Place mode", () => {
    const harness = createHarness({
      mode: "place",
      phraseMode: null,
      note: { pitch: 96, start: 0, end: 960 },
      sustain: true,
    });
    const note = harness.notes[0]!;
    vi.spyOn(harness.coordinates, "getChartLocation")
      .mockReturnValueOnce({ lane: 0, tick: 240 })
      .mockReturnValueOnce({ lane: 0, tick: 480 });
    detachInput = () => harness.input.detach();

    harness.canvas.dispatchEvent(pointerEvent("pointerdown"));
    harness.canvas.dispatchEvent(pointerEvent("pointermove", 300, 300));
    expect(note.end).toBe(960);
    expect(
      harness.setup.context
        .getPreviewState()
        ?.updated.get(
          formatNoteId(
            harness.setup.session.target.trackIndex!,
            harness.setup.midiTrack.getEventId(note.noteOn),
          ),
        )?.duration,
    ).toBe(480);
    harness.canvas.dispatchEvent(pointerEvent("pointerup", 300, 300));

    expect(note.end).toBe(480);
    expect(harness.editing.placeNoteAt).not.toHaveBeenCalled();
    expect(harness.setup.editing.history.undoDepth).toBe(1);
  });

  it("cancels a note drag without changing MIDI or history", () => {
    const harness = createHarness({
      mode: "select",
      phraseMode: null,
      note: { pitch: 96, start: 0, end: 120 },
    });
    const before = harness.setup.midi.toBuffer();
    detachInput = () => harness.input.detach();

    harness.canvas.dispatchEvent(pointerEvent("pointerdown"));
    vi.spyOn(harness.coordinates, "getChartLocation").mockReturnValue({
      lane: 1,
      tick: 720,
    });
    harness.canvas.dispatchEvent(pointerEvent("pointermove", 420, 240));
    expect(harness.setup.context.getPreviewState()?.updated.size).toBe(1);
    expect(harness.setup.midi.toBuffer()).toEqual(before);

    harness.input.cancelActiveGestures();

    expect(harness.setup.midi.toBuffer()).toEqual(before);
    expect(harness.setup.editing.history.undoDepth).toBe(0);
    expect(harness.setup.context.getPreviewState()).toBeNull();
  });
});
