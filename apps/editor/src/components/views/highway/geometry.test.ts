import * as THREE from "three";
import { describe, expect, it } from "vitest";
import {
  applyGeometryModelTransform,
  noteWorldPosition,
  sustainWorldTransform,
} from "./geometry";
import {
  HIGHWAY_GEOMETRY_CATALOG,
  HIGHWAY_RENDER_ORDER,
} from "./geometryCatalog";

describe("circular highway geometry", () => {
  it("keeps note timing on the existing lane/depth mapping", () => {
    expect(noteWorldPosition(-1.2, -3.5)).toEqual({
      x: -1.2,
      y: 0,
      z: -3.5,
    });
  });

  it("stretches sustain geometry between note start and end", () => {
    expect(sustainWorldTransform(0, -3.5, -12)).toEqual({
      position: { x: 0, y: -0.04, z: -7.75 },
      scale: { x: 0.32, y: 4.25, z: 1 },
    });
  });

  it("applies the catalog transform directly to note models", () => {
    const model = new THREE.Group();
    const transform = HIGHWAY_GEOMETRY_CATALOG.pad.transform;

    applyGeometryModelTransform(model, transform);

    expect(model.scale.toArray()).toEqual([1, 1, 1]);
    expect(model.rotation.x).toBe(0);
    expect(model.position.toArray()).toEqual([0, 0, 0]);
    expect(
      noteWorldPosition(
        1,
        -2,
        transform,
        HIGHWAY_GEOMETRY_CATALOG.pad.placementOffset,
      ),
    ).toEqual({ x: 1, y: 0, z: -2 });
  });

  it("keeps normalized note and fret model transforms at identity", () => {
    for (const id of ["note", "kick", "cymbal", "pad", "fret"] as const) {
      expect(HIGHWAY_GEOMETRY_CATALOG[id].transform).toEqual({
        position: { x: 0, y: 0, z: 0 },
        rotationDegrees: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
      });
    }
  });

  it("places pads and cymbals in the render pass after kicks", () => {
    expect(HIGHWAY_RENDER_ORDER[HIGHWAY_GEOMETRY_CATALOG.kick.renderPass]).toBe(
      20,
    );
    for (const id of ["pad", "cymbal"] as const) {
      expect(
        HIGHWAY_RENDER_ORDER[HIGHWAY_GEOMETRY_CATALOG[id].renderPass],
      ).toBeGreaterThan(
        HIGHWAY_RENDER_ORDER[HIGHWAY_GEOMETRY_CATALOG.kick.renderPass],
      );
    }
  });
});
