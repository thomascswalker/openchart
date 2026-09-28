export type DrumPlacementKind = "pad" | "cymbal" | "kick";
export type DrumNoteKind = DrumPlacementKind | "marker";

export interface DrumNoteProfile {
  kind: DrumNoteKind;
  lane: number | null;
  slot: number;
}

export const drumLaneCount = 4;

const slotProfiles: readonly DrumNoteProfile[] = [
  { kind: "kick", lane: null, slot: 0 },
  { kind: "pad", lane: 0, slot: 1 },
  { kind: "pad", lane: 1, slot: 2 },
  { kind: "pad", lane: 2, slot: 3 },
  { kind: "pad", lane: 3, slot: 4 },
  { kind: "cymbal", lane: 1, slot: 5 },
  { kind: "cymbal", lane: 2, slot: 6 },
  { kind: "cymbal", lane: 3, slot: 7 },
  { kind: "marker", lane: null, slot: 8 },
];

export function getDrumNoteProfile(
  pitch: number,
  offset: number,
): DrumNoteProfile | null {
  if (offset === 96 && pitch === 95) {
    return { kind: "kick", lane: null, slot: -1 };
  }
  const slot = pitch - offset;
  return slotProfiles[slot] ?? null;
}

export function getDrumPitchForPlacement(
  kind: DrumPlacementKind,
  lane: number,
  offset: number,
): number | null {
  if (!Number.isInteger(lane) || lane < 0 || lane >= drumLaneCount) {
    return null;
  }
  if (kind === "kick") return offset;
  if (kind === "pad") return offset + lane + 1;
  return lane >= 1 ? offset + lane + 4 : null;
}
