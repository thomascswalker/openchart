import { z } from "zod";
import type { ClipboardPayload } from "../clipboard.js";
import { Difficulty } from "../../types.js";
import { getPhrasePitch } from "../phrase.js";
import {
  getChartViewConfig,
  getDifficultyNotePitch,
  hasDifficulties,
} from "../../config.js";
import { getSustainCutTargets } from "../../chart/sustains.js";
import { minimumSustainLengthTicks } from "../../chart/constants.js";
import { createForcedNoteCommands } from "../../chart/forcedNotes.js";
import { formatNoteId } from "../entityId.js";
import type { EntityId } from "../entityId.js";
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
import type { Rejection } from "../result.js";
import {
  ownsNotes,
  rejected,
  targetDescriptor,
  targetNotes,
  targetTrackIndex,
  validSpan,
  validTick,
} from "./common.js";

const ToolStateSchema = z.object({
  tool: z.enum(["select", "place", "remove"]),
  phrase: z.enum(["stagepower", "solo"]).nullable(),
  placement: z.enum(["normal", "force-hopo", "force-strum", "tap"]),
});
type ChartFretsToolState = z.infer<typeof ToolStateSchema>;

const PlaceSchema = z.object({
  type: z.literal("PLACE_CHART_NOTE"),
  lane: z.number().int(),
  tick: z.number().int(),
  endTick: z.number().int().optional(),
  velocity: z.number().int().min(1).max(127).optional(),
  placement: z.enum(["normal", "force-hopo", "force-strum", "tap"]),
  cutPolicy: z.enum(["all", "none", "preferred-only", "all-but-preferred"]),
  preferredSustainId: z.string().optional(),
});
const MoveSchema = z.object({
  type: z.literal("MOVE_CHART_NOTES"),
  targetIds: z.array(z.string()),
  tickDelta: z.number().int(),
  laneDelta: z.number().int(),
});
const SustainEndSchema = z.object({
  type: z.literal("SET_SUSTAIN_END"),
  targetIds: z.array(z.string()),
  endTick: z.number().int(),
  extendPastNext: z.enum(["allow", "stop-at-next"]),
});
const CutSchema = z.object({
  type: z.literal("CUT_SUSTAINS"),
  tick: z.number().int(),
  cutPolicy: z.enum(["all", "none", "preferred-only", "all-but-preferred"]),
  preferredSustainId: z.string().optional(),
});
const CreatePhraseSchema = z.object({
  type: z.literal("CREATE_PHRASE"),
  phraseKind: z.enum(["stagepower", "solo"]),
  startTick: z.number().int(),
  endTick: z.number().int(),
});
const UpdatePhraseSchema = z.object({
  type: z.literal("UPDATE_PHRASE"),
  id: z.string(),
  startTick: z.number().int(),
  endTick: z.number().int(),
});

const domainCommandTypes = new Set([
  "PLACE_CHART_NOTE",
  "MOVE_CHART_NOTES",
  "SET_SUSTAIN_END",
  "CUT_SUSTAINS",
  "CREATE_PHRASE",
  "UPDATE_PHRASE",
]);
const laneLabels = ["Green", "Red", "Yellow", "Blue", "Orange"] as const;

export function createChartFretsMode(): EditingMode<ChartFretsToolState> {
  return {
    id: "chart.frets",
    label: "Chart Frets",
    hostKinds: new Set(["highway"]),
    appliesTo: (track) =>
      track.type === "instrument" &&
      track.config.type === "instrument" &&
      hasDifficulties(track.config),
    capabilities: {
      rawCommands: new Set(["DELETE_ENTITIES"]),
      domainCommands: domainCommandTypes,
      entityKinds: new Set(["note", "phrase"]),
      canCreateTrack: true,
      requiresDifficulty: true,
    },
    tools: [
      {
        id: "select",
        label: "Select, move, and edit sustains",
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
      {
        id: "phrase-stagepower",
        label: "Stagepower phrase",
        icon: "stagepower",
        group: "highway-tools",
        stateKey: "phrase",
        value: "stagepower",
        toggle: { offValue: null },
        shortcutActionId: "highway.toggle-phrase-tool",
        shortcutVariant: "stagepower",
      },
      {
        id: "phrase-solo",
        label: "Solo phrase",
        icon: "solo",
        group: "highway-tools",
        stateKey: "phrase",
        value: "solo",
        toggle: { offValue: null },
        shortcutActionId: "highway.toggle-phrase-tool",
        shortcutVariant: "solo",
      },
      ...(["normal", "force-hopo", "force-strum", "tap"] as const).map(
        (placement) => ({
          id: `placement-${placement}`,
          label: placement,
          icon: placement,
          group: "placement",
          stateKey: "placement",
          value: placement,
        }),
      ),
    ],
    toolStateSchema: ToolStateSchema,
    createDefaultToolState: () => ({
      tool: "select",
      phrase: null,
      placement: "normal",
    }),
    createProjection: (context) => createFretsProjection(context),
    classify: (note, context) => classifyFretsNote(note, context),
    expandPaste: (payload, anchorTick, context) =>
      expandFretsPaste(payload, anchorTick, context),
    expand: (command, context) => expandFretsCommand(command, context),
  };
}

function expandFretsPaste(
  payload: ClipboardPayload,
  anchorTick: number,
  context: ModeContext,
): ExpansionResult {
  const commands: RawCommand[] = [];
  const rejections: Rejection[] = [];
  const projection = createFretsProjection(context);
  const pasteCommand: EditCommand = { type: "PASTE_CLIPBOARD" };

  for (const entity of payload.entities) {
    const tick = anchorTick + entity.relativeTick;
    if (
      !validSpan(tick, tick + entity.duration) ||
      !Number.isSafeInteger(tick + entity.duration)
    ) {
      rejections.push({
        code: "invalid-paste-span",
        message: "Pasted note span is invalid",
        command: pasteCommand,
      });
      continue;
    }

    let command: EditCommand;
    if (
      payload.sourceModeId === "chart.frets" &&
      entity.classification.kind === "phrase" &&
      (entity.classification.subtype === "stagepower" ||
        entity.classification.subtype === "solo")
    ) {
      command = {
        type: "CREATE_PHRASE",
        phraseKind: entity.classification.subtype,
        startTick: tick,
        endTick: tick + entity.duration,
      };
    } else {
      const snapshot: NoteSnapshot = {
        id: formatNoteId(context.target.trackIndex ?? 0, "clipboard"),
        trackIndex: context.target.trackIndex ?? 0,
        tick,
        pitch: entity.pitch,
        duration: entity.duration,
        velocity: entity.velocity,
      };
      const row =
        payload.sourceModeId === "chart.frets"
          ? projection
              .getRows()
              .find((candidate) => candidate.id === entity.row)
          : projection.rowForNote(snapshot);
      if (!row) {
        rejections.push({
          code: "invalid-chart-pitch",
          message: "This note is outside the configured chart lanes",
          command: pasteCommand,
        });
        continue;
      }
      command = {
        type: "PLACE_CHART_NOTE",
        lane: row.index,
        tick,
        endTick: tick + entity.duration,
        velocity: entity.velocity,
        placement: "normal",
        cutPolicy: "none",
      };
    }

    const expansion = expandFretsCommand(command, context);
    commands.push(...expansion.commands);
    rejections.push(...expansion.rejections);
  }
  return { commands, rejections };
}

function createFretsProjection(context: ModeContext): Projection {
  const descriptor = targetDescriptor(context);
  const difficulty = context.target.difficulty;
  if (
    !descriptor ||
    difficulty === null ||
    descriptor.config.type !== "instrument"
  ) {
    return emptyProjection();
  }
  const chart = getChartViewConfig(descriptor.config, difficulty);
  if (!chart) return emptyProjection();
  const offset = chart.range.low;
  const noteCount = chart.laneCount;
  const rows: ProjectionRow[] = Array.from(
    { length: noteCount },
    (_, index) => ({
      id: String(index),
      label: laneLabels[index] ?? String(index),
      index,
      kind: "lane",
    }),
  );
  return {
    getRows: () => rows,
    rowForNote: (note) => {
      const classification = classifyFretsNote(note, context);
      if (
        classification.subtype !== "chart-note" &&
        classification.subtype !== "sustain"
      ) {
        return null;
      }
      return rows[note.pitch - offset] ?? null;
    },
    pitchForRow: (row) =>
      Number.isInteger(row.index) && row.index >= 0 && row.index < noteCount
        ? offset + row.index
        : null,
  };
}

function classifyFretsNote(note: NoteSnapshot, context: ModeContext) {
  const descriptor = targetDescriptor(context);
  const difficulty = context.target.difficulty;
  const fallback = {
    kind: "note" as const,
    subtype: "unmapped",
    movable: false,
    resizable: false,
  };
  if (
    !descriptor ||
    difficulty === null ||
    descriptor.config.type !== "instrument"
  ) {
    return fallback;
  }
  const phrase = (["stagepower", "solo"] as const).find(
    (kind) => getPhrasePitch(descriptor, kind) === note.pitch,
  );
  if (phrase) {
    return {
      kind: "phrase" as const,
      subtype: phrase,
      movable: true,
      resizable: true,
    };
  }
  const chart = getChartViewConfig(descriptor.config, difficulty);
  const offset = chart?.range.low;
  const noteCount = chart?.laneCount ?? 0;
  if (
    offset === undefined ||
    note.pitch < offset ||
    note.pitch >= offset + noteCount
  ) {
    const marker = ["Hopo", "Strum", "Tap"].some(
      (suffix) =>
        getDifficultyNotePitch(descriptor, difficulty, suffix) === note.pitch,
    );
    return marker
      ? {
          kind: "note" as const,
          subtype: "forced-marker",
          movable: false,
          resizable: false,
        }
      : fallback;
  }
  return {
    kind: "note" as const,
    subtype:
      note.duration > minimumSustainLengthTicks ? "sustain" : "chart-note",
    movable: true,
    resizable: note.duration > minimumSustainLengthTicks,
  };
}

function expandFretsCommand(
  command: EditCommand,
  context: ModeContext,
): ExpansionResult {
  const descriptor = targetDescriptor(context);
  const difficulty = context.target.difficulty;
  if (
    !descriptor ||
    descriptor.config.type !== "instrument" ||
    difficulty === null
  ) {
    return rejected(
      command,
      "missing-config",
      "Chart track configuration is unavailable",
    );
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
        (parsed.data.endTick !== undefined &&
          (!validTick(parsed.data.endTick) ||
            parsed.data.endTick <= parsed.data.tick))
      ) {
        return rejected(
          command,
          "invalid-command",
          "Chart note placement is invalid",
        );
      }
      const chart = getChartViewConfig(descriptor.config, difficulty);
      if (
        chart === undefined ||
        parsed.data.lane < 0 ||
        parsed.data.lane >= chart.laneCount
      ) {
        return rejected(
          command,
          "invalid-lane",
          "Chart note lane is outside the configured chart",
        );
      }
      const offset = chart.range.low;
      const notes = targetNotes(context);
      const preferredId = parsed.data.preferredSustainId;
      if (preferredId) {
        const preferred = ownsNotes([preferredId], context, command);
        if (preferred.rejection) {
          return { commands: [], rejections: [preferred.rejection] };
        }
      }
      const sustainCandidates = notes
        .filter(
          (note) =>
            note.duration > minimumSustainLengthTicks &&
            note.pitch >= offset &&
            note.pitch < offset + chart.laneCount,
        )
        .map((note) => ({
          ...note,
          start: note.tick,
          end: note.tick + note.duration,
          noteOn: note.id,
        }));
      const cutNotes = getSustainCutTargets(
        sustainCandidates,
        parsed.data.tick,
        {
          cutPolicy: parsed.data.cutPolicy,
          preferredNoteOn: (preferredId as EntityId | undefined) ?? null,
        },
      );
      const commands: RawCommand[] = [];
      if (cutNotes.length > 0) {
        commands.push({
          type: "UPDATE_NOTES",
          patches: cutNotes.map((note) => ({
            id: note.id,
            duration: parsed.data.tick - note.tick,
          })),
        });
      }
      const forced = createForcedNoteCommands({
        descriptor,
        difficulty,
        trackIndex: targetTrackIndex(context),
        tick: parsed.data.tick,
        placement: parsed.data.placement,
        notes,
      });
      if (forced.rejections.length > 0) {
        return { commands: [], rejections: forced.rejections };
      }
      commands.push({
        type: "ADD_NOTES",
        notes: [
          {
            trackIndex: targetTrackIndex(context),
            tick: parsed.data.tick,
            pitch: offset + parsed.data.lane,
            duration:
              (parsed.data.endTick ?? parsed.data.tick + 1) - parsed.data.tick,
            velocity: parsed.data.velocity,
          },
        ],
      });
      commands.push(...forced.commands);
      return { commands, rejections: [] };
    }
    case "MOVE_CHART_NOTES": {
      const parsed = MoveSchema.safeParse(command);
      if (!parsed.success) {
        return rejected(
          command,
          "invalid-command",
          "Chart note move is invalid",
        );
      }
      const owned = ownsNotes(parsed.data.targetIds, context, command);
      if (owned.rejection)
        return { commands: [], rejections: [owned.rejection] };
      const offset = difficultyOffset(descriptor, difficulty);
      const chart = getChartViewConfig(descriptor.config, difficulty);
      if (offset === null) {
        return rejected(
          command,
          "missing-config",
          "Chart difficulty offset is unavailable",
        );
      }
      const patches = [];
      for (const note of owned.notes) {
        const classification = classifyFretsNote(note, context);
        if (!classification.movable || classification.kind !== "note") {
          return rejected(
            command,
            "not-movable",
            `Note '${note.id}' cannot move in this mode`,
          );
        }
        const lane = note.pitch - offset;
        const tick = Math.max(0, note.tick + parsed.data.tickDelta);
        if (!Number.isSafeInteger(tick)) {
          return rejected(
            command,
            "invalid-tick",
            `Moved note '${note.id}' is outside the safe tick range`,
          );
        }
        patches.push({
          id: note.id,
          tick,
          pitch:
            offset +
            Math.max(
              0,
              Math.min(
                (chart?.laneCount ?? 0) - 1,
                lane + parsed.data.laneDelta,
              ),
            ),
        });
      }
      return { commands: [{ type: "UPDATE_NOTES", patches }], rejections: [] };
    }
    case "SET_SUSTAIN_END": {
      const parsed = SustainEndSchema.safeParse(command);
      if (!parsed.success || !validTick(parsed.data.endTick)) {
        return rejected(command, "invalid-command", "Sustain end is invalid");
      }
      const owned = ownsNotes(parsed.data.targetIds, context, command);
      if (owned.rejection)
        return { commands: [], rejections: [owned.rejection] };
      const selectedIds = new Set(owned.notes.map((note) => note.id));
      const patches = [];
      for (const note of owned.notes) {
        if (classifyFretsNote(note, context).subtype !== "sustain") {
          return rejected(
            command,
            "not-sustain",
            `Note '${note.id}' is not a sustain`,
          );
        }
        let endTick = Math.max(note.tick + 1, parsed.data.endTick);
        if (parsed.data.extendPastNext === "stop-at-next") {
          const nextStart = targetNotes(context)
            .filter(
              (candidate) =>
                !selectedIds.has(candidate.id) &&
                classifyFretsNote(candidate, context).subtype !== "unmapped" &&
                classifyFretsNote(candidate, context).subtype !==
                  "forced-marker" &&
                candidate.tick > note.tick &&
                candidate.tick < endTick,
            )
            .reduce(
              (next, candidate) => Math.min(next, candidate.tick),
              Infinity,
            );
          if (Number.isFinite(nextStart)) {
            endTick = Math.max(note.tick + 1, nextStart);
          }
        }
        patches.push({ id: note.id, duration: endTick - note.tick });
      }
      return { commands: [{ type: "UPDATE_NOTES", patches }], rejections: [] };
    }
    case "CUT_SUSTAINS": {
      const parsed = CutSchema.safeParse(command);
      if (!parsed.success || !validTick(parsed.data.tick)) {
        return rejected(command, "invalid-command", "Sustain cut is invalid");
      }
      if (parsed.data.preferredSustainId) {
        const preferred = ownsNotes(
          [parsed.data.preferredSustainId],
          context,
          command,
        );
        if (preferred.rejection) {
          return { commands: [], rejections: [preferred.rejection] };
        }
      }
      const chart = getChartViewConfig(descriptor.config, difficulty);
      const notes = targetNotes(context)
        .filter(
          (note) =>
            note.duration > minimumSustainLengthTicks &&
            chart !== undefined &&
            note.pitch >= chart.range.low &&
            note.pitch < chart.range.low + chart.laneCount,
        )
        .map((note) => ({
          ...note,
          start: note.tick,
          end: note.tick + note.duration,
          noteOn: note.id,
        }));
      const targets = getSustainCutTargets(notes, parsed.data.tick, {
        cutPolicy: parsed.data.cutPolicy,
        preferredNoteOn:
          (parsed.data.preferredSustainId as EntityId | undefined) ?? null,
      });
      return {
        commands:
          targets.length === 0
            ? []
            : [
                {
                  type: "UPDATE_NOTES",
                  patches: targets.map((note) => ({
                    id: note.id,
                    duration: parsed.data.tick - note.tick,
                  })),
                },
              ],
        rejections: [],
      };
    }
    case "CREATE_PHRASE": {
      const parsed = CreatePhraseSchema.safeParse(command);
      if (
        !parsed.success ||
        !validSpan(parsed.data.startTick, parsed.data.endTick)
      ) {
        return rejected(command, "invalid-span", "Phrase span is invalid");
      }
      const pitch = getPhrasePitch(descriptor, parsed.data.phraseKind);
      if (pitch === null) {
        return rejected(
          command,
          "missing-config-note",
          "Phrase pitch is not configured",
        );
      }
      return {
        commands: [
          {
            type: "ADD_NOTES",
            notes: [
              {
                trackIndex: targetTrackIndex(context),
                tick: parsed.data.startTick,
                pitch,
                duration: parsed.data.endTick - parsed.data.startTick,
              },
            ],
          },
        ],
        rejections: [],
      };
    }
    case "UPDATE_PHRASE": {
      const parsed = UpdatePhraseSchema.safeParse(command);
      if (
        !parsed.success ||
        !validSpan(parsed.data.startTick, parsed.data.endTick)
      ) {
        return rejected(command, "invalid-span", "Phrase span is invalid");
      }
      const owned = ownsNotes([parsed.data.id], context, command);
      if (owned.rejection)
        return { commands: [], rejections: [owned.rejection] };
      if (classifyFretsNote(owned.notes[0]!, context).kind !== "phrase") {
        return rejected(command, "not-phrase", "Target entity is not a phrase");
      }
      return {
        commands: [
          {
            type: "UPDATE_NOTES",
            patches: [
              {
                id: owned.notes[0]!.id,
                tick: parsed.data.startTick,
                duration: parsed.data.endTick - parsed.data.startTick,
              },
            ],
          },
        ],
        rejections: [],
      };
    }
    default:
      return rejected(
        command,
        "unsupported-command",
        `Command '${command.type}' is unsupported by chart.frets`,
      );
  }
}

function difficultyOffset(
  descriptor: NonNullable<ReturnType<typeof targetDescriptor>>,
  difficulty: Difficulty,
): number | null {
  if (descriptor.config.type !== "instrument") return null;
  return getChartViewConfig(descriptor.config, difficulty)?.range.low ?? null;
}

function emptyProjection(): Projection {
  return {
    getRows: () => [],
    rowForNote: () => null,
    pitchForRow: () => null,
  };
}
