import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { Difficulty, type MidiNotePhrase } from "@midiedit/views";
import type { ChartViewState } from "../AbstractChartView";
import { HighwayCoordinateSystem } from "./coordinates";
import { DEFAULT_NOTE_CALIBRATION } from "./geometry";
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
  const hitTesting = new HighwayHitTester(
    coordinates,
    () => DEFAULT_NOTE_CALIBRATION,
  );

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
