import * as THREE from "three";
import {
  HIGHWAY_GEOMETRY_CATALOG,
  type IVector3,
  type ITransform,
} from "./geometryCatalog";

export interface WorldPosition {
  x: number;
  y: number;
  z: number;
}

export function noteWorldPosition(
  laneX: number,
  noteZ: number,
  transform: ITransform = HIGHWAY_GEOMETRY_CATALOG.note.transform,
  placementOffset: IVector3 = HIGHWAY_GEOMETRY_CATALOG.note.placementOffset ?? {
    x: 0,
    y: 0,
    z: 0,
  },
): WorldPosition {
  return {
    x: laneX + transform.position.x + placementOffset.x,
    y: transform.position.y + placementOffset.y,
    z: noteZ + transform.position.z + placementOffset.z,
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

export function applyGeometryModelTransform(
  model: THREE.Object3D,
  transform: ITransform,
): void {
  model.scale.set(transform.scale.x, transform.scale.y, transform.scale.z);
  model.rotation.set(
    THREE.MathUtils.degToRad(transform.rotation.x),
    THREE.MathUtils.degToRad(transform.rotation.y),
    THREE.MathUtils.degToRad(transform.rotation.z),
  );
}
