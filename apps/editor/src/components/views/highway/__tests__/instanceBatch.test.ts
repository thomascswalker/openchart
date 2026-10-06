import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { HIGHWAY_GEOMETRY_CATALOG } from "../geometryCatalog";
import { NoteInstanceBatch } from "../instanceBatch";

function primitive(): THREE.Mesh {
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const material = new THREE.ShaderMaterial();
  return new THREE.Mesh(geometry, material);
}

describe("NoteInstanceBatch", () => {
  it("shares instance buffers across model primitives", () => {
    const scene = new THREE.Scene();
    const template = new THREE.Group();
    template.add(primitive(), primitive());
    const tintedMaterial = new THREE.ShaderMaterial();
    const grayscaleMaterial = new THREE.ShaderMaterial();
    const batch = new NoteInstanceBatch(
      scene,
      template,
      ["tinted", "neutral"],
      {
        noteTinted: tintedMaterial,
        noteGrayscale: grayscaleMaterial,
      },
      4,
      HIGHWAY_GEOMETRY_CATALOG.note.transform,
      5,
    );

    expect(batch.meshes).toHaveLength(2);
    expect(batch.meshes[0].instanceMatrix).toBe(batch.meshes[1].instanceMatrix);
    expect(batch.meshes[0].geometry.getAttribute("aLaneColorSelected")).toBe(
      batch.meshes[1].geometry.getAttribute("aLaneColorSelected"),
    );
    expect(batch.meshes[0].material).toBeInstanceOf(THREE.ShaderMaterial);
    expect(batch.meshes[0].material).not.toBe(batch.meshes[1].material);
    expect(
      batch.meshes.every((mesh) => mesh.renderOrder === 5 && !mesh.frustumCulled),
    ).toBe(true);

    expect(
      batch.write([
        { x: 1, y: 0, z: -1, color: [1, 0, 0], selected: true },
        { x: 2, y: 0, z: -2, color: [0, 1, 0], selected: false },
      ]),
    ).toBe(2);
    expect(batch.meshes[0].count).toBe(2);
    expect(batch.meshes[1].count).toBe(2);
    expect(batch.meshes[0].instanceMatrix.array[12]).toBe(1);
    expect(batch.meshes[0].geometry.getAttribute("aLaneColorSelected").array).toEqual(
      expect.objectContaining({ 0: 1, 1: 0, 2: 0, 3: 1, 4: 0, 5: 1 }),
    );

    batch.dispose();
    tintedMaterial.dispose();
    grayscaleMaterial.dispose();
    template.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.geometry.dispose();
        object.material.dispose();
      }
    });
    expect(scene.children).toHaveLength(0);
  });
});
