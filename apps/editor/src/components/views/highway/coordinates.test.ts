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
  let playheadTick = 100;
  const coordinates = new HighwayCoordinateSystem(
    {
      getCanvas: () => null,
      getPlayheadTick: () => playheadTick,
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
    expect(coordinates.getNoteZ(580)).toBeCloseTo(-6.5);
    expect(coordinates.getTickAtDepth(-6.5)).toBeCloseTo(580);
    playheadTick = 250;
    expect(coordinates.getTickAtDepth(coordinates.getNoteZ(730))).toBeCloseTo(
      730,
    );
  });

  it("snaps down to the configured grid and clamps negative ticks", () => {
    expect(coordinates.getSnapTicks()).toBe(480);
    expect(coordinates.snapTick(500)).toBe(480);
    expect(coordinates.snapTick(-30)).toBe(0);
    state.snap.enabled = false;
    expect(coordinates.snapTick(500.6)).toBe(501);
  });
});
