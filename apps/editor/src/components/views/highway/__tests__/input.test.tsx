import type { MidiChannelEvent, MidiNote } from "@openchart/core";
import { Difficulty, type MidiNotePhrase } from "@openchart/views";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ChartViewState } from "../../AbstractChartView";
import type { HighwayContext } from "../context";
import { HighwayInputController } from "../input";
import { SelectionContext } from "../selection";

function createHarness(
  options: {
    phrase?: MidiNotePhrase;
    phrases?: MidiNotePhrase[];
    note?: MidiNote;
    outsidePhraseBand?: boolean;
    mode?: "select" | "place" | "remove" | "solo" | "stagepower";
    phraseMode?: "solo" | "stagepower" | null;
    sustain?: boolean;
    cameraTick?: number;
    lockCursor?: boolean;
  } = {},
) {
  const state: ChartViewState = {
    midi: null,
    selectedTrackIndex: null,
    selectedInstrument: "LEAD GUITAR",
    selectedDifficulty: Difficulty.Expert,
    snap: { enabled: true, denominator: 4 },
    lockCursor: options.lockCursor ?? false,
    isPlaying: false,
  };
  const canvas = document.createElement("canvas");
  const setPointerCapture = vi
    .spyOn(canvas, "setPointerCapture")
    .mockImplementation(() => {});
  vi.spyOn(canvas, "releasePointerCapture").mockImplementation(() => {});

  let phraseDrag: ReturnType<typeof createPhraseDrag> | null = null;
  const phraseEditing = {
    beginPhraseDrag: vi.fn(
      (
        pointerId: number,
        kind: "solo" | "stagepower",
        tick: number,
        phrase: MidiNotePhrase | null,
        operation: "create" | "move" | "resize-start" | "resize-end",
      ) => {
        phraseDrag = createPhraseDrag(pointerId, kind, tick, phrase, operation);
      },
    ),
    getDragState: () => phraseDrag,
    finishPhraseDrag: vi.fn(() => {
      phraseDrag = null;
      return false;
    }),
    cancelPhraseDrag: vi.fn(() => {
      phraseDrag = null;
    }),
    getSelectedPhraseNoteOn: () => null,
    selectPhrases: vi.fn(),
  };
  const selection = new SelectionContext();
  const allNotes = [
    ...(options.note ? [options.note] : []),
    ...(options.phrases ?? []).map((phrase) => phrase.note),
  ];
  const track = {
    getNotes: (filter?: { pitch?: { low: number; high: number } }) =>
      filter?.pitch
        ? allNotes.filter(
            (note) =>
              note.note >= filter.pitch!.low && note.note < filter.pitch!.high,
          )
        : allNotes,
  };
  const descriptor = {
    key: "lead",
    config: { notes: { solo: 118, power: 116 } },
  };
  const song = { getTrackDescriptors: () => [descriptor] };
  const trackView = { getMidiTrack: () => track, getKey: () => "lead" };
  const chart = {
    getNotes: () => allNotes,
    getOffset: () => 0,
    getSong: () => song,
    getTrack: () => trackView,
  };
  const context = {
    getState: () => state,
    getCurrentChart: () => chart,
    getMode: () => options.mode ?? "solo",
    getPhraseMode: () =>
      options.phraseMode === undefined ? "solo" : options.phraseMode,
    getSelectionContext: () => selection,
    getPlayheadTick: () => 0,
    getCameraTick: () => options.cameraTick ?? 0,
    getPpqn: () => 480,
    getCanvas: () => canvas,
    getViewport: () => ({ width: 800, height: 600 }),
    getGhostNoteLocation: () => null,
    getPhraseHoverState: () => null,
    getHoveredNoteOn: () => null,
    canShowNotePlacementPreview: () => false,
    setCameraTick: vi.fn(),
    setPlayheadTick: vi.fn(),
    requestSeek: vi.fn(),
    requestRender: vi.fn(),
    notifyNotesChanged: vi.fn(),
    beginEdit: vi.fn(),
    endEdit: vi.fn(),
    changeSnapDenominator: vi.fn(),
    stepSnapDenominator: vi.fn(),
    updateMarqueeOutline: vi.fn(),
    clearHoverOutline: vi.fn(),
  } as unknown as HighwayContext;
  const coordinates = {
    getChartLocation: () => ({ lane: 0, tick: 240 }),
    getWorldLocation: () => ({
      x: options.outsidePhraseBand ? 4 : 0,
      y: -0.045,
      z: -12,
    }),
    getCanvasPoint: (event: MouseEvent) => ({
      x: event.clientX,
      y: event.clientY,
    }),
    getSnapTicks: () => 480,
  };
  const hitTesting = {
    getSustainAt: () => (options.sustain ? options.note : undefined),
    getNoteAt: () => options.note,
    getPhraseAt: () => options.phrase,
    getPhraseDragOperation: () => "resize-end",
    getPhraseScreenBounds: () => ({
      left: 180,
      right: 420,
      top: 130,
      bottom: 240,
    }),
  };
  const editing = {
    placeNoteAt: vi.fn(() => true),
    resizeNote: vi.fn(() => true),
  };
  const input = new HighwayInputController(
    context,
    coordinates as never,
    hitTesting as never,
    editing as never,
    phraseEditing as never,
  );
  input.attach(canvas);

  return {
    canvas,
    context,
    input,
    phraseEditing,
    selection,
    setPointerCapture,
    coordinates,
    editing,
  };
}

function createPhraseDrag(
  pointerId: number,
  kind: "solo" | "stagepower",
  tick: number,
  phrase: MidiNotePhrase | null,
  operation: "create" | "move" | "resize-start" | "resize-end",
) {
  return {
    pointerId,
    kind,
    startTick: phrase?.start ?? tick,
    endTick: phrase?.end ?? tick,
    pointerTick: tick,
    initialStartTick: phrase?.start ?? tick,
    initialEndTick: phrase?.end ?? tick,
    operation,
    note: phrase?.note ?? null,
    moved: false,
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
    const phrase = {
      start: 480,
      end: 960,
      note: { noteOn: {} as MidiChannelEvent } as MidiNote,
    } as MidiNotePhrase;
    const harness = createHarness({ phrase });
    detachInput = () => harness.input.detach();

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
    const noteOn = {} as MidiChannelEvent;
    const note = { noteOn } as MidiNote;
    const harness = createHarness({ note });
    harness.selection.add(noteOn);
    detachInput = () => harness.input.detach();

    harness.canvas.dispatchEvent(pointerEvent("pointerdown"));
    harness.canvas.dispatchEvent(pointerEvent("pointerup"));
    harness.canvas.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(harness.phraseEditing.beginPhraseDrag).not.toHaveBeenCalled();
    expect(harness.selection.isSelected(noteOn)).toBe(true);
  });

  it("marquee-selects multiple phrases independently of note selection", () => {
    const first = {
      start: 480,
      end: 960,
      note: { note: 118, noteOn: {} as MidiChannelEvent } as MidiNote,
    } as MidiNotePhrase;
    const second = {
      start: 1_200,
      end: 1_680,
      note: { note: 118, noteOn: {} as MidiChannelEvent } as MidiNote,
    } as MidiNotePhrase;
    const harness = createHarness({
      phrases: [first, second],
      outsidePhraseBand: true,
    });
    detachInput = () => harness.input.detach();

    harness.canvas.dispatchEvent(pointerEvent("pointerdown", 100, 80));
    harness.canvas.dispatchEvent(pointerEvent("pointermove", 500, 300));
    harness.canvas.dispatchEvent(pointerEvent("pointerup", 500, 300));

    expect(harness.phraseEditing.selectPhrases).toHaveBeenCalledWith(
      [first.note.noteOn, second.note.noteOn],
      false,
    );
    expect(harness.selection.size).toBe(0);
  });
});

describe("HighwayInputController note interaction", () => {
  it("refreshes the hover and placement cursor after wheel scrolling", () => {
    const noteOn = {} as MidiChannelEvent;
    const note = { note: 0, start: 0, end: 960, noteOn } as MidiNote;
    const harness = createHarness({
      mode: "place",
      phraseMode: null,
      note,
      cameraTick: 480,
    });
    detachInput = () => harness.input.detach();

    harness.canvas.dispatchEvent(
      new WheelEvent("wheel", {
        bubbles: true,
        cancelable: true,
        deltaY: 100,
        clientX: 300,
        clientY: 200,
      }),
    );

    expect(harness.context.setCameraTick).toHaveBeenCalledWith(960);
    expect(harness.context.requestSeek).not.toHaveBeenCalled();
    expect(harness.input.getGhostNoteLocation()).toMatchObject({
      lane: 0,
      tick: 240,
    });
    expect(harness.input.getHoveredNoteOn()).toBe(noteOn);
  });

  it("moves the cursor with wheel scrolling when cursor lock is enabled", () => {
    const harness = createHarness({
      phraseMode: null,
      cameraTick: 480,
      lockCursor: true,
    });
    detachInput = () => harness.input.detach();

    harness.canvas.dispatchEvent(
      new WheelEvent("wheel", {
        bubbles: true,
        cancelable: true,
        deltaY: 100,
        clientX: 300,
        clientY: 200,
      }),
    );

    expect(harness.context.setCameraTick).toHaveBeenCalledWith(960);
    expect(harness.context.requestSeek).toHaveBeenCalledWith(480);
  });

  it("keeps click placement on a sustain available in Place mode", () => {
    const note = {
      note: 0,
      start: 0,
      end: 960,
      noteOn: {} as MidiChannelEvent,
    } as MidiNote;
    const harness = createHarness({
      mode: "place",
      phraseMode: null,
      note,
      sustain: true,
    });
    detachInput = () => harness.input.detach();

    harness.canvas.dispatchEvent(pointerEvent("pointerdown"));
    harness.canvas.dispatchEvent(pointerEvent("pointerup"));
    harness.canvas.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(harness.editing.placeNoteAt).toHaveBeenCalledWith(
      expect.anything(),
      0,
      240,
      false,
      note,
    );
  });

  it("resizes a sustain by dragging it in Place mode", () => {
    const note = {
      note: 0,
      start: 0,
      end: 960,
      noteOn: {} as MidiChannelEvent,
    } as MidiNote;
    const harness = createHarness({
      mode: "place",
      phraseMode: null,
      note,
      sustain: true,
    });
    vi.spyOn(harness.coordinates, "getChartLocation")
      .mockReturnValueOnce({ lane: 0, tick: 240 })
      .mockReturnValueOnce({ lane: 0, tick: 480 });
    detachInput = () => harness.input.detach();

    harness.canvas.dispatchEvent(pointerEvent("pointerdown"));
    harness.canvas.dispatchEvent(pointerEvent("pointermove", 300, 300));
    harness.canvas.dispatchEvent(pointerEvent("pointerup", 300, 300));

    expect(harness.editing.resizeNote).toHaveBeenCalledWith(
      expect.anything(),
      note,
      480,
    );
    expect(harness.editing.placeNoteAt).not.toHaveBeenCalled();
    expect(harness.context.notifyNotesChanged).toHaveBeenCalledOnce();
  });
});
