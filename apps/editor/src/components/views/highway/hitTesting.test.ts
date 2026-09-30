import { describe, expect, it } from "vitest";
import type { MidiNote } from "@midiedit/core";
import * as THREE from "three";
import {
  Difficulty,
  type ChartView,
  type MidiNotePhrase,
} from "@midiedit/views";
import type { ChartViewState } from "../AbstractChartView";
import { HighwayCoordinateSystem } from "./coordinates";
import {
  HighwayHitTester,
  getPhraseBoundaryHitOperation,
  type PhraseBoundaryProjection,
} from "./hitTesting";

function boundary(y: number): PhraseBoundaryProjection {
  return {
    worldStart: new THREE.Vector3(-3, -0.035, 0),
    worldEnd: new THREE.Vector3(3, -0.035, 0),
    screenStart: new THREE.Vector2(100, y),
    screenEnd: new THREE.Vector2(500, y),
  };
}

describe("phrase boundary hit testing", () => {
  it("identifies the start or end edge inside the pixel threshold", () => {
    const start = boundary(200);
    const end = boundary(260);

    expect(
      getPhraseBoundaryHitOperation(new THREE.Vector2(300, 205), start, end, 9),
    ).toBe("resize-start");
    expect(
      getPhraseBoundaryHitOperation(new THREE.Vector2(300, 256), start, end, 9),
    ).toBe("resize-end");
  });

  it("does not treat the phrase body as a resize edge", () => {
    expect(
      getPhraseBoundaryHitOperation(
        new THREE.Vector2(300, 230),
        boundary(200),
        boundary(260),
        9,
      ),
    ).toBeNull();
  });
});

describe("phrase screen hit bounds", () => {
  const state: ChartViewState = {
    midi: null,
    selectedTrackIndex: null,
    selectedInstrument: "LEAD GUITAR",
    selectedDifficulty: Difficulty.Expert,
    snap: { enabled: true, denominator: 4 },
    isPlaying: false,
  };
  const camera = new THREE.PerspectiveCamera(45, 4 / 3, 0.1, 64);
  camera.position.set(0, 7, 7);
  camera.lookAt(0, 0, -20);
  camera.updateMatrixWorld();
  const coordinates = new HighwayCoordinateSystem(
    {
      getCanvas: () => ({}) as HTMLCanvasElement,
      getCameraTick: () => 3_000,
      getPpqn: () => 480,
      getState: () => state,
      getViewport: () => ({ width: 800, height: 600 }),
    },
    camera,
  );
  const hitTesting = new HighwayHitTester(coordinates);

  function phrase(start: number, end: number): MidiNotePhrase {
    return { start, end } as MidiNotePhrase;
  }

  it("ignores a phrase fully before the visible highway interval", () => {
    expect(hitTesting.getPhraseScreenBounds(phrase(1_000, 1_800))).toBeNull();
  });

  it("clips a partially visible phrase to the visible interval", () => {
    expect(hitTesting.getPhraseScreenBounds(phrase(2_800, 4_000))).toEqual(
      hitTesting.getPhraseScreenBounds(phrase(3_000, 4_000)),
    );
  });
});

describe("drum note hit testing", () => {
  it("hits cymbals on their pad lane and excludes marker pitches", () => {
    const cymbal = { note: 101, start: 480 } as MidiNote;
    const flam = { note: 104, start: 480 } as MidiNote;
    const coordinates = {
      getCanvasPoint: () => ({ x: 20, y: 20 }),
      getTickAtDepth: () => 0,
    } as unknown as HighwayCoordinateSystem;
    const hitTesting = new HighwayHitTester(coordinates);
    hitTesting.getGemScreenBounds = (_note, lane) =>
      lane === 1 ? { left: 0, right: 40, top: 0, bottom: 40 } : null;
    hitTesting.getTailScreenBounds = () => null;
    const chart = {
      getTrack: () => ({ getKey: () => "drums" }),
      getOffset: () => 96,
      getNotes: () => [cymbal, flam],
    } as unknown as ChartView;

    expect(hitTesting.getNoteAt(chart, {} as MouseEvent)).toBe(cymbal);
  });

  it("gives kick notes full-track hit bounds and ignores flam markers", () => {
    const kick = { note: 95, start: 480 } as MidiNote;
    const flam = { note: 104, start: 480 } as MidiNote;
    const coordinates = {
      getCanvasPoint: () => ({ x: 20, y: 100 }),
      getTickAtDepth: () => 0,
      getNoteZ: () => 0,
      getPhysicalLaneCount: () => 4,
      worldToScreen: (point: THREE.Vector3) =>
        new THREE.Vector2((point.x + 3) * 100, (point.y + 1) * 100),
    } as unknown as HighwayCoordinateSystem;
    const hitTesting = new HighwayHitTester(coordinates);
    const chart = {
      getTrack: () => ({ getKey: () => "drums" }),
      getOffset: () => 96,
      getNotes: () => [kick, flam],
    } as unknown as ChartView;

    const bounds = hitTesting.getKickScreenBounds(kick);
    expect(bounds).toMatchObject({ left: 0, right: 600 });
    expect(hitTesting.getNoteAt(chart, {} as MouseEvent)).toBe(kick);
  });
});
