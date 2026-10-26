import {
  MetaType,
  type MidiNote,
  type MidiTrack,
  type TempoEvent,
  type TimeSignatureEvent,
} from "@openchart/midi";
import { Box2, Vector2 } from "three";
import { describe, expect, it, vi } from "vitest";
import { formatNoteId, SelectionModel } from "@openchart/views";
import {
  parseTempoString,
  parseTimeSignatureString,
} from "../../../../audio/musicalTime";
import { CoordinateSystem } from "../coordinates";
import { HeaderHeight } from "../constants";
import { DefaultHeaderLanes, HeaderController } from "../controllers/header";
import { PianoRollInputController } from "../input/input";
import { NoteGeometryCache } from "../rendering/geometry";
import { PointerContext } from "../input/pointer";
import { iterateGridBeats } from "../rendering/rendering";
import { SelectionContext } from "../selection";
import type { PianoRollNote } from "../types";
import { applyStyle } from "../../../../util/css";

function makeCoordinates(
  tempoEvents: TempoEvent[] = [
    {
      deltaTime: 0,
      status: 0xff,
      type: MetaType.Tempo,
      length: 3,
      tick: 0,
      microsecondsPerQuarterNote: 500_000,
    },
  ],
  snap = { enabled: true, denominator: 4 },
): CoordinateSystem {
  return new CoordinateSystem(
    {
      getPpqn: () => 480,
      getTempoEvents: () => tempoEvents,
      getState: () =>
        ({
          midi: null,
          selectedTrackIndex: null,
          selectedInstrument: "",
          selectedDifficulty: 0,
          snap,
        }) as never,
    },
    { x: 0, y: 84, h: 120, v: 18 },
  );
}

function makeNote(
  tick: number,
  durationTicks: number,
  pitch = 60,
): PianoRollNote {
  return {
    id: formatNoteId(0, `test-${tick}-${pitch}`),
    tick,
    durationTicks,
    pitch,
    velocity: 100,
    midiNote: {} as MidiNote,
  };
}

describe("piano-roll coordinates", () => {
  it("round-trips ticks and pixels across tempo segments", () => {
    const coordinates = makeCoordinates([
      {
        deltaTime: 0,
        status: 0xff,
        type: MetaType.Tempo,
        length: 3,
        tick: 0,
        microsecondsPerQuarterNote: 500_000,
      },
      {
        deltaTime: 480,
        status: 0xff,
        type: MetaType.Tempo,
        length: 3,
        tick: 480,
        microsecondsPerQuarterNote: 1_000_000,
      },
    ]);

    for (const tick of [0, 240, 480, 720, 960]) {
      const x = coordinates.screenXForTick(tick);
      expect(coordinates.tickAtScreenX(x)).toBeCloseTo(tick, 8);
    }
  });

  it("floors regular snapping and rounds nearest snapping independently", () => {
    const coordinates = makeCoordinates();
    expect(coordinates.snapTick(719)).toBe(480);
    expect(coordinates.snapTickToNearest(721)).toBe(960);
    expect(coordinates.snapTickToNearest(-10)).toBe(0);
  });

  it("keeps the cursor's timeline position fixed while zooming", () => {
    const coordinates = makeCoordinates();
    const cursor = new Vector2(300, 120);
    const before = coordinates.tickAtScreenX(cursor.x);
    coordinates.zoomAtCursor(2, cursor);
    expect(coordinates.tickAtScreenX(cursor.x)).toBeCloseTo(before, 8);
  });
});

describe("piano-roll grid", () => {
  it("uses the active signature's beat and measure lengths", () => {
    const events: TimeSignatureEvent[] = [
      {
        deltaTime: 0,
        status: 0xff,
        type: MetaType.TimeSignature,
        length: 4,
        tick: 0,
        numerator: 3,
        denominator: 2,
      },
      {
        deltaTime: 0,
        status: 0xff,
        type: MetaType.TimeSignature,
        length: 4,
        tick: 1440,
        numerator: 4,
        denominator: 3,
      },
    ];
    const beats = Array.from(iterateGridBeats(480, events, 0, 2400));
    expect(
      beats.filter((beat) => beat.isMeasure).map((beat) => beat.tick),
    ).toEqual([0, 1440, 2400]);
    expect(beats.some((beat) => beat.tick === 1920 && !beat.isMeasure)).toBe(
      true,
    );
  });
});

describe("note geometry", () => {
  it("finds note bodies and right-edge resize handles", () => {
    const coordinates = makeCoordinates();
    const cache = new NoteGeometryCache();
    const note = makeNote(0, 480);
    cache.rebuild({
      track: {} as MidiTrack,
      notes: [note],
      noteIndex: null,
      tempoEvents: [
        {
          deltaTime: 0,
          status: 0xff,
          type: MetaType.Tempo,
          length: 3,
          tick: 0,
          microsecondsPerQuarterNote: 500_000,
        },
      ],
      tickWidth: 0.25,
      rowHeight: 18,
      width: 800,
      height: 500,
      noteHeight: 16,
      coordinates,
    });

    expect(cache.hitTest(new Vector2(100, 475), coordinates)).toBe(note);
    expect(cache.hitTestEdge(new Vector2(183, 475), coordinates)).toBe(note);
    expect(cache.hitTest(new Vector2(500, 100), coordinates)).toBeNull();
  });

  it("normalizes marquee rectangles regardless of drag direction", () => {
    const rectangle = new Box2(new Vector2(100, 80), new Vector2(60, 60));
    const selection = new SelectionContext();
    selection.bounds = rectangle;
    expect(selection.bounds).toEqual(
      new Box2(new Vector2(60, 60), new Vector2(100, 80)),
    );
  });
});

describe("header input validation", () => {
  it("accepts positive tempos and power-of-two signatures only", () => {
    expect(parseTempoString("120")).toBe(120);
    expect(parseTempoString("0")).toBeNull();
    expect(parseTempoString("fast")).toBeNull();
    expect(parseTimeSignatureString("7 / 8")).toEqual({
      numerator: 7,
      denominator: 3,
    });
    expect(parseTimeSignatureString("4/3")).toBeNull();
    expect(parseTimeSignatureString("4/0")).toBeNull();
  });
});

describe("header lanes", () => {
  it("renders all lanes by default and supports changing visibility and order", () => {
    const requestRender = vi.fn();
    const header = new HeaderController(
      { requestRender } as never,
      makeCoordinates(),
    );

    expect(DefaultHeaderLanes).toEqual(["tempo", "timeSignature", "text"]);
    expect(header.laneAt(0)).toBe("tempo");
    expect(header.laneAt(12)).toBe("timeSignature");
    expect(header.laneAt(24)).toBe("text");
    expect(header.laneAt(HeaderHeight)).toBeNull();

    header.setVisibleLanes(["text", "tempo"]);
    expect(header.laneAt(0)).toBe("text");
    expect(header.laneAt(18)).toBe("tempo");
    expect(header.laneAt(HeaderHeight - 1)).toBe("tempo");
    expect(requestRender).toHaveBeenCalledOnce();

    header.setVisibleLanes([]);
    expect(header.laneAt(0)).toBeNull();
    expect(requestRender).toHaveBeenCalledTimes(2);
  });
});

describe("DOM styles", () => {
  it("applies styles to the element's style declaration", () => {
    const element = { style: {} } as HTMLElement;

    applyStyle(element, { position: "absolute", top: "36px" });

    expect(element.style.position).toBe("absolute");
    expect(element.style.top).toBe("36px");
  });
});

describe("selection identity", () => {
  it("resolves selected entity ids to fresh notes after document replacement", () => {
    const firstEvent = {} as NonNullable<PianoRollNote["midiNote"]>["noteOn"];
    const secondEvent = {} as NonNullable<PianoRollNote["midiNote"]>["noteOn"];
    const first = {
      ...makeNote(0, 120),
      midiNote: { noteOn: firstEvent } as MidiNote,
    };
    const second = {
      ...makeNote(120, 120),
      midiNote: { noteOn: secondEvent } as MidiNote,
    };
    const model = new SelectionModel();
    const selection = new SelectionContext();
    let resolved = new Map<string, PianoRollNote>([
      [first.id, first],
      [second.id, second],
    ]);
    selection.bindSharedSelection(model, (id) => resolved.get(id) ?? null);
    model.setSelectedIds([second.id]);
    expect(selection.notes).toEqual([second]);

    const restoredEvent = {} as NonNullable<
      PianoRollNote["midiNote"]
    >["noteOn"];
    const restored = {
      ...second,
      midiNote: { noteOn: restoredEvent } as MidiNote,
    };
    resolved = new Map<string, PianoRollNote>([[second.id, restored]]);
    selection.refreshSharedSelection();
    expect(selection.notes).toEqual([restored]);
    expect(selection.isSelected(restored)).toBe(true);
  });
});

describe("piano-roll note creation", () => {
  it("seeks on an empty click and creates only after a minimal drag", () => {
    const selection = new SelectionContext();
    const pointer = new PointerContext();
    const beginCreate = vi.fn();
    const requestSeek = vi.fn();
    const canvas = {
      getBoundingClientRect: () => ({ left: 0, top: 0 }),
      focus: vi.fn(),
      setPointerCapture: vi.fn(),
      hasPointerCapture: () => false,
    } as unknown as HTMLCanvasElement;
    const input = new PianoRollInputController(
      {
        getPointerContext: () => pointer,
        getSelectionContext: () => selection,
        getState: () => ({ isPlaying: false }),
        requestRender: vi.fn(),
        requestSeek,
      } as never,
      {
        tickAtScreenX: (x: number) => x,
        snapTickToNearest: (tick: number) => tick,
      } as never,
      {
        hitTest: () => null,
        hitTestEdge: () => null,
        geometry: [],
      } as never,
      {
        beginPointerGesture: vi.fn(),
        beginCreate,
        updateResize: vi.fn(),
        finishGesture: vi.fn(),
        cancelGesture: vi.fn(),
      } as never,
      { endDrag: vi.fn(), updateHover: vi.fn() } as never,
    );
    const controller = input as unknown as {
      canvas: HTMLCanvasElement | null;
      handlePointerDown: (event: PointerEvent) => void;
      handlePointerMove: (event: PointerEvent) => void;
      handlePointerUp: (event: PointerEvent) => void;
    };
    controller.canvas = canvas;

    controller.handlePointerDown({
      button: 0,
      pointerId: 1,
      clientX: 100,
      clientY: HeaderHeight + 20,
      preventDefault: vi.fn(),
    } as unknown as PointerEvent);
    controller.handlePointerUp({ pointerId: 1 } as PointerEvent);

    expect(requestSeek).toHaveBeenCalledWith(100);
    expect(beginCreate).not.toHaveBeenCalled();

    controller.handlePointerDown({
      button: 0,
      pointerId: 2,
      clientX: 100,
      clientY: HeaderHeight + 20,
      preventDefault: vi.fn(),
    } as unknown as PointerEvent);
    controller.handlePointerMove({
      pointerId: 2,
      clientX: 105,
      clientY: HeaderHeight + 20,
    } as PointerEvent);
    controller.handlePointerUp({ pointerId: 2 } as PointerEvent);

    expect(beginCreate).toHaveBeenCalledWith({
      x: 100,
      y: HeaderHeight + 20,
    });
    expect(requestSeek).toHaveBeenCalledTimes(1);
  });

  it("cancels an active gesture on pointercancel instead of committing it", () => {
    const pointer = new PointerContext();
    const beginPointerGesture = vi.fn();
    const finishGesture = vi.fn();
    const cancelGesture = vi.fn();
    const canvas = {
      getBoundingClientRect: () => ({ left: 0, top: 0 }),
      focus: vi.fn(),
      setPointerCapture: vi.fn(),
      hasPointerCapture: () => false,
    } as unknown as HTMLCanvasElement;
    const input = new PianoRollInputController(
      {
        getPointerContext: () => pointer,
        getSelectionContext: () => new SelectionContext(),
        getState: () => ({ isPlaying: false }),
        requestRender: vi.fn(),
      } as never,
      {} as never,
      {
        hitTest: () => null,
        hitTestEdge: () => null,
      } as never,
      {
        beginPointerGesture,
        finishGesture,
        cancelGesture,
      } as never,
      { endDrag: vi.fn() } as never,
    );
    const controller = input as unknown as {
      canvas: HTMLCanvasElement | null;
      handlePointerDown: (event: PointerEvent) => void;
      handlePointerCancel: (event: PointerEvent) => void;
    };
    controller.canvas = canvas;
    controller.handlePointerDown({
      button: 0,
      pointerId: 7,
      clientX: 100,
      clientY: HeaderHeight + 20,
      preventDefault: vi.fn(),
    } as unknown as PointerEvent);
    controller.handlePointerCancel({ pointerId: 7 } as PointerEvent);

    expect(beginPointerGesture).toHaveBeenCalledOnce();
    expect(cancelGesture).toHaveBeenCalledOnce();
    expect(finishGesture).not.toHaveBeenCalled();
    expect(pointer.id).toBeNull();
  });

  it("pans the camera by the middle-button drag distance", () => {
    const pointer = new PointerContext();
    const pan = vi.fn();
    const input = new PianoRollInputController(
      {
        getPointerContext: () => pointer,
        requestRender: vi.fn(),
      } as never,
      { pan } as never,
      {} as never,
      {} as never,
      { updateHover: vi.fn() } as never,
    );
    const controller = input as unknown as {
      handlePointerDown: (event: PointerEvent) => void;
      handlePointerMove: (event: PointerEvent) => void;
    };

    controller.handlePointerDown({
      button: 1,
      pointerId: 3,
      clientX: 100,
      clientY: 120,
      preventDefault: vi.fn(),
    } as unknown as PointerEvent);
    controller.handlePointerMove({
      pointerId: 3,
      clientX: 112,
      clientY: 135,
    } as PointerEvent);

    expect(pan).toHaveBeenCalledWith(12, 15);
  });
});
