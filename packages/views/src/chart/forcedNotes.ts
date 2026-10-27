import type { Difficulty } from "../types.js";
import { getDifficultyNotePitch, type TrackDescriptor } from "../config.js";
import type { EntityId } from "../editing/entityId.js";
import type { RawCommand } from "../editing/commands.js";
import type { NoteSnapshot } from "../editing/reader.js";
import type { Rejection } from "../editing/result.js";

export type ForcedNotePlacement =
  "normal" | "force-hopo" | "force-strum" | "tap";

export interface ForcedNoteCommandOptions {
  descriptor: TrackDescriptor;
  difficulty: Difficulty;
  trackIndex: number;
  tick: number;
  placement: ForcedNotePlacement;
  notes: readonly NoteSnapshot[];
}

export function createForcedNoteCommands(options: ForcedNoteCommandOptions): {
  commands: readonly RawCommand[];
  rejections: readonly Rejection[];
} {
  const suffixByPlacement: Partial<Record<ForcedNotePlacement, string>> = {
    "force-hopo": "Hopo",
    "force-strum": "Strum",
    tap: "Tap",
  };
  const selectedSuffix = suffixByPlacement[options.placement];
  const selectedPitch =
    selectedSuffix === undefined
      ? null
      : getDifficultyNotePitch(
          options.descriptor,
          options.difficulty,
          selectedSuffix,
        );
  if (selectedSuffix !== undefined && selectedPitch === null) {
    const command = {
      type: "PLACE_CHART_NOTE",
      placement: options.placement,
      tick: options.tick,
    };
    return {
      commands: [],
      rejections: [
        {
          code: "missing-config-note",
          message: `No ${selectedSuffix} marker is configured for difficulty ${options.difficulty}`,
          command,
        },
      ],
    };
  }

  const markerPitches = ["Hopo", "Strum", "Tap"]
    .map((suffix) =>
      getDifficultyNotePitch(options.descriptor, options.difficulty, suffix),
    )
    .filter((pitch): pitch is number => pitch !== null);
  const conflicts = options.notes.filter(
    (note) =>
      markerPitches.includes(note.pitch) &&
      note.tick === options.tick &&
      note.pitch !== selectedPitch,
  );
  const commands: RawCommand[] = [];
  if (conflicts.length > 0) {
    commands.push({
      type: "DELETE_ENTITIES",
      targetIds: conflicts.map((note) => note.id as EntityId),
    });
  }
  if (
    selectedPitch !== null &&
    !options.notes.some(
      (note) => note.pitch === selectedPitch && note.tick === options.tick,
    )
  ) {
    commands.push({
      type: "ADD_NOTES",
      notes: [
        {
          trackIndex: options.trackIndex,
          tick: options.tick,
          pitch: selectedPitch,
          duration: 1,
        },
      ],
    });
  }
  return { commands, rejections: [] };
}
