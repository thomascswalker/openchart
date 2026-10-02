import type { MaterialKey, MeshKey } from "../../../rendering/registry";
import type { DrumPlacementKind } from "./drumProfile";

export interface Transform3D {
  position: { x: number; y: number; z: number };
  rotationDegrees: { x: number; y: number; z: number };
  scale: { x: number; y: number; z: number };
}

export interface PlacementOffset {
  x: number;
  y: number;
  z: number;
}

export type GeometryId =
  | "board"
  | "laneDivider"
  | "beatLine"
  | "strikeline"
  | "sustain"
  | "note"
  | "kick"
  | "cymbal"
  | "pad"
  | "kickGhost"
  | "cymbalGhost"
  | "padGhost"
  | "fret"
  | "ghost";

export type DrumGhostGeometryId = "kickGhost" | "cymbalGhost" | "padGhost";
export type GeometryRenderPass =
  "opaque" | "sustain" | "note" | "topNote" | "overlay";

export const DRUM_GHOST_GEOMETRY_IDS: Record<
  DrumPlacementKind,
  DrumGhostGeometryId
> = {
  kick: "kickGhost",
  cymbal: "cymbalGhost",
  pad: "padGhost",
};

export interface GeometryEntry {
  id: GeometryId;
  transform: Transform3D;
  placementOffset?: PlacementOffset;
  fallbackHalfExtents?: PlacementOffset;
  meshKey?: MeshKey;
  materialKey?: MaterialKey;
  layer: number;
  renderPass: GeometryRenderPass;
}

export const HIGHWAY_DEPTH_LAYERS = {
  board: 0,
  markings: 0.002,
  sustain: 0.006,
  note: 0.012,
  overlay: 0.02,
} as const;

export const HIGHWAY_RENDER_ORDER: Record<GeometryRenderPass, number> = {
  opaque: 0,
  sustain: 10,
  note: 20,
  topNote: 21,
  overlay: 30,
};

const identityModelTransform: Transform3D = {
  position: { x: 0, y: 0, z: 0 },
  rotationDegrees: { x: 0, y: 0, z: 0 },
  scale: { x: 1, y: 1, z: 1 },
};

export const HIGHWAY_GEOMETRY_CATALOG: Record<GeometryId, GeometryEntry> = {
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
  fret: {
    id: "fret",
    transform: identityModelTransform,
    placementOffset: { x: 0, y: 0, z: 0 },
    meshKey: "fret",
    materialKey: "fret",
    layer: HIGHWAY_DEPTH_LAYERS.note,
    renderPass: "note",
  },
  note: {
    id: "note",
    transform: identityModelTransform,
    placementOffset: { x: 0, y: 0, z: 0 },
    meshKey: "roundNote",
    materialKey: "roundNote",
    layer: HIGHWAY_DEPTH_LAYERS.note,
    renderPass: "note",
  },
  ghost: {
    id: "ghost",
    transform: identityModelTransform,
    placementOffset: { x: 0, y: 0, z: 0 },
    meshKey: "roundNote",
    materialKey: "roundNote",
    layer: HIGHWAY_DEPTH_LAYERS.overlay,
    renderPass: "overlay",
  },
  sustain: {
    id: "sustain",
    transform: {
      position: { x: 0, y: -0.04, z: 0 },
      rotationDegrees: { x: 90, y: 0, z: 0 },
      scale: { x: 0.32, y: 1, z: 1 },
    },
    materialKey: "sustain",
    layer: HIGHWAY_DEPTH_LAYERS.sustain,
    renderPass: "sustain",
  },
  kick: {
    id: "kick",
    transform: identityModelTransform,
    placementOffset: { x: 0, y: 0, z: 0 },
    meshKey: "kickNote",
    materialKey: "kickNote",
    layer: HIGHWAY_DEPTH_LAYERS.note,
    renderPass: "sustain",
  },
  kickGhost: {
    id: "kickGhost",
    transform: identityModelTransform,
    placementOffset: { x: 0, y: 0, z: 0 },
    meshKey: "kickNote",
    materialKey: "kickNote",
    layer: HIGHWAY_DEPTH_LAYERS.overlay,
    renderPass: "sustain",
  },
  cymbal: {
    id: "cymbal",
    transform: identityModelTransform,
    placementOffset: { x: 0, y: 0, z: 0 },
    meshKey: "cymbalNote",
    materialKey: "roundNote",
    layer: HIGHWAY_DEPTH_LAYERS.note,
    renderPass: "note",
  },
  cymbalGhost: {
    id: "cymbalGhost",
    transform: identityModelTransform,
    placementOffset: { x: 0, y: 0, z: 0 },
    meshKey: "cymbalNote",
    materialKey: "cymbalNote",
    layer: HIGHWAY_DEPTH_LAYERS.overlay,
    renderPass: "overlay",
  },
  pad: {
    id: "pad",
    transform: identityModelTransform,
    placementOffset: { x: 0, y: 0, z: 0 },
    meshKey: "roundNote",
    materialKey: "roundNote",
    layer: HIGHWAY_DEPTH_LAYERS.note,
    renderPass: "note",
  },
  padGhost: {
    id: "padGhost",
    transform: identityModelTransform,
    placementOffset: { x: 0, y: 0, z: 0 },
    meshKey: "roundNote",
    materialKey: "roundNote",
    layer: HIGHWAY_DEPTH_LAYERS.overlay,
    renderPass: "overlay",
  },
};

export function geometryTransform(id: GeometryId): Transform3D {
  const source = HIGHWAY_GEOMETRY_CATALOG[id].transform;
  return {
    position: { ...source.position },
    rotationDegrees: { ...source.rotationDegrees },
    scale: { ...source.scale },
  };
}
