import { describe, expect, it } from "vitest";
import type { MidiNote } from "@openchart/midi";
import { Vector2 } from "three";
import * as THREE from "three";
import { Difficulty, type MidiNotePhrase } from "@openchart/views";
import { getHighwayNoteIndex, type IndexedNote } from "../noteIndex";
import type { ChartViewState } from "../../AbstractChartView";
import { HighwayCoordinateSystem } from "../coordinates";
import { nearBoardZ } from "../constants";
import {
  HighwayHitTester,
  getPhraseBoundaryHitOperation,
  type PhraseBoundaryProjection,
} from "../hitTesting";
import { createHighwayTestSetup } from "./testUtils";

function boundary(y: number): PhraseBoundaryProjection {
  return {
    worldStart: new THREE.Vector3(-3, -0.035, 0),
    worldEnd: new THREE.Vector3(3, -0.035, 0),
    screenStart: new Vector2(100, y),
    screenEnd: new Vector2(500, y),
  };
}

describe("phrase boundary hit testing", () => {
  it("identifies the start or end edge inside the pixel threshold", () => {
    const start = boundary(200);
    const end = boundary(260);

    expect(
      getPhraseBoundaryHitOperation(new Vector2(300, 205), start, end, 9),
    ).toBe("resize-start");
    expect(
      getPhraseBoundaryHitOperation(new Vector2(300, 256), start, end, 9),
    ).toBe("resize-end");
  });

  it("does not treat the phrase body as a resize edge", () => {
    expect(
      getPhraseBoundaryHitOperation(
        new Vector2(300, 230),
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
    selectedTrackKey: null,
    selectedTrackIndex: null,
    selectedInstrument: "LEAD GUITAR",
    selectedDifficulty: Difficulty.Expert,
    snap: { enabled: true, denominator: 4 },
    lockCursor: false,
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
  const hitTesting = new HighwayHitTester(coordinates, {
    getEditingSession: () => undefined,
    getPreviewState: () => null,
  });

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
  it("uses the same contextual pad and cymbal offsets as rendering", () => {
    const coordinates = {
      getLaneX: () => 0,
      getNoteZ: () => 0,
      getPhysicalLaneCount: () => 4,
      worldToScreen: (point: THREE.Vector3) =>
        new Vector2(point.x * 100, point.y * 100),
    } as unknown as HighwayCoordinateSystem;
    const hitTesting = new HighwayHitTester(coordinates, {
      getEditingSession: () => undefined,
      getPreviewState: () => null,
    });
    const note = { pitch: 100, start: 480 } as MidiNote;
    const pad = hitTesting.getGemScreenBounds(note, 1, "pad")!;
    const cymbal = hitTesting.getGemScreenBounds(note, 1, "cymbal")!;

    expect((pad.left + pad.right) / 2).toBeCloseTo(0);
    expect((cymbal.left + cymbal.right) / 2).toBeCloseTo(0);
  });

  it("hits cymbals on their pad lane and excludes marker pitches", () => {
    const setup = createHighwayTestSetup("drums");
    setup.midiTrack.insertNote({
      pitch: 101,
      tick: 480,
      duration: 1,
      velocity: 90,
    });
    setup.midiTrack.insertNote({
      pitch: 104,
      tick: 480,
      duration: 1,
      velocity: 90,
    });
    const cymbal = setup.chart.getNotes()[0]!;
    const coordinates = {
      getCanvasPoint: () => new Vector2(20, 20),
      getTickAtDepth: (depth: number) => (depth === nearBoardZ ? 0 : 1_000),
    } as unknown as HighwayCoordinateSystem;
    const hitTesting = new HighwayHitTester(coordinates, setup.context);
    hitTesting.getGemScreenBounds = (_note, lane) =>
      lane === 1 ? { left: 0, right: 40, top: 0, bottom: 40 } : null;
    hitTesting.getTailScreenBounds = () => null;

    const candidates: IndexedNote[] = [];
    getHighwayNoteIndex(setup.chart).query(
      setup.chart,
      setup.session,
      null,
      0,
      1_000,
      candidates,
    );
    expect(candidates.map(({ source }) => source)).toContain(cymbal);
    expect(hitTesting.getNoteAt(setup.chart, {} as MouseEvent)?.source).toBe(
      cymbal,
    );
  });

  it("uses normalized kick bounds and ignores flam markers", () => {
    const setup = createHighwayTestSetup("drums");
    setup.midiTrack.insertNote({
      pitch: 95,
      tick: 480,
      duration: 1,
      velocity: 90,
    });
    setup.midiTrack.insertNote({
      pitch: 104,
      tick: 480,
      duration: 1,
      velocity: 90,
    });
    const kick = setup.chart.getNotes()[0]!;
    const coordinates = {
      getCanvasPoint: () => new Vector2(300, 100),
      getTickAtDepth: (depth: number) => (depth === nearBoardZ ? 0 : 1_000),
      getNoteZ: () => 0,
      getLaneX: () => 0,
      getPhysicalLaneCount: () => 4,
      worldToScreen: (point: THREE.Vector3) =>
        new Vector2((point.x + 3) * 100, (point.y + 1) * 100),
    } as unknown as HighwayCoordinateSystem;
    const hitTesting = new HighwayHitTester(coordinates, setup.context);

    const candidates: IndexedNote[] = [];
    getHighwayNoteIndex(setup.chart).query(
      setup.chart,
      setup.session,
      null,
      0,
      1_000,
      candidates,
    );
    const kickEntry = candidates.find(({ source }) => source === kick)!;
    const bounds = hitTesting.getBarScreenBounds(kickEntry);
    expect(bounds).toMatchObject({ left: 250, right: 350 });
    expect(hitTesting.getNoteAt(setup.chart, {} as MouseEvent)?.source).toBe(
      kick,
    );
  });
});
