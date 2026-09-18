import { Container3D, Mesh3D, type Material, type Model } from "pixi3d/pixi7";
import type { CircularMaterialSet, Rgb } from "./circularMaterials";
import { setCircularMaterialState } from "./circularMaterials";
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
  laneWidth = 0.25,
): { position: WorldPosition; scale: WorldPosition } {
  return {
    position: {
      x: laneX,
      y: HIGHWAY_GEOMETRY_CATALOG.sustain.transform.position.y,
      z: (startZ + endZ) / 2,
    },
    scale: {
      x: laneWidth,
      y: Math.abs(startZ - endZ) / 2,
      z: 1,
    },
  };
}

export function calibrationFromModel(model: Model): ModelCalibration {
  let bounds:
    | {
        min?: { x: number; y: number; z: number };
        max?: { x: number; y: number; z: number };
      }
    | undefined;

  // Pixi3D's Model.getBoundingBox() updates the transform hierarchy first.
  // An unparented model has no transform root in some Pixi3D/Pixi7 versions,
  // so querying it during asynchronous asset loading can throw. Calibration
  // is an enhancement; the known-good fallback must keep asset loading safe.
  try {
    bounds = model.getBoundingBox() as unknown as {
      min?: { x: number; y: number; z: number };
      max?: { x: number; y: number; z: number };
    };
  } catch {
    return DEFAULT_NOTE_CALIBRATION;
  }

  const values =
    bounds?.min && bounds.max
      ? [
          bounds.min.x,
          bounds.min.y,
          bounds.min.z,
          bounds.max.x,
          bounds.max.y,
          bounds.max.z,
        ]
      : [];
  if (!bounds?.min || !bounds.max || !values.every(Number.isFinite)) {
    return DEFAULT_NOTE_CALIBRATION;
  }
  const width = Math.max(0.001, bounds.max.x - bounds.min.x);
  const height = Math.max(0.001, bounds.max.y - bounds.min.y);
  const depth = Math.max(0.001, bounds.max.z - bounds.min.z);
  const scale = 1.0 / width;
  return {
    noteModelScale: { x: scale, y: scale, z: scale },
    noteModelRotation: {
      ...HIGHWAY_GEOMETRY_CATALOG.note.transform.rotationDegrees,
    },
    noteModelOffset: {
      x: -(bounds.min.x + bounds.max.x) * scale * 0.5,
      y: 0,
      z: -(bounds.min.z + bounds.max.z) * scale * 0.5,
    },
    width: width * scale,
    height: height * scale,
    depth: depth * scale,
  };
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
      // This is the authored highway lift, not a model-centering correction.
      y: calibration.noteModelOffset.y,
      z: calibration.noteModelOffset.z * multiplier.z,
    },
    width: calibration.width * multiplier.x,
    height: calibration.height * multiplier.y,
    depth: calibration.depth * multiplier.z,
  };
}

export function meshesInModel(model: Container3D): Mesh3D[] {
  const candidate = model as unknown as { meshes?: Mesh3D[] };
  if (candidate.meshes?.length) {
    return candidate.meshes;
  }
  return model.children.filter(
    (child): child is Mesh3D => child instanceof Mesh3D,
  );
}

export function applyMaterialToModel(
  model: Container3D,
  material: Material,
): Mesh3D[] {
  const meshes = meshesInModel(model);
  meshes.forEach((mesh) => {
    mesh.material = material;
  });
  return meshes;
}

export function applyModelCalibration(
  model: Container3D,
  calibration: ModelCalibration,
): void {
  model.scale.set(
    calibration.noteModelScale.x,
    calibration.noteModelScale.y,
    calibration.noteModelScale.z,
  );
  model.rotationQuaternion.setEulerAngles(
    calibration.noteModelRotation.x,
    calibration.noteModelRotation.y,
    calibration.noteModelRotation.z,
  );
}

export function setModelState(
  model: Container3D,
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
    // Note primitives are assigned their role-specific material when the
    // pooled instance is created. State updates only touch uniforms here.
    if (!mesh.material) {
      mesh.material = materialSet.noteColor;
    }
    const isNeutralPrimitive =
      mesh.material === materialSet.noteNeutral ||
      mesh.material === materialSet.noteGhostNeutral;
    setCircularMaterialState(mesh, {
      baseColor: color,
      emissionColor: isNeutralPrimitive ? ([1, 1, 1] as Rgb) : color,
      emissionIntensity: state.selected ? 1.7 : 1,
      alpha: state.alpha ?? 1,
      selected: state.selected ?? false,
      ghost: state.ghost ?? false,
      passed: state.passed ?? false,
      useStrikeLine: false,
      strikeLineZ: -3.5,
    });
  });
}
