import { MetaType } from "@openchart/midi";
import { z } from "zod";
import {
  classifyVocalPitch,
  vocalKindNeedsLyric,
  vocalLayoutFromConfig,
  vocalLaneSpecsFromLayout,
  vocalNotePitch,
  vocalPhrasePitch,
  type VocalLayout,
} from "../../vocals.js";
import { isVocalTrackConfig } from "../../config.js";
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
import {
  ownsNotes,
  rejected,
  targetDescriptor,
  targetNotes,
  targetTrackIndex,
  validSpan,
} from "./common.js";

const ToolStateSchema = z.object({
  noteKind: z.enum(["pitched", "pitchless", "percussion"]),
  phrase: z.enum(["vocal", "power-window", "stagepower"]).nullable(),
});
type VocalsToolState = z.infer<typeof ToolStateSchema>;

const AddNoteSchema = z.object({
  type: z.literal("ADD_VOCAL_NOTE"),
  kind: z.enum(["pitched", "pitchless", "percussion"]),
  tick: z.number().int(),
  endTick: z.number().int(),
  pitch: z.number().int().optional(),
  lyric: z.string().optional(),
});
const SetLyricSchema = z.object({
  type: z.literal("SET_LYRIC"),
  id: z.string(),
  text: z.string(),
});
const MoveSchema = z.object({
  type: z.literal("MOVE_VOCAL_ENTITIES"),
  targetIds: z.array(z.string()),
  tickDelta: z.number().int(),
  pitchDelta: z.number().int(),
  previousValidTickDelta: z.number().int().default(0),
});
const ResizeSchema = z.object({
  type: z.literal("RESIZE_VOCAL_ENTITIES"),
  targetIds: z.array(z.string()),
  durationDelta: z.number().int(),
});
const CreatePhraseSchema = z.object({
  type: z.literal("CREATE_VOCAL_PHRASE"),
  phraseKind: z.enum(["vocal", "power-window", "stagepower"]),
  startTick: z.number().int(),
  endTick: z.number().int(),
});

const domainCommandTypes = new Set([
  "ADD_VOCAL_NOTE",
  "SET_LYRIC",
  "MOVE_VOCAL_ENTITIES",
  "RESIZE_VOCAL_ENTITIES",
  "CREATE_VOCAL_PHRASE",
]);

export function createVocalsMode(): EditingMode<VocalsToolState> {
  return {
    id: "vocals",
    label: "Vocals",
    hostKinds: new Set(["piano-roll"]),
    appliesTo: (track) => isVocalTrackConfig(track.config),
    capabilities: {
      rawCommands: new Set(["DELETE_ENTITIES"]),
      domainCommands: domainCommandTypes,
      entityKinds: new Set(["note", "phrase", "lyric"]),
      canCreateTrack: true,
      requiresDifficulty: false,
    },
    tools: [
      ...(["pitched", "pitchless", "percussion"] as const).map((noteKind) => ({
        id: `vocal-note-${noteKind}`,
        label: noteKind,
        icon: noteKind,
        group: "vocal-tools",
        stateKey: "noteKind",
        value: noteKind,
      })),
      ...(["vocal", "power-window", "stagepower"] as const).map((phrase) => ({
        id: `vocal-phrase-${phrase}`,
        label: phrase,
        icon: phrase,
        group: "vocal-tools",
        stateKey: "phrase",
        value: phrase,
        toggle: { offValue: null },
      })),
    ],
    toolStateSchema: ToolStateSchema,
    createDefaultToolState: () => ({ noteKind: "pitched", phrase: null }),
    createProjection: (context) => createVocalProjection(context),
    classify: (note, context) => classifyVocalNote(note, context),
    expand: (command, context) => expandVocalCommand(command, context),
  };
}

function createVocalProjection(context: ModeContext): Projection {
  const layout = getLayout(context);
  if (!layout) return emptyProjection();
  const lanes = vocalLaneSpecsFromLayout(layout);
  const rows: ProjectionRow[] = [
    ...Array.from(
      { length: layout.range.high - layout.range.low + 1 },
      (_, index) => ({
        id: String(layout.range.low + index),
        label: String(layout.range.low + index),
        index,
        kind: "pitched",
      }),
    ),
    ...lanes.map((lane, index) => ({
      id: lane.id,
      label: lane.label,
      index: layout.range.high - layout.range.low + 1 + index,
      kind: lane.kind,
    })),
  ];
  return {
    getRows: () => rows,
    rowForNote: (note) => {
      const classification = classifyVocalPitch(layout, note.pitch);
      if (classification.type === "note" && classification.kind === "pitched") {
        return rows[note.pitch - layout.range.low] ?? null;
      }
      const laneIndex = lanes.findIndex((lane) =>
        lane.pitches.includes(note.pitch),
      );
      return laneIndex < 0
        ? null
        : (rows[layout.range.high - layout.range.low + 1 + laneIndex] ?? null);
    },
    pitchForRow: (row) => {
      if (row.kind === "pitched") {
        const pitch = layout.range.low + row.index;
        return pitch <= layout.range.high ? pitch : null;
      }
      const lane = lanes.find((candidate) => candidate.id === row.id);
      return lane?.createPitch ?? null;
    },
  };
}

function classifyVocalNote(note: NoteSnapshot, context: ModeContext) {
  const layout = getLayout(context);
  const classification = layout && classifyVocalPitch(layout, note.pitch);
  if (!classification || classification.type === "unknown") {
    return {
      kind: "note" as const,
      subtype: "unknown",
      movable: false,
      resizable: false,
    };
  }
  return {
    kind:
      classification.type === "phrase"
        ? ("phrase" as const)
        : ("note" as const),
    subtype: classification.kind,
    movable: true,
    resizable: true,
  };
}

function expandVocalCommand(
  command: EditCommand,
  context: ModeContext,
): ExpansionResult {
  const layout = getLayout(context);
  const trackIndex = targetTrackIndex(context);
  if (!layout)
    return rejected(command, "missing-config", "Vocal layout is unavailable");
  if (isRawCommand(command) && command.type === "DELETE_ENTITIES") {
    const owned = ownsNotes(command.targetIds, context, command);
    if (owned.rejection) return { commands: [], rejections: [owned.rejection] };
    const deleteIds = new Set(command.targetIds);
    const lyricMap = pairedLyrics(context, layout);
    for (const note of owned.notes) {
      const classification = classifyVocalPitch(layout, note.pitch);
      if (
        classification.type !== "note" ||
        !vocalKindNeedsLyric(classification.kind)
      ) {
        continue;
      }
      const lyric = lyricMap.get(note.id);
      if (lyric) deleteIds.add(lyric.id);
    }
    return {
      commands: [
        {
          type: "DELETE_ENTITIES",
          targetIds: [...deleteIds] as EntityId[],
        },
      ],
      rejections: [],
    };
  }
  switch (command.type) {
    case "ADD_VOCAL_NOTE": {
      const parsed = AddNoteSchema.safeParse(command);
      if (
        !parsed.success ||
        !validSpan(parsed.data.tick, parsed.data.endTick)
      ) {
        return rejected(command, "invalid-span", "Vocal note span is invalid");
      }
      const pitch = vocalNotePitch(layout, parsed.data.kind, parsed.data.pitch);
      if (pitch === null) {
        return rejected(
          command,
          "invalid-pitch",
          "Vocal note pitch is outside its configured range",
        );
      }
      const commands: RawCommand[] = [
        {
          type: "ADD_NOTES",
          notes: [
            {
              trackIndex,
              tick: parsed.data.tick,
              pitch,
              duration: parsed.data.endTick - parsed.data.tick,
            },
          ],
        },
      ];
      if (vocalKindNeedsLyric(parsed.data.kind) && parsed.data.lyric?.trim()) {
        commands.push({
          type: "ADD_TEXT",
          trackIndex,
          metaType: MetaType.Lyric,
          tick: parsed.data.tick,
          text: parsed.data.lyric,
        });
      }
      return { commands, rejections: [] };
    }
    case "SET_LYRIC": {
      const parsed = SetLyricSchema.safeParse(command);
      if (!parsed.success || !parsed.data.text.trim()) {
        return rejected(
          command,
          "invalid-lyric",
          "Lyric text must not be empty",
        );
      }
      const owned = ownsNotes([parsed.data.id], context, command);
      if (owned.rejection)
        return { commands: [], rejections: [owned.rejection] };
      const note = owned.notes[0]!;
      const classification = classifyVocalPitch(layout, note.pitch);
      if (
        classification.type !== "note" ||
        !vocalKindNeedsLyric(classification.kind)
      ) {
        return rejected(
          command,
          "not-lyric-note",
          "This vocal entity cannot have a lyric",
        );
      }
      const existing = pairedLyrics(context, layout).get(note.id);
      return {
        commands: existing
          ? [{ type: "UPDATE_TEXT", id: existing.id, text: parsed.data.text }]
          : [
              {
                type: "ADD_TEXT",
                trackIndex: note.trackIndex,
                metaType: MetaType.Lyric,
                tick: note.tick,
                text: parsed.data.text,
              },
            ],
        rejections: [],
      };
    }
    case "MOVE_VOCAL_ENTITIES": {
      const parsed = MoveSchema.safeParse(command);
      if (!parsed.success) {
        return rejected(command, "invalid-command", "Vocal move is invalid");
      }
      const owned = ownsNotes(parsed.data.targetIds, context, command);
      if (owned.rejection)
        return { commands: [], rejections: [owned.rejection] };
      if (
        owned.notes.some(
          (note) => classifyVocalPitch(layout, note.pitch).type === "unknown",
        )
      ) {
        return rejected(
          command,
          "not-movable",
          "Unknown vocal entities cannot be moved",
        );
      }
      const movingIds = new Set(owned.notes.map((note) => note.id));
      const requestedDelta = parsed.data.tickDelta;
      const phraseTargets = owned.notes.filter(
        (note) => classifyVocalPitch(layout, note.pitch).type === "phrase",
      );
      const requestedFits = phraseTargets.every((note) =>
        phraseMoveFits(note, requestedDelta, movingIds, context, layout),
      );
      const appliedDelta = requestedFits
        ? requestedDelta
        : parsed.data.previousValidTickDelta;
      if (
        !requestedFits &&
        !phraseTargets.every((note) =>
          phraseMoveFits(note, appliedDelta, movingIds, context, layout),
        )
      ) {
        return rejected(
          command,
          "phrase-overlap",
          "No valid previous phrase offset is available",
        );
      }
      const lyricMap = pairedLyrics(context, layout);
      const patches = owned.notes.map((note) => {
        const classification = classifyVocalPitch(layout, note.pitch);
        const tick = Math.max(0, note.tick + appliedDelta);
        if (!Number.isSafeInteger(tick)) {
          return { notePatch: null, lyricPatch: null };
        }
        const patch: {
          id: EntityId;
          tick: number;
          pitch?: number;
        } = { id: note.id, tick };
        if (
          classification.type === "note" &&
          classification.kind === "pitched"
        ) {
          patch.pitch = Math.max(
            layout.range.low,
            Math.min(layout.range.high, note.pitch + parsed.data.pitchDelta),
          );
        }
        const lyric = lyricMap.get(note.id);
        if (lyric) {
          return { notePatch: patch, lyricPatch: { id: lyric.id, tick } };
        }
        return { notePatch: patch, lyricPatch: null };
      });
      if (patches.some((entry) => entry.notePatch === null)) {
        return rejected(
          command,
          "invalid-tick",
          "Moved vocal tick is outside the safe integer range",
        );
      }
      const commands: RawCommand[] = [
        {
          type: "UPDATE_NOTES",
          patches: patches.flatMap((entry) =>
            entry.notePatch ? [entry.notePatch] : [],
          ),
        },
      ];
      const lyricPatches = patches.flatMap((entry) =>
        entry.lyricPatch ? [entry.lyricPatch] : [],
      );
      if (lyricPatches.length > 0) {
        commands.push({
          type: "UPDATE_TEXT",
          id: lyricPatches[0]!.id,
          tick: lyricPatches[0]!.tick,
        });
        for (const lyric of lyricPatches.slice(1)) {
          commands.push({
            type: "UPDATE_TEXT",
            id: lyric.id,
            tick: lyric.tick,
          });
        }
      }
      return { commands, rejections: [] };
    }
    case "RESIZE_VOCAL_ENTITIES": {
      const parsed = ResizeSchema.safeParse(command);
      if (!parsed.success) {
        return rejected(command, "invalid-command", "Vocal resize is invalid");
      }
      const owned = ownsNotes(parsed.data.targetIds, context, command);
      if (owned.rejection)
        return { commands: [], rejections: [owned.rejection] };
      const movingIds = new Set(owned.notes.map((note) => note.id));
      const patches = owned.notes.map((note) => ({
        id: note.id,
        duration: Math.max(1, note.duration + parsed.data.durationDelta),
      }));
      for (const [index, note] of owned.notes.entries()) {
        const duration = patches[index]!.duration;
        if (
          !Number.isSafeInteger(duration) ||
          !Number.isSafeInteger(note.tick + duration)
        ) {
          return rejected(
            command,
            "invalid-range",
            `Resized vocal entity '${note.id}' is outside the safe tick range`,
          );
        }
        if (classifyVocalPitch(layout, note.pitch).type !== "phrase") continue;
        const end = note.tick + duration;
        if (phraseOverlaps(note, note.tick, end, movingIds, context, layout)) {
          return rejected(
            command,
            "phrase-overlap",
            "Vocal phrase resize would overlap another phrase",
          );
        }
      }
      return {
        commands: [{ type: "UPDATE_NOTES", patches }],
        rejections: [],
      };
    }
    case "CREATE_VOCAL_PHRASE": {
      const parsed = CreatePhraseSchema.safeParse(command);
      if (
        !parsed.success ||
        !validSpan(parsed.data.startTick, parsed.data.endTick)
      ) {
        return rejected(
          command,
          "invalid-span",
          "Vocal phrase span is invalid",
        );
      }
      const pitch = vocalPhrasePitch(layout, parsed.data.phraseKind);
      const overlaps = targetNotes(context).some(
        (note) =>
          note.pitch === pitch &&
          note.tick < parsed.data.endTick &&
          parsed.data.startTick < note.tick + note.duration,
      );
      if (overlaps) {
        return rejected(
          command,
          "phrase-overlap",
          "Vocal phrase overlaps an existing phrase",
        );
      }
      return {
        commands: [
          {
            type: "ADD_NOTES",
            notes: [
              {
                trackIndex,
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
    default:
      return rejected(
        command,
        "unsupported-command",
        `Command '${command.type}' is unsupported by vocals`,
      );
  }
}

function phraseMoveFits(
  note: NoteSnapshot,
  tickDelta: number,
  movingIds: ReadonlySet<EntityId>,
  context: ModeContext,
  layout: VocalLayout,
): boolean {
  const start = Math.max(0, note.tick + tickDelta);
  return !phraseOverlaps(
    note,
    start,
    start + note.duration,
    movingIds,
    context,
    layout,
  );
}

function phraseOverlaps(
  note: NoteSnapshot,
  start: number,
  end: number,
  ignoredIds: ReadonlySet<EntityId>,
  context: ModeContext,
  layout: VocalLayout,
): boolean {
  return context.reader
    .getNotes(note.trackIndex, { low: note.pitch, high: note.pitch + 1 })
    .some(
      (other) =>
        !ignoredIds.has(other.id) &&
        classifyVocalPitch(layout, other.pitch).type === "phrase" &&
        other.tick < end &&
        start < other.tick + other.duration,
    );
}

function pairedLyrics(
  context: ModeContext,
  layout: VocalLayout,
): Map<EntityId, { id: EntityId; text: string }> {
  const trackIndex = context.target.trackIndex;
  if (trackIndex === null) return new Map();
  const lyrics = context.reader
    .getTextEvents(trackIndex)
    .filter((event) => event.metaType === MetaType.Lyric)
    .sort((left, right) => left.tick - right.tick);
  const byTick = new Map<number, typeof lyrics>();
  for (const lyric of lyrics) {
    const atTick = byTick.get(lyric.tick) ?? [];
    atTick.push(lyric);
    byTick.set(lyric.tick, atTick);
  }
  const result = new Map<EntityId, { id: EntityId; text: string }>();
  for (const note of targetNotes(context)) {
    const classification = classifyVocalPitch(layout, note.pitch);
    if (
      classification.type !== "note" ||
      !vocalKindNeedsLyric(classification.kind)
    ) {
      continue;
    }
    const lyric = byTick.get(note.tick)?.shift();
    if (lyric) result.set(note.id, lyric);
  }
  return result;
}

function getLayout(context: ModeContext): VocalLayout | null {
  const descriptor = targetDescriptor(context);
  return descriptor && isVocalTrackConfig(descriptor.config)
    ? vocalLayoutFromConfig(descriptor.config)
    : null;
}

function emptyProjection(): Projection {
  return {
    getRows: () => [],
    rowForNote: () => null,
    pitchForRow: () => null,
  };
}
