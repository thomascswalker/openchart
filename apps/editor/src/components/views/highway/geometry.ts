import * as THREE from "three";
import type { Rgb, MaterialSet } from "./materials";
import { setMaterialStateForMaterial } from "./materials";
import { HIGHWAY_GEOMETRY_CATALOG, type Transform3D } from "./geometryCatalog";

export interface WorldPosition {
  x: number;
  y: number;
  z: number;
}

export function noteWorldPosition(
  laneX: number,
  noteZ: number,
  transform: Transform3D = HIGHWAY_GEOMETRY_CATALOG.note.transform,
): WorldPosition {
  return {
    x: laneX + transform.position.x,
    y: transform.position.y,
    z: noteZ + transform.position.z,
  };
}

export function sustainWorldTransform(
  laneX: number,
  startZ: number,
  endZ: number,
  laneWidth = HIGHWAY_GEOMETRY_CATALOG.sustain.transform.scale.x,
): { position: WorldPosition; scale: WorldPosition } {
  return {
    position: {
      x: laneX,
      y: HIGHWAY_GEOMETRY_CATALOG.sustain.transform.position.y,
      z: (startZ + endZ) / 2,
    },
    scale: { x: laneWidth, y: Math.abs(startZ - endZ) / 2, z: 1 },
  };
}

export function meshesInModel(model: THREE.Object3D): THREE.Mesh[] {
  const meshes: THREE.Mesh[] = [];
  model.traverse((child) => {
    if (child instanceof THREE.Mesh) meshes.push(child);
  });
  return meshes;
}

export function applyMaterialToModel(
  model: THREE.Object3D,
  material: THREE.Material,
): THREE.Mesh[] {
  const meshes = meshesInModel(model);
  meshes.forEach((mesh) => {
    mesh.material = material;
  });
  return meshes;
}

export function applyGeometryModelTransform(
  model: THREE.Object3D,
  transform: Transform3D,
): void {
  model.scale.set(transform.scale.x, transform.scale.y, transform.scale.z);
  model.rotation.set(
    THREE.MathUtils.degToRad(transform.rotationDegrees.x),
    THREE.MathUtils.degToRad(transform.rotationDegrees.y),
    THREE.MathUtils.degToRad(transform.rotationDegrees.z),
  );
}

export function setModelState(
  model: THREE.Object3D,
  materialSet: MaterialSet,
  color: Rgb,
  state: {
    selected?: boolean;
    ghost?: boolean;
    alpha?: number;
    passed?: boolean;
  },
): void {
  meshesInModel(model).forEach((mesh) => {
    const materials = Array.isArray(mesh.material)
      ? mesh.material
      : mesh.material
        ? [mesh.material]
        : [materialSet.noteTinted];
    materials.forEach((material) => {
      const shaderMaterial = material as THREE.ShaderMaterial;
      const isNeutralPrimitive =
        shaderMaterial.uniforms?.uTintEnabled?.value === 0;
      setMaterialStateForMaterial(material, {
        baseColor: color,
        emissionColor: color,
        emissionIntensity: state.selected ? 1 : 1,
        alpha: state.alpha ?? 1,
        selected: state.selected ?? false,
        ghost: state.ghost ?? false,
        passed: state.passed ?? false,
        tint: !isNeutralPrimitive,
        useStrikeLine: false,
        strikeLineZ: -3.5,
      });
    });
  });
}
