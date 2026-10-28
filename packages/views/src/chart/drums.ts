import type { Difficulty as DifficultyType } from "../types.js";
import { DefaultConfig } from "../config.js";

export type DrumPlacementKind = "pad" | "cymbal" | "kick";
export type DrumNoteKind = DrumPlacementKind | "marker";

export interface DrumLayout {
  kick: number | null;
  kick2: number | null;
  pads: readonly (number | null)[];
  cymbals: readonly (number | null)[];
  markers: readonly number[];
}

export interface DrumNoteProfile {
  kind: DrumNoteKind;
  lane: number | null;
  slot: number;
}

export const DrumLaneCount = 4;

const DrumPitchSuffixes = {
  pads: ["RedDrum", "YellowDrum", "BlueDrum", "GreenDrum"],
  cymbals: [null, "YellowCymbal", "BlueCymbal", "GreenCymbal"],
} as const;

export function drumLayoutFromConfig(
  descriptor: TrackDescriptor,
  difficulty: DifficultyType,
): DrumLayout | null {
  if (
    descriptor.config.type !== "instrument" ||
    getTrackRole(descriptor) !== "drums" ||
    !hasDifficulties(descriptor.config)
  ) {
    return null;
  }
  return {
    kick: getDifficultyNotePitch(descriptor, difficulty, "Kick"),
    kick2: getDifficultyNotePitch(descriptor, difficulty, "Kick2"),
    pads: DrumPitchSuffixes.pads.map((suffix) =>
      getDifficultyNotePitch(descriptor, difficulty, suffix),
    ),
    cymbals: DrumPitchSuffixes.cymbals.map((suffix) =>
      suffix === null
        ? null
        : getDifficultyNotePitch(descriptor, difficulty, suffix),
    ),
    markers: ["Flam"]
      .map((suffix) => getDifficultyNotePitch(descriptor, difficulty, suffix))
      .filter((pitch): pitch is number => pitch !== null),
  };
}

export function classifyDrumPitch(
  layout: DrumLayout,
  pitch: number,
): { kind: DrumNoteKind; lane: number | null } | null {
  if (pitch === layout.kick2 || pitch === layout.kick) {
    return { kind: "kick", lane: null };
  }
  const padLane = layout.pads.indexOf(pitch);
  if (padLane >= 0) return { kind: "pad", lane: padLane };
  const cymbalLane = layout.cymbals.indexOf(pitch);
  if (cymbalLane >= 0) return { kind: "cymbal", lane: cymbalLane };
  if (layout.markers.includes(pitch)) return { kind: "marker", lane: null };
  return null;
}

export function drumPitchFor(
  layout: DrumLayout,
  kind: DrumPlacementKind,
  lane: number,
): number | null {
  if (!Number.isInteger(lane) || lane < 0 || lane >= DrumLaneCount) {
    return null;
  }
  if (kind === "kick") return layout.kick;
  return (kind === "pad" ? layout.pads : layout.cymbals)[lane] ?? null;
}

/** Compatibility adapter for the original offset-based Highway profile API. */
export function getDrumNoteProfile(
  pitch: number,
  offset: number,
): DrumNoteProfile | null {
  const layout = defaultDrumLayout(offset);
  const classification = layout && classifyDrumPitch(layout, pitch);
  if (!classification) return null;
  const slot =
    classification.kind === "kick"
      ? pitch === layout?.kick2
        ? -1
        : 0
      : classification.kind === "pad"
        ? (classification.lane ?? 0) + 1
        : classification.kind === "cymbal"
          ? (classification.lane ?? 0) + 4
          : 8;
  return { ...classification, slot };
}

/** Compatibility adapter for the original offset-based placement API. */
export function getDrumPitchForPlacement(
  kind: DrumPlacementKind,
  lane: number,
  offset: number,
): number | null {
  const layout = defaultDrumLayout(offset);
  return layout ? drumPitchFor(layout, kind, lane) : null;
}

function defaultDrumLayout(offset: number): DrumLayout | null {
  const descriptor = DefaultConfig.tracks
    .map(describeTrack)
    .find((track) => getTrackRole(track) === "drums");
  if (!descriptor || descriptor.config.type !== "instrument") return null;
  const chart = descriptor.config.charts.find(
    (item) => "difficulty" in item && item.range.low === offset,
  );
  return chart && "difficulty" in chart
    ? drumLayoutFromConfig(descriptor, chart.difficulty)
    : null;
}
