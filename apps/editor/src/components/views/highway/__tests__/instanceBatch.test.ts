import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
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
      batch.meshes.every(
        (mesh) => mesh.renderOrder === 5 && !mesh.frustumCulled,
      ),
    ).toBe(true);

    expect(
      batch.write([
        { x: 1, y: 0, z: -1, color: [1, 0, 0], selected: true, tick: 10 },
        { x: 2, y: 0, z: -2, color: [0, 1, 0], selected: false, tick: 20 },
      ]),
    ).toBe(2);
    expect(batch.meshes[0].count).toBe(2);
    expect(batch.meshes[1].count).toBe(2);
    expect(batch.meshes[0].instanceMatrix.array[12]).toBe(1);
    expect(
      batch.meshes[0].geometry.getAttribute("aLaneColorSelected").array,
    ).toEqual(expect.objectContaining({ 0: 1, 1: 0, 2: 0, 3: 1, 4: 0, 5: 1 }));
    const matrixVersion = batch.meshes[0].instanceMatrix.version;
    const colorVersion = (
      batch.meshes[0].geometry.getAttribute(
        "aLaneColorSelected",
      ) as THREE.BufferAttribute
    ).version;
    batch.write([
      { x: 1, y: 0, z: -1, color: [1, 0, 0], selected: true, tick: 10 },
      { x: 2, y: 0, z: -2, color: [0, 1, 0], selected: false, tick: 20 },
    ]);
    expect(batch.meshes[0].instanceMatrix.version).toBe(matrixVersion);
    expect(
      (
        batch.meshes[0].geometry.getAttribute(
          "aLaneColorSelected",
        ) as THREE.BufferAttribute
      ).version,
    ).toBe(colorVersion);

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

  it("grows in powers of two and shrinks after sustained low usage", () => {
    const scene = new THREE.Scene();
    const template = new THREE.Group();
    template.add(primitive());
    const batch = new NoteInstanceBatch(
      scene,
      template,
      ["tinted"],
      {
        noteTinted: new THREE.ShaderMaterial(),
        noteGrayscale: new THREE.ShaderMaterial(),
      },
      4,
      HIGHWAY_GEOMETRY_CATALOG.note.transform,
      5,
    );
    let now = 0;
    vi.spyOn(performance, "now").mockImplementation(() => now);

    batch.write(
      Array.from({ length: 5 }, (_, index) => ({
        x: index,
        y: 0,
        z: 0,
        color: [1, 1, 1] as [number, number, number],
        selected: false,
        tick: index,
      })),
    );
    expect(batch.capacity).toBe(8);
    batch.write([]);
    now = 5_001;
    batch.write([]);
    expect(batch.capacity).toBe(4);

    vi.restoreAllMocks();
    batch.dispose();
  });

  it("shares baked geometry data between batches with independent shells", () => {
    const scene = new THREE.Scene();
    const template = new THREE.Group();
    template.add(primitive());
    const createBatch = () =>
      new NoteInstanceBatch(
        scene,
        template,
        ["tinted"],
        {
          noteTinted: new THREE.ShaderMaterial(),
          noteGrayscale: new THREE.ShaderMaterial(),
        },
        4,
        HIGHWAY_GEOMETRY_CATALOG.note.transform,
        5,
      );
    const first = createBatch();
    const second = createBatch();
    const sharedPosition = first.meshes[0].geometry.getAttribute("position");

    expect(second.meshes[0].geometry).not.toBe(first.meshes[0].geometry);
    expect(second.meshes[0].geometry.getAttribute("position")).toBe(
      sharedPosition,
    );

    first.dispose();
    expect(second.meshes[0].geometry.getAttribute("position")).toBe(
      sharedPosition,
    );
    second.dispose();
    template.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.geometry.dispose();
        object.material.dispose();
      }
    });
  });

  it("keeps nearest notes and reports overflow at the hard ceiling", () => {
    const scene = new THREE.Scene();
    const template = new THREE.Group();
    template.add(primitive());
    const batch = new NoteInstanceBatch(
      scene,
      template,
      ["tinted"],
      {
        noteTinted: new THREE.ShaderMaterial(),
        noteGrayscale: new THREE.ShaderMaterial(),
      },
      16_384,
      HIGHWAY_GEOMETRY_CATALOG.note.transform,
      5,
    );
    const notes = Array.from({ length: 16_385 }, (_, index) => ({
      x: index,
      y: 0,
      z: 0,
      color: [1, 1, 1] as [number, number, number],
      selected: false,
      priority: Math.abs(index - 100),
      tick: index,
    }));

    expect(batch.write(notes)).toBe(16_384);
    expect(batch.capacity).toBe(16_384);
    expect(batch.droppedNotes).toBe(1);
    expect(batch.meshes[0].instanceMatrix.array[12]).toBe(100);
    batch.dispose();
  });
});
