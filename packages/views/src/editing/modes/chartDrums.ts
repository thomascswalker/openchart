import { z } from "zod";
import {
  DrumLaneCount,
  classifyDrumPitch,
  drumLayoutFromConfig,
  drumPitchFor,
} from "../../chart/drums.js";
import { getTrackRole } from "../../config.js";
import type { EditCommand, RawCommand } from "../commands.js";
import type {
  EditingMode,
  ExpansionResult,
  ModeContext,
  Projection,
  ProjectionRow,
} from "../mode.js";
import { isRawCommand } from "../mode.js";
import type { NoteSnapshot } from "../reader.js";
import {
  ownsNotes,
  rejected,
  targetDescriptor,
  targetNotes,
  targetTrackIndex,
  validTick,
} from "./common.js";

const ToolStateSchema = z.object({
  tool: z.enum(["select", "place", "remove"]),
  drumKind: z.enum(["pad", "cymbal", "kick"]),
});
type ChartDrumsToolState = z.infer<typeof ToolStateSchema>;

const PlaceSchema = z.object({
  type: z.literal("PLACE_CHART_NOTE"),
  lane: z.number().int(),
  tick: z.number().int(),
  drumKind: z.enum(["pad", "cymbal", "kick"]),
});
const MoveSchema = z.object({
  type: z.literal("MOVE_CHART_NOTES"),
  targetIds: z.array(z.string()),
  tickDelta: z.number().int(),
  laneDelta: z.number().int(),
});
const PasteSchema = z.object({
  type: z.literal("PASTE_CHART_NOTES"),
  anchorTick: z.number().int(),
  notes: z.array(
    z.object({
      relativeTick: z.number().int(),
      lane: z.number().int(),
      durationTicks: z.number().int().positive(),
      velocity: z.number().int().min(1).max(127),
      drumKind: z.enum(["pad", "cymbal", "kick", "marker"]),
      originalPitch: z.number().int().min(0).max(127).optional(),
    }),
  ),
});

const domainCommandTypes = new Set([
  "PLACE_CHART_NOTE",
  "MOVE_CHART_NOTES",
  "PASTE_CHART_NOTES",
]);

export function createChartDrumsMode(): EditingMode<ChartDrumsToolState> {
  return {
    id: "chart.drums",
    label: "Chart Drums",
    hostKinds: new Set(["highway"]),
    appliesTo: (track) =>
      track.type === "instrument" &&
      track.config.type === "instrument" &&
      getTrackRole(track) === "drums" &&
      track.config.hasDifficulties !== false,
    capabilities: {
      rawCommands: new Set(["DELETE_ENTITIES"]),
      domainCommands: domainCommandTypes,
      entityKinds: new Set(["note"]),
      canCreateTrack: true,
      requiresDifficulty: true,
    },
    tools: [
      {
        id: "select",
        label: "Select and move notes",
        icon: "cursor",
        group: "highway-tools",
        stateKey: "tool",
        value: "select",
        shortcutActionId: "highway.set-tool",
        shortcutVariant: "select",
      },
      {
        id: "place",
        label: "Place notes",
        icon: "pencil",
        group: "highway-tools",
        stateKey: "tool",
        value: "place",
        shortcutActionId: "highway.set-tool",
        shortcutVariant: "place",
      },
      {
        id: "remove",
        label: "Remove notes",
        icon: "eraser",
        group: "highway-tools",
        stateKey: "tool",
        value: "remove",
        shortcutActionId: "highway.set-tool",
        shortcutVariant: "remove",
      },
      ...(["pad", "cymbal", "kick"] as const).map((drumKind) => ({
        id: `drum-${drumKind}`,
        label: drumKind,
        icon: drumKind,
        group: "placement",
        stateKey: "drumKind",
        value: drumKind,
      })),
    ],
    toolStateSchema: ToolStateSchema,
    createDefaultToolState: () => ({ tool: "select", drumKind: "pad" }),
    createProjection: (context) => createDrumProjection(context),
    classify: (note, context) => classifyDrumNote(note, context),
    expand: (command, context) => expandDrumCommand(command, context),
  };
}

function createDrumProjection(context: ModeContext): Projection {
  const layout = getLayout(context);
  if (!layout) return emptyProjection();
  const rows: ProjectionRow[] = [
    ...Array.from({ length: DrumLaneCount }, (_, index) => ({
      id: String(index),
      label: `Lane ${index + 1}`,
      index,
      kind: "lane",
    })),
    { id: "kick", label: "Kick", index: DrumLaneCount, kind: "kick" },
  ];
  return {
    getRows: () => rows,
    rowForNote: (note) => {
      const classification = classifyDrumPitch(layout, note.pitch);
      if (!classification || classification.kind === "marker") return null;
      const index =
        classification.kind === "kick" ? DrumLaneCount : classification.lane;
      return index === null ? null : (rows[index] ?? null);
    },
    pitchForRow: (row, state) => {
      if (row.kind === "kick") return drumPitchFor(layout, "kick", 0);
      const toolState = ToolStateSchema.safeParse(state);
      if (!toolState.success) return null;
      return drumPitchFor(layout, toolState.data.drumKind, row.index);
    },
  };
}

function classifyDrumNote(note: NoteSnapshot, context: ModeContext) {
  const layout = getLayout(context);
  const classification = layout && classifyDrumPitch(layout, note.pitch);
  if (!classification) {
    return {
      kind: "note" as const,
      subtype: "unmapped",
      movable: false,
      resizable: false,
    };
  }
  return {
    kind: "note" as const,
    subtype: classification.kind,
    movable: classification.kind !== "marker",
    resizable: classification.kind !== "marker",
  };
}

function expandDrumCommand(
  command: EditCommand,
  context: ModeContext,
): ExpansionResult {
  const layout = getLayout(context);
  if (!layout) {
    return rejected(command, "missing-config", "Drum layout is unavailable");
  }
  if (isRawCommand(command) && command.type === "DELETE_ENTITIES") {
    const owned = ownsNotes(command.targetIds, context, command);
    return owned.rejection
      ? { commands: [], rejections: [owned.rejection] }
      : { commands: [command], rejections: [] };
  }
  switch (command.type) {
    case "PLACE_CHART_NOTE": {
      const parsed = PlaceSchema.safeParse(command);
      if (
        !parsed.success ||
        !validTick(parsed.data.tick) ||
        parsed.data.lane < 0 ||
        parsed.data.lane >= DrumLaneCount
      ) {
        return rejected(
          command,
          "invalid-placement",
          "Drum note placement is invalid",
        );
      }
      const pitch = drumPitchFor(
        layout,
        parsed.data.drumKind,
        parsed.data.lane,
      );
      if (pitch === null) {
        return rejected(
          command,
          "invalid-lane",
          "This drum kind has no configured pitch on the selected lane",
        );
      }
      return {
        commands: [
          {
            type: "ADD_NOTES",
            notes: [
              {
                trackIndex: targetTrackIndex(context),
                tick: parsed.data.tick,
                pitch,
                duration: 1,
              },
            ],
          },
        ],
        rejections: [],
      };
    }
    case "MOVE_CHART_NOTES": {
      const parsed = MoveSchema.safeParse(command);
      if (!parsed.success) {
        return rejected(
          command,
          "invalid-command",
          "Drum note move is invalid",
        );
      }
      const owned = ownsNotes(parsed.data.targetIds, context, command);
      if (owned.rejection)
        return { commands: [], rejections: [owned.rejection] };
      const patches: Extract<
        RawCommand,
        { type: "UPDATE_NOTES" }
      >["patches"][number][] = [];
      for (const note of owned.notes) {
        const profile = classifyDrumPitch(layout, note.pitch);
        if (!profile || profile.kind === "marker") {
          return rejected(
            command,
            "not-movable",
            `Note '${note.id}' is not movable`,
          );
        }
        const tick = Math.max(0, note.tick + parsed.data.tickDelta);
        if (!Number.isSafeInteger(tick)) {
          return rejected(
            command,
            "invalid-tick",
            `Moved note '${note.id}' is outside the safe tick range`,
          );
        }
        let pitch = note.pitch;
        if (profile.kind !== "kick") {
          const lane = Math.max(
            0,
            Math.min(DrumLaneCount - 1, profile.lane! + parsed.data.laneDelta),
          );
          const movedPitch = drumPitchFor(layout, profile.kind, lane);
          if (movedPitch === null) {
            return rejected(
              command,
              "invalid-lane",
              "Moved cymbal has no configured pitch on its target lane",
            );
          }
          pitch = movedPitch;
        } else if (note.pitch !== layout.kick2) {
          pitch = layout.kick ?? note.pitch;
        }
        patches.push({ id: note.id, tick, pitch });
      }
      return {
        commands: patches.length > 0 ? [{ type: "UPDATE_NOTES", patches }] : [],
        rejections: [],
      };
    }
    case "PASTE_CHART_NOTES": {
      const parsed = PasteSchema.safeParse(command);
      if (!parsed.success || !validTick(parsed.data.anchorTick)) {
        return rejected(command, "invalid-paste", "Drum paste data is invalid");
      }
      const occupied = new Set(
        targetNotes(context).map((note) => `${note.pitch}:${note.tick}`),
      );
      const notes: Extract<
        RawCommand,
        { type: "ADD_NOTES" }
      >["notes"][number][] = [];
      for (const entry of parsed.data.notes) {
        if (
          entry.lane < 0 ||
          entry.lane >= DrumLaneCount ||
          entry.drumKind === "marker"
        ) {
          continue;
        }
        const start = Math.max(0, parsed.data.anchorTick + entry.relativeTick);
        if (!Number.isSafeInteger(start)) {
          return rejected(
            command,
            "invalid-tick",
            "Pasted note is outside the safe tick range",
          );
        }
        let pitch = drumPitchFor(layout, entry.drumKind, entry.lane);
        if (entry.drumKind === "kick" && entry.originalPitch === layout.kick2) {
          pitch = layout.kick2;
        }
        if (pitch === null || occupied.has(`${pitch}:${start}`)) continue;
        occupied.add(`${pitch}:${start}`);
        notes.push({
          trackIndex: targetTrackIndex(context),
          tick: start,
          pitch,
          duration: entry.durationTicks,
          velocity: entry.velocity,
        });
      }
      return {
        commands: notes.length > 0 ? [{ type: "ADD_NOTES", notes }] : [],
        rejections: [],
      };
    }
    default:
      return rejected(
        command,
        "unsupported-command",
        `Command '${command.type}' is unsupported by chart.drums`,
      );
  }
}

function getLayout(context: ModeContext) {
  const descriptor = targetDescriptor(context);
  const difficulty = context.target.difficulty;
  return descriptor && difficulty !== null
    ? drumLayoutFromConfig(descriptor, difficulty)
    : null;
}

function emptyProjection(): Projection {
  return {
    getRows: () => [],
    rowForNote: () => null,
    pitchForRow: () => null,
  };
}
