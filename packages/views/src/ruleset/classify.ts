import type { MarkerEffect, PadType, PhraseDef } from "../config.js";
import type { Difficulty } from "../types.js";
import { difficultyName, expandPitchSet, type TrackRules } from "./compile.js";

export type PitchRole =
  | {
      kind: "laneNote";
      laneId: string;
      padType: PadType | undefined;
      difficulty: Difficulty;
      /** Visual column, or `-1` for bar lanes. */
      column: number;
      bar: boolean;
      available: boolean;
    }
  | { kind: "marker"; effect: MarkerEffect; difficulty: Difficulty }
  | {
      kind: "phrase";
      id: string;
      effect: PhraseDef["effect"];
      difficulty: Difficulty | null;
    }
  | { kind: "eventNote"; id: string; category: string; valueIndex: number }
  | {
      kind: "noteClass";
      id: string;
      class: "pitched" | "pitchless" | "percussion";
    }
  | { kind: "reserved" }
  | { kind: "ignored" }
  | { kind: "unknown" };

function phraseAppliesTo(p: PhraseDef, d: Difficulty | null): boolean {
  if (!p.appliesTo || p.appliesTo === "all" || d === null) return true;
  return p.appliesTo.includes(difficultyName(d));
}

/**
 * Role of a MIDI pitch on a track. With a difficulty, only that difficulty's
 * notes and markers match; with `null`, every difficulty is searched and the
 * matching difficulty is reported on the role.
 *
 * Order: lane note → marker → phrase → event note → note class → ignored →
 * reserved → unknown.
 */
export function classifyPitch(
  rules: TrackRules,
  pitch: number,
  difficulty: Difficulty | null,
): PitchRole {
  const charts =
    difficulty === null
      ? [...rules.difficulties.values()]
      : [rules.difficulties.get(difficulty)].filter((c) => c !== undefined);

  for (const chart of charts) {
    const note = chart.notes.get(pitch);
    if (note) {
      const lane = rules.lanes.find((l) => l.id === note.laneId);
      return {
        kind: "laneNote",
        laneId: note.laneId,
        padType: note.padType ?? lane?.defaultPadType,
        difficulty: chart.difficulty,
        column: lane?.column ?? -1,
        bar: lane?.isBar ?? false,
        available: note.laneAvailable,
      };
    }
    const marker = chart.markers.get(pitch);
    if (marker)
      return {
        kind: "marker",
        effect: marker.effect,
        difficulty: chart.difficulty,
      };
  }

  for (const p of rules.phrases) {
    if (p.pitches.includes(pitch) && phraseAppliesTo(p, difficulty)) {
      return { kind: "phrase", id: p.id, effect: p.effect, difficulty };
    }
  }

  for (const e of rules.eventNotes) {
    const pitches = expandPitchSet(e.pitches);
    const idx = pitches.indexOf(pitch);
    if (idx >= 0)
      return {
        kind: "eventNote",
        id: e.id,
        category: e.category,
        valueIndex: idx,
      };
  }

  for (const nc of rules.noteClasses) {
    if (expandPitchSet(nc.pitches).includes(pitch)) {
      return { kind: "noteClass", id: nc.id, class: nc.class };
    }
  }

  if (rules.ignoredPitches.has(pitch)) return { kind: "ignored" };

  const reserved = (r: { from: number; to: number }) =>
    pitch >= r.from && pitch <= r.to;
  if (
    rules.reserved.some(reserved) ||
    charts.some((c) => c.reserved.some(reserved))
  ) {
    return { kind: "reserved" };
  }
  return { kind: "unknown" };
}
