import { describe, expect, it } from "vitest";
import { Difficulty } from "@midiedit/views";
import * as THREE from "three";
import type { ChartViewState } from "../AbstractChartView";
import { HighwayCoordinateSystem } from "./coordinates";

describe("HighwayCoordinateSystem", () => {
  const state: ChartViewState = {
    midi: null,
    selectedTrackIndex: null,
    selectedInstrument: "LEAD GUITAR",
    selectedDifficulty: Difficulty.Expert,
    snap: { enabled: true, denominator: 4 },
    isPlaying: false,
  };
  let cameraTick = 100;
  const coordinates = new HighwayCoordinateSystem(
    {
      getCanvas: () => null,
      getCameraTick: () => cameraTick,
      getPpqn: () => 480,
      getState: () => state,
      getViewport: () => ({ width: 800, height: 600 }),
    },
    new THREE.PerspectiveCamera(45, 4 / 3, 0.1, 64),
  );

  it("maps lane indices across the highway", () => {
    expect(coordinates.getLaneX(0)).toBeCloseTo(-2.4);
    expect(coordinates.getLaneX(4)).toBeCloseTo(2.4);
  });

  it("converts ticks to depth and back", () => {
    expect(coordinates.getNoteZ(1_220)).toBeCloseTo(-6.5);
    expect(coordinates.getTickAtDepth(-6.5)).toBeCloseTo(1_220);
    cameraTick = 250;
    expect(coordinates.getTickAtDepth(coordinates.getNoteZ(730))).toBeCloseTo(
      730,
    );
  });

  it("keeps the playhead at the strike line, including before tick zero", () => {
    const strikeTick = 0;
    const strikeLineZ = -3.5;
    const nextCameraTick = coordinates.getCameraTickAtDepth(
      strikeTick,
      strikeLineZ,
    );

    expect(nextCameraTick).toBeCloseTo(-640);
    cameraTick = nextCameraTick;
    expect(coordinates.getTickAtDepth(strikeLineZ)).toBeCloseTo(strikeTick);
  });

  it("snaps down to the configured grid and clamps negative ticks", () => {
    expect(coordinates.getSnapTicks()).toBe(480);
    expect(coordinates.snapTick(500)).toBe(480);
    expect(coordinates.snapTick(-30)).toBe(0);
    state.snap.enabled = false;
    expect(coordinates.snapTick(500.6)).toBe(501);
  });
});
