export interface Transform3D {
  position: { x: number; y: number; z: number };
  rotationDegrees: { x: number; y: number; z: number };
  scale: { x: number; y: number; z: number };
}

export type HighwayGeometryId =
  | "board"
  | "laneDivider"
  | "beatLine"
  | "strikeline"
  | "sustain"
  | "note"
  | "fretTop"
  | "fretBase"
  | "ghost";

export interface GeometryCatalogEntry {
  id: HighwayGeometryId;
  transform: Transform3D;
  layer: number;
  renderPass: "opaque" | "sustain" | "note" | "overlay";
}

// These offsets are intentionally small relative to the camera range. They
// establish a semantic order for geometry that shares the same highway plane.
export const HIGHWAY_DEPTH_LAYERS = {
  board: 0,
  markings: 0.002,
  sustain: 0.006,
  note: 0.012,
  overlay: 0.02,
} as const;

export const HIGHWAY_GEOMETRY_CATALOG: Record<
  HighwayGeometryId,
  GeometryCatalogEntry
> = {
  board: {
    id: "board",
    transform: {
      position: { x: 0, y: -0.25, z: 0 },
      rotationDegrees: { x: 0, y: 0, z: 0 },
      scale: { x: 3.25, y: 0.15, z: 1 },
    },
    layer: HIGHWAY_DEPTH_LAYERS.board,
    renderPass: "opaque",
  },
  laneDivider: {
    id: "laneDivider",
    transform: {
      position: { x: 0, y: -0.05, z: 0 },
      rotationDegrees: { x: 0, y: 0, z: 0 },
      scale: { x: 0.025, y: 0.04, z: 1 },
    },
    layer: HIGHWAY_DEPTH_LAYERS.markings,
    renderPass: "opaque",
  },
  beatLine: {
    id: "beatLine",
    transform: {
      position: { x: 0, y: -0.065, z: 0 },
      rotationDegrees: { x: 0, y: 0, z: 0 },
      scale: { x: 3, y: 0.008, z: 1 },
    },
    layer: HIGHWAY_DEPTH_LAYERS.markings,
    renderPass: "opaque",
  },
  strikeline: {
    id: "strikeline",
    transform: {
      position: { x: 0, y: -0.04, z: 0 },
      rotationDegrees: { x: 0, y: 0, z: 0 },
      scale: { x: 3, y: 0.015, z: 0.06 },
    },
    layer: HIGHWAY_DEPTH_LAYERS.markings,
    renderPass: "opaque",
  },
  sustain: {
    id: "sustain",
    transform: {
      position: { x: 0, y: -0.04, z: 0 },
      rotationDegrees: { x: 90, y: 0, z: 0 },
      scale: { x: 0.32, y: 1, z: 1 },
    },
    layer: HIGHWAY_DEPTH_LAYERS.sustain,
    renderPass: "sustain",
  },
  note: {
    id: "note",
    transform: {
      position: { x: 0, y: 0.05, z: 0 },
      rotationDegrees: { x: 270, y: 0, z: 0 },
      scale: { x: 0.45, y: 0.45, z: 0.45 },
    },
    layer: HIGHWAY_DEPTH_LAYERS.note,
    renderPass: "note",
  },
  ghost: {
    id: "ghost",
    transform: {
      position: { x: 0, y: 0.15, z: 0 },
      rotationDegrees: { x: 0, y: 0, z: 0 },
      scale: { x: 0.45, y: 0.45, z: 0.45 },
    },
    layer: HIGHWAY_DEPTH_LAYERS.overlay,
    renderPass: "overlay",
  },
  fretTop: {
    id: "fretTop",
    transform: {
      position: { x: 0, y: 0.1, z: 0 },
      rotationDegrees: { x: -90, y: 0, z: 0 },
      scale: { x: 0.5, y: 0.5, z: 0.1 },
    },
    layer: HIGHWAY_DEPTH_LAYERS.note,
    renderPass: "note",
  },
  fretBase: {
    id: "fretBase",
    transform: {
      position: { x: 0, y: 5, z: 0 },
      rotationDegrees: { x: 90, y: 0, z: 0 },
      scale: { x: 0.5, y: 0.5, z: 0.5 },
    },
    layer: HIGHWAY_DEPTH_LAYERS.note,
    renderPass: "note",
  },
};

export function geometryTransform(id: HighwayGeometryId): Transform3D {
  const source = HIGHWAY_GEOMETRY_CATALOG[id].transform;
  return {
    position: { ...source.position },
    rotationDegrees: { ...source.rotationDegrees },
    scale: { ...source.scale },
  };
}
