import * as THREE from "three";
import type { Rgb, CircularMaterialSet } from "./circularMaterials";
import { setCircularMaterialStateForMaterial } from "./circularMaterials";
import { HIGHWAY_GEOMETRY_CATALOG } from "./highwayGeometryCatalog";

export interface ModelCalibration {
  noteModelScale: { x: number; y: number; z: number };
  noteModelRotation: { x: number; y: number; z: number };
  noteModelOffset: { x: number; y: number; z: number };
  width: number;
  height: number;
  depth: number;
}

export interface NoteScaleMultiplier {
  x: number;
  y: number;
  z: number;
}

export interface WorldPosition {
  x: number;
  y: number;
  z: number;
}

export const DEFAULT_NOTE_CALIBRATION: ModelCalibration = {
  noteModelScale: { ...HIGHWAY_GEOMETRY_CATALOG.note.transform.scale },
  noteModelRotation: {
    ...HIGHWAY_GEOMETRY_CATALOG.note.transform.rotationDegrees,
  },
  noteModelOffset: { ...HIGHWAY_GEOMETRY_CATALOG.note.transform.position },
  width: 0.9,
  height: 0.9,
  depth: 0.21,
};

export const DEFAULT_NOTE_SCALE_MULTIPLIER: NoteScaleMultiplier = {
  x: 1,
  y: 1,
  z: 1,
};

export function noteWorldPosition(
  laneX: number,
  noteZ: number,
  calibration = DEFAULT_NOTE_CALIBRATION,
): WorldPosition {
  return {
    x: laneX + calibration.noteModelOffset.x,
    y: 0.05 + calibration.noteModelOffset.y,
    z: noteZ + calibration.noteModelOffset.z,
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

export function calibrationFromModel(model: THREE.Object3D): ModelCalibration {
  try {
    model.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(model);
    if (box.isEmpty()) return DEFAULT_NOTE_CALIBRATION;
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const values = [...size.toArray(), ...center.toArray()];
    if (!values.every(Number.isFinite)) return DEFAULT_NOTE_CALIBRATION;
    const width = Math.max(0.001, size.x);
    const height = Math.max(0.001, size.y);
    const depth = Math.max(0.001, size.z);
    const scale = 1 / width;
    return {
      noteModelScale: { x: scale, y: scale, z: scale },
      noteModelRotation: {
        ...HIGHWAY_GEOMETRY_CATALOG.note.transform.rotationDegrees,
      },
      noteModelOffset: {
        x: -center.x * scale,
        y: 0,
        z: -center.z * scale,
      },
      width: width * scale,
      height: height * scale,
      depth: depth * scale,
    };
  } catch {
    return DEFAULT_NOTE_CALIBRATION;
  }
}

export function scaleNoteCalibration(
  calibration: ModelCalibration,
  multiplier: NoteScaleMultiplier,
): ModelCalibration {
  return {
    ...calibration,
    noteModelScale: {
      x: calibration.noteModelScale.x * multiplier.x,
      y: calibration.noteModelScale.y * multiplier.y,
      z: calibration.noteModelScale.z * multiplier.z,
    },
    noteModelOffset: {
      x: calibration.noteModelOffset.x * multiplier.x,
      y: calibration.noteModelOffset.y,
      z: calibration.noteModelOffset.z * multiplier.z,
    },
    width: calibration.width * multiplier.x,
    height: calibration.height * multiplier.y,
    depth: calibration.depth * multiplier.z,
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

export function applyModelCalibration(
  model: THREE.Object3D,
  calibration: ModelCalibration,
): void {
  model.scale.set(
    calibration.noteModelScale.x,
    calibration.noteModelScale.y,
    calibration.noteModelScale.z,
  );
  model.rotation.set(
    THREE.MathUtils.degToRad(calibration.noteModelRotation.x),
    THREE.MathUtils.degToRad(calibration.noteModelRotation.y),
    THREE.MathUtils.degToRad(calibration.noteModelRotation.z),
  );
}

export function setModelState(
  model: THREE.Object3D,
  materialSet: CircularMaterialSet,
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
        : [materialSet.noteColor];
    materials.forEach((material) => {
      const shaderMaterial = material as THREE.ShaderMaterial;
      const isNeutralPrimitive =
        shaderMaterial.uniforms?.uTintEnabled?.value === 0;
      setCircularMaterialStateForMaterial(material, {
        baseColor: color,
        emissionColor: isNeutralPrimitive ? [1, 1, 1] : color,
        emissionIntensity: state.selected ? 1.7 : 1,
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
