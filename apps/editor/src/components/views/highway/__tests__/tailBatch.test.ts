import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { rgbFromHex } from "../rendering/materials";
import { SustainTailBatch } from "../rendering/tailBatch";

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
        startTick: 480,
        endTick: 720,
      },
    ]);

    expect(count).toBe(1);
    expect(scene.children).toEqual([batch.mesh]);
    expect(batch.mesh.count).toBe(1);
    expect(batch.mesh.renderOrder).toBe(10);
    expect(batch.mesh.frustumCulled).toBe(false);
    expect(
      batch.mesh.geometry.getAttribute("aLaneColorSelected").array,
    ).toEqual(expect.objectContaining({ 0: 1, 1: 0, 2: 0, 3: 1 }));
    expect(batch.mesh.instanceMatrix.array[12]).toBe(1);
    const matrixVersion = batch.mesh.instanceMatrix.version;
    const colorVersion = (
      batch.mesh.geometry.getAttribute(
        "aLaneColorSelected",
      ) as THREE.BufferAttribute
    ).version;
    batch.write([
      {
        x: 1,
        y: -0.04,
        z: -5,
        width: 0.32,
        halfLength: 2,
        color: rgbFromHex(0xff0000),
        selected: true,
        startTick: 480,
        endTick: 720,
      },
    ]);
    expect(batch.mesh.instanceMatrix.version).toBe(matrixVersion);
    expect(
      (
        batch.mesh.geometry.getAttribute(
          "aLaneColorSelected",
        ) as THREE.BufferAttribute
      ).version,
    ).toBe(colorVersion);

    batch.write([]);
    expect(batch.mesh.count).toBe(0);
    expect(batch.mesh.visible).toBe(false);
    batch.dispose();
    expect(scene.children).toHaveLength(0);
    material.dispose();
  });

  it("grows without dropping visible sustain tails", () => {
    const scene = new THREE.Scene();
    const material = new THREE.ShaderMaterial();
    const batch = new SustainTailBatch(scene, material, 2, 10, {});
    const tail = {
      x: 0,
      y: 0,
      z: 0,
      width: 0.32,
      halfLength: 1,
      color: rgbFromHex(0x00ff00),
      selected: false,
      startTick: 0,
      endTick: 240,
    };

    expect(batch.write([tail, tail, tail])).toBe(3);
    expect(batch.capacity).toBe(4);
    expect(batch.droppedNotes).toBe(0);

    batch.dispose();
    material.dispose();
  });

  it("writes every supplied sustain tail", () => {
    const scene = new THREE.Scene();
    const material = new THREE.ShaderMaterial();
    const batch = new SustainTailBatch(scene, material, 4, 10, {});
    const tail = {
      x: 0,
      y: 0,
      z: 0,
      width: 0.32,
      halfLength: 1,
      color: rgbFromHex(0x00ff00),
      selected: false,
      startTick: 0,
      endTick: 240,
    };

    expect(
      batch.write([{ ...tail, endTick: 239 }, tail, { ...tail, endTick: 241 }]),
    ).toBe(3);
    expect(batch.mesh.count).toBe(3);

    batch.dispose();
    material.dispose();
  });
});
