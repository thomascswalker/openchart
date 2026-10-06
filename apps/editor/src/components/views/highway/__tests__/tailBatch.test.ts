import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { rgbFromHex } from "../materials";
import { SustainTailBatch } from "../tailBatch";

describe("SustainTailBatch", () => {
  it("writes transforms and lane/selection attributes to one instanced mesh", () => {
    const scene = new THREE.Scene();
    const material = new THREE.ShaderMaterial();
    const batch = new SustainTailBatch(scene, material, 4, 10, {
      alpha: 0.65,
      useStrikeLine: true,
      strikeLineZ: -3.5,
    });
    const count = batch.write([
      {
        x: 1,
        y: -0.04,
        z: -5,
        width: 0.32,
        halfLength: 2,
        color: rgbFromHex(0xff0000),
        selected: true,
      },
    ]);

    expect(count).toBe(1);
    expect(scene.children).toEqual([batch.mesh]);
    expect(batch.mesh.count).toBe(1);
    expect(batch.mesh.renderOrder).toBe(10);
    expect(batch.mesh.frustumCulled).toBe(false);
    expect(batch.mesh.geometry.getAttribute("aLaneColorSelected").array).toEqual(
      expect.objectContaining({ 0: 1, 1: 0, 2: 0, 3: 1 }),
    );
    expect(batch.mesh.instanceMatrix.array[12]).toBe(1);

    batch.write([]);
    expect(batch.mesh.count).toBe(0);
    expect(batch.mesh.visible).toBe(false);
    batch.dispose();
    expect(scene.children).toHaveLength(0);
    material.dispose();
  });
});