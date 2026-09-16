import type {
  MidiNote,
  MidiTrack,
  TempoChange,
  TimeSignatureChange,
} from "@midiedit/core";
import { describe, expect, it } from "vitest";
import { Point, Rectangle } from "pixi.js";
import { CoordinateSystem } from "./coordinates";
import { parseTempoBpm, parseTimeSignatureInput } from "./header";
import { NoteGeometryCache } from "./noteGeometry";
import { remapNotesByIdentity } from "./noteEditing";
import { iterateGridBeats } from "./rendering";
import { SelectionContext } from "./selection";
import type { PianoRollNote } from "./types";

function makeCoordinates(
  tempoChanges: TempoChange[] = [
    { tick: 0, microsecondsPerQuarterNote: 500_000 },
  ],
  snap = { enabled: true, denominator: 4 },
): CoordinateSystem {
  return new CoordinateSystem(
    {
      getPpqn: () => 480,
      getTempoChanges: () => tempoChanges,
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
    64,
  );
}

function makeNote(
  tick: number,
  durationTicks: number,
  pitch = 60,
): PianoRollNote {
  return {
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
      { tick: 0, microsecondsPerQuarterNote: 500_000 },
      { tick: 480, microsecondsPerQuarterNote: 1_000_000 },
    ]);

    for (const tick of [0, 240, 480, 720, 960]) {
      const x = coordinates.screenXForTick(tick);
      expect(coordinates.tickAtScreenX(x)).toBeCloseTo(tick, 8);
    }
  });

  it("floors regular snapping and rounds nearest snapping independently", () => {
    const coordinates = makeCoordinates();
    expect(coordinates.snapTick(719)).toBe(480);
    expect(coordinates.snapTickToNearest(719)).toBe(960);
    expect(coordinates.snapTickToNearest(-10)).toBe(0);
  });

  it("keeps the cursor's timeline position fixed while zooming", () => {
    const coordinates = makeCoordinates();
    const cursor = new Point(300, 120);
    const before = coordinates.tickAtScreenX(cursor.x);
    coordinates.zoomAtCursor(2, cursor);
    expect(coordinates.tickAtScreenX(cursor.x)).toBeCloseTo(before, 8);
  });
});

describe("piano-roll grid", () => {
  it("uses the active signature's beat and measure lengths", () => {
    const changes: TimeSignatureChange[] = [
      { tick: 0, numerator: 3, denominator: 2 },
      { tick: 1440, numerator: 4, denominator: 3 },
    ];
    const beats = Array.from(iterateGridBeats(480, changes, 0, 2400));
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
      tempoChanges: [{ tick: 0, microsecondsPerQuarterNote: 500_000 }],
      tickWidth: 0.25,
      rowHeight: 18,
      width: 800,
      height: 500,
      noteHeight: 16,
      coordinates,
    });

    expect(cache.hitTest(new Point(100, 475), coordinates)).toBe(note);
    expect(cache.hitTestEdge(new Point(183, 475), coordinates)).toBe(note);
    expect(cache.hitTest(new Point(500, 100), coordinates)).toBeNull();
  });

  it("normalizes marquee rectangles regardless of drag direction", () => {
    const rectangle = new Rectangle(100, 80, -40, -20);
    const selection = new SelectionContext();
    selection.bounds = rectangle;
    expect(selection.bounds).toEqual(new Rectangle(60, 60, 40, 20));
  });
});

describe("header input validation", () => {
  it("accepts positive tempos and power-of-two signatures only", () => {
    expect(parseTempoBpm("120")).toBe(120);
    expect(parseTempoBpm("0")).toBeNull();
    expect(parseTempoBpm("fast")).toBeNull();
    expect(parseTimeSignatureInput("7 / 8")).toEqual({
      numerator: 7,
      denominator: 3,
    });
    expect(parseTimeSignatureInput("4/3")).toBeNull();
    expect(parseTimeSignatureInput("4/0")).toBeNull();
  });
});

describe("selection identity", () => {
  it("remaps to fresh mapped notes using stable NoteOn events", () => {
    const firstEvent = {} as PianoRollNote["midiNote"]["noteOn"];
    const secondEvent = {} as PianoRollNote["midiNote"]["noteOn"];
    const first = {
      ...makeNote(0, 120),
      midiNote: { noteOn: firstEvent } as MidiNote,
    };
    const second = {
      ...makeNote(120, 120),
      midiNote: { noteOn: secondEvent } as MidiNote,
    };
    expect(
      remapNotesByIdentity([first, second], new Set([secondEvent])),
    ).toEqual([second]);
  });
});
