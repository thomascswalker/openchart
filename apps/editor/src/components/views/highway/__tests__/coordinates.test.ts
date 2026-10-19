import { describe, expect, it } from "vitest";
import { Difficulty } from "@openchart/views";
import type { ChartView } from "@openchart/views";
import * as THREE from "three";
import type { ChartViewState } from "../../AbstractChartView";
import { HighwayCoordinateSystem } from "../coordinates";

describe("HighwayCoordinateSystem", () => {
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
  let cameraTick = 100;
  let scrollSpeedMultiplier = 1;
  let currentChart: ChartView | null = null;
  const coordinates = new HighwayCoordinateSystem(
    {
      getCanvas: () => null,
      getCameraTick: () => cameraTick,
      getScrollSpeedMultiplier: () => scrollSpeedMultiplier,
      getCurrentChart: () => currentChart,
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

  it("uses four centered physical lanes for drums", () => {
    state.selectedInstrument = "DRUMS";
    expect(coordinates.getPhysicalLaneCount()).toBe(4);
    expect([0, 1, 2, 3].map((lane) => coordinates.getLaneX(lane))).toEqual([
      -2.25, -0.75, 0.75, 2.25,
    ]);
    state.selectedInstrument = "LEAD GUITAR";
    expect(coordinates.getPhysicalLaneCount()).toBe(5);
  });

  it("uses the configured lane count for pad tracks", () => {
    currentChart = {
      getLaneCount: () => 4,
    } as ChartView;
    state.selectedInstrument = "FOUR PAD";
    expect(coordinates.getPhysicalLaneCount()).toBe(4);
    expect([0, 1, 2, 3].map((lane) => coordinates.getLaneX(lane))).toEqual([
      -2.25, -0.75, 0.75, 2.25,
    ]);

    currentChart = {
      getLaneCount: () => 5,
    } as ChartView;
    state.selectedInstrument = "FIVE PAD";
    expect(coordinates.getPhysicalLaneCount()).toBe(5);
    [0, 1, 2, 3, 4].forEach((lane, index) => {
      expect(coordinates.getLaneX(lane)).toBeCloseTo(
        [-2.4, -1.2, 0, 1.2, 2.4][index]!,
      );
    });
    currentChart = null;
    state.selectedInstrument = "LEAD GUITAR";
  });

  it("converts ticks to depth and back", () => {
    expect(coordinates.getNoteZ(1_220)).toBeCloseTo(-6.5);
    expect(coordinates.getTickAtDepth(-6.5)).toBeCloseTo(1_220);
    cameraTick = 250;
    expect(coordinates.getTickAtDepth(coordinates.getNoteZ(730))).toBeCloseTo(
      730,
    );
  });

  it("scales visual tick spacing while keeping coordinate conversions inverse", () => {
    cameraTick = 250;
    scrollSpeedMultiplier = 2;
    const noteZ = coordinates.getNoteZ(730);

    expect(noteZ).toBeCloseTo(-5.5);
    expect(coordinates.getTickAtDepth(noteZ)).toBeCloseTo(730);
    expect(
      coordinates.getCameraTickAtDepth(730, coordinates.getNoteZ(730)),
    ).toBeCloseTo(250);
    scrollSpeedMultiplier = 1;
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
