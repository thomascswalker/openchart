import type { Model } from "pixi3d/pixi7";
import { describe, expect, it } from "vitest";
import {
  calibrationFromModel,
  DEFAULT_NOTE_CALIBRATION,
  scaleNoteCalibration,
  noteWorldPosition,
  sustainWorldTransform,
} from "./highwayGeometry";

describe("circular highway geometry", () => {
  it("keeps note timing on the existing lane/depth mapping", () => {
    expect(noteWorldPosition(-1.2, -3.5)).toEqual({
      x: -1.2,
      y: 0.2,
      z: -3.5,
    });
  });

  it("stretches sustain geometry between note start and end", () => {
    expect(sustainWorldTransform(0, -3.5, -12)).toEqual({
      position: { x: 0, y: -0.04, z: -7.75 },
      scale: { x: 0.32, y: 4.25, z: 1 },
    });
  });

  it("keeps a calibrated note width suitable for the strike-line fret", () => {
    expect(DEFAULT_NOTE_CALIBRATION.width).toBeGreaterThan(0);
    expect(DEFAULT_NOTE_CALIBRATION.noteModelRotation.x).toBe(0);
    expect(DEFAULT_NOTE_CALIBRATION.height).toBeGreaterThan(
      DEFAULT_NOTE_CALIBRATION.depth,
    );
  });

  it("applies debug scale multipliers to model size and hit-test dimensions", () => {
    const scaled = scaleNoteCalibration(DEFAULT_NOTE_CALIBRATION, {
      x: 1.5,
      y: 2,
      z: 0.5,
    });

    expect(scaled.noteModelScale).toEqual({ x: 0.675, y: 0.9, z: 0.225 });
    expect(scaled.noteModelOffset).toEqual({ x: 0, y: 0.15, z: 0 });
    expect(scaled.width).toBe(1.35);
    expect(scaled.height).toBe(1.8);
    expect(scaled.depth).toBe(0.105);
  });

  it("falls back when imported model bounds are unavailable", () => {
    const model = {
      getBoundingBox: () => {
        throw new TypeError("missing transform root");
      },
    } as unknown as Model;

    expect(calibrationFromModel(model)).toEqual(DEFAULT_NOTE_CALIBRATION);
  });

  it("calibrates the generated note as a player-facing XY model", () => {
    const model = {
      getBoundingBox: () => ({
        min: { x: -1, y: -1, z: -0.1 },
        max: { x: 1, y: 1, z: 0.3 },
      }),
    } as unknown as Model;

    const calibration = calibrationFromModel(model);

    expect(calibration.noteModelRotation).toEqual({ x: 0, y: 0, z: 0 });
    expect(calibration.width).toBeCloseTo(0.9);
    expect(calibration.height).toBeCloseTo(0.9);
    expect(calibration.depth).toBeCloseTo(0.18);
    expect(calibration.noteModelOffset.z).toBeCloseTo(-0.045);
  });
});
