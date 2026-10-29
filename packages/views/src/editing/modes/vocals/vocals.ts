import { MetaType } from "@openchart/midi";
import { z } from "zod";
import { EntityType } from "../../entity";
import {
  VocalNoteKind,
  VocalPhraseKind,
  VOCAL_NOTE_KINDS,
  VocalTrackView,
  type VocalLayout,
} from "../../../views/vocal";
import { phraseIcon, phraseLabel } from "../../../ruleset/labels";
import type { EntityId } from "../../entity";
import {
  DomainCommandType,
  EditCommandType,
  type EditCommand,
  type GeneralCommand,
} from "../../commands";
import type {
  EditingMode,
  EntityClassification,
  ExpansionResult,
  ModeContext,
  Projection,
  ProjectionRow,
} from "../../modes/mode";
import { EditingModeId, isRawCommand } from "../../modes/mode";
import type { NoteSnapshot } from "../../reader";
import type { Rejection } from "../../result";
import {
  ownsNotes,
  rejected,
  targetRules,
  targetNotes,
  targetTrackIndex,
  validSpan,
} from "../common";
import { ClipboardPayload } from "../../clipboard";

const VocalNoteKindSchema = z.nativeEnum(VocalNoteKind);
const VocalPhraseKindSchema = z.nativeEnum(VocalPhraseKind);
const ToolStateSchema = z.object({
  noteKind: VocalNoteKindSchema,
  phrase: VocalPhraseKindSchema.nullable(),
});
type VocalsToolState = z.infer<typeof ToolStateSchema>;

const AddNoteSchema = z.object({
  type: z.literal(DomainCommandType.AddVocalNote),
  kind: VocalNoteKindSchema,
  tick: z.number().int(),
  endTick: z.number().int(),
  pitch: z.number().int().optional(),
  lyric: z.string().optional(),
});
const SetLyricSchema = z.object({
  type: z.literal(DomainCommandType.SetLyric),
  id: z.string(),
  text: z.string(),
});
const MoveSchema = z.object({
  type: z.literal(DomainCommandType.MoveVocalEntities),
  targetIds: z.array(z.string()),
  tickDelta: z.number().int(),
  pitchDelta: z.number().int(),
  previousValidTickDelta: z.number().int().default(0),
});
const ResizeSchema = z.object({
  type: z.literal(DomainCommandType.ResizeVocalEntities),
  targetIds: z.array(z.string()),
  durationDelta: z.number().int(),
});
const CreatePhraseSchema = z.object({
  type: z.literal(DomainCommandType.CreateVocalPhrase),
  phraseKind: VocalPhraseKindSchema,
  startTick: z.number().int(),
  endTick: z.number().int(),
});

const domainCommandTypes = new Set([
  DomainCommandType.AddVocalNote,
  DomainCommandType.SetLyric,
  DomainCommandType.MoveVocalEntities,
  DomainCommandType.ResizeVocalEntities,
  DomainCommandType.CreateVocalPhrase,
]);

export function createVocalsMode(): EditingMode<VocalsToolState> {
  return {
    id: EditingModeId.MidiVocals,
    label: "Vocals",
    hostKinds: new Set(["piano-roll"]),
    appliesTo: (track) => track.kind === "vocals",
    capabilities: {
      rawCommands: new Set([EditCommandType.DeleteEntities]),
      domainCommands: domainCommandTypes,
      entityKinds: new Set([
        EntityType.Note,
        EntityType.Phrase,
        EntityType.Lyric,
      ]),
      canCreateTrack: true,
      requiresDifficulty: false,
    },
    createTools: (context) => createTools(context),
    toolStateSchema: ToolStateSchema,
    createDefaultToolState: () => ({
      noteKind: VocalNoteKind.Pitched,
      phrase: null,
    }),
    createProjection: (context) => createVocalProjection(context),
    classify: (note, context) => classifyVocalNote(note, context),
    expandPaste: (payload, anchorTick, context) =>
      expandVocalPaste(payload, anchorTick, context),
    expand: (command, context) => expandVocalCommand(command, context),
  };
}

const PHRASE_TOOLS = [
  [VocalPhraseKind.Vocal, "lyricPhrase"],
  [VocalPhraseKind.PowerWindow, "powerWindow"],
  [VocalPhraseKind.StagePower, "starPower"],
] as const;

function createTools(context: ModeContext) {
  const layout = getLayout(context);
  const phrasePitch = (phrase: VocalPhraseKind) =>
    layout ? VocalTrackView.phrasePitch(layout, phrase) : -1;
  return [
    ...VOCAL_NOTE_KINDS.map((noteKind) => ({
      id: `vocal-note-${noteKind}`,
      label: noteKind,
      icon: noteKind,
      group: "placement",
      stateKey: "noteKind",
      value: noteKind,
    })),
    ...PHRASE_TOOLS.filter(([phrase]) => phrasePitch(phrase) >= 0).map(
      ([phrase, effect]) => ({
        id: `vocal-phrase-${phrase}`,
        label: `${phraseLabel(effect)} phrase`,
        icon:
          phrase === VocalPhraseKind.StagePower ? phraseIcon(effect) : phrase,
        group: "vocal-tools",
        stateKey: "phrase",
        value: phrase,
        toggle: { offValue: null as null },
      }),
    ),
  ];
}

function expandVocalPaste(
  payload: ClipboardPayload,
  anchorTick: number,
  context: ModeContext,
): ExpansionResult {
  const commands: GeneralCommand[] = [];
  const rejections: Rejection[] = [];
  const layout = getLayout(context);
  const pasteCommand: EditCommand = {
    type: DomainCommandType.PasteClipboard,
  };
  if (!layout) {
    return rejected(
      pasteCommand,
      "missing-config",
      "Vocal layout is unavailable",
    );
  }

  for (const entity of payload.entities) {
    const tick = anchorTick + entity.relativeTick;
    const endTick = tick + entity.duration;
    if (!validSpan(tick, endTick) || !Number.isSafeInteger(endTick)) {
      rejections.push({
        code: "invalid-paste-span",
        message: "Pasted vocal span is invalid",
        command: pasteCommand,
      });
      continue;
    }

    const sameMode = payload.sourceModeId === EditingModeId.MidiVocals;
    const vocalClassification = sameMode
      ? null
      : VocalTrackView.classifyPitch(layout, entity.pitch);
    if (vocalClassification?.type === "unknown") {
      rejections.push({
        code: "invalid-vocal-note",
        message: "This note is not valid for the vocal chart",
        command: pasteCommand,
      });
      continue;
    }
    const entityKind = sameMode
      ? entity.classification.type
      : vocalClassification?.type === "phrase"
        ? "phrase"
        : "note";
    const subtype = sameMode
      ? entity.classification.subtype
      : (vocalClassification?.kind ?? "unknown");
    let command: EditCommand;
    if (entityKind === "phrase") {
      const phraseKind = VocalPhraseKindSchema.safeParse(subtype);
      if (!phraseKind.success) {
        rejections.push({
          code: "invalid-vocal-phrase",
          message: "This phrase kind is not supported by the vocal chart",
          command: pasteCommand,
        });
        continue;
      }
      command = {
        type: DomainCommandType.CreateVocalPhrase,
        phraseKind: phraseKind.data,
        startTick: tick,
        endTick,
      };
    } else {
      const kind = VocalNoteKindSchema.safeParse(subtype);
      if (!kind.success) {
        rejections.push({
          code: "invalid-vocal-note",
          message: "This note is not valid for the vocal chart",
          command: pasteCommand,
        });
        continue;
      }
      command = {
        type: DomainCommandType.AddVocalNote,
        kind: kind.data,
        tick,
        endTick,
        pitch: entity.pitch,
        ...(sameMode && entity.lyric !== undefined
          ? { lyric: entity.lyric }
          : {}),
      };
    }

    const expansion = expandVocalCommand(command, context);
    commands.push(...expansion.commands);
    rejections.push(...expansion.rejections);
  }
  return { commands, rejections };
}

function createVocalProjection(context: ModeContext): Projection {
  const layout = getLayout(context);
  if (!layout) return emptyProjection();
  const lanes = VocalTrackView.laneSpecs(layout);
  const rows: ProjectionRow[] = [
    ...Array.from(
      { length: layout.range.high - layout.range.low + 1 },
      (_, index) => ({
        id: String(layout.range.low + index),
        label: String(layout.range.low + index),
        index,
        kind: VocalNoteKind.Pitched,
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
      const classification = VocalTrackView.classifyPitch(layout, note.pitch);
      if (
        classification.type === "note" &&
        classification.kind === VocalNoteKind.Pitched
      ) {
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
      if (row.kind === VocalNoteKind.Pitched) {
        const pitch = layout.range.low + row.index;
        return pitch <= layout.range.high ? pitch : null;
      }
      const lane = lanes.find((candidate) => candidate.id === row.id);
      return lane?.createPitch ?? null;
    },
  };
}

function classifyVocalNote(
  note: NoteSnapshot,
  context: ModeContext,
): EntityClassification {
  const layout = getLayout(context);
  const classification =
    layout && VocalTrackView.classifyPitch(layout, note.pitch);
  if (!classification || classification.type === "unknown") {
    return {
      type: EntityType.Note,
      subtype: EntityType.Unknown,
      movable: false,
      resizable: false,
    };
  }
  return {
    type: classification.type,
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
  if (
    isRawCommand(command) &&
    command.type === EditCommandType.DeleteEntities
  ) {
    const owned = ownsNotes(command.targetIds, context, command);
    if (owned.rejection) return { commands: [], rejections: [owned.rejection] };
    const deleteIds = new Set(command.targetIds);
    const lyricMap = pairedLyrics(context, layout);
    for (const note of owned.notes) {
      const classification = VocalTrackView.classifyPitch(layout, note.pitch);
      if (
        classification.type !== "note" ||
        !VocalTrackView.kindNeedsLyric(classification.kind)
      ) {
        continue;
      }
      const lyric = lyricMap.get(note.id);
      if (lyric) deleteIds.add(lyric.id);
    }
    return {
      commands: [
        {
          type: EditCommandType.DeleteEntities,
          targetIds: [...deleteIds] as EntityId[],
        },
      ],
      rejections: [],
    };
  }
  switch (command.type) {
    case DomainCommandType.AddVocalNote: {
      const parsed = AddNoteSchema.safeParse(command);
      if (
        !parsed.success ||
        !validSpan(parsed.data.tick, parsed.data.endTick)
      ) {
        return rejected(command, "invalid-span", "Vocal note span is invalid");
      }
      const pitch = VocalTrackView.notePitch(
        layout,
        parsed.data.kind,
        parsed.data.pitch,
      );
      if (pitch === null) {
        return rejected(
          command,
          "invalid-pitch",
          "Vocal note pitch is outside its configured range",
        );
      }
      const commands: GeneralCommand[] = [
        {
          type: EditCommandType.AddNotes,
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
      if (
        VocalTrackView.kindNeedsLyric(parsed.data.kind) &&
        parsed.data.lyric?.trim()
      ) {
        commands.push({
          type: EditCommandType.AddText,
          trackIndex,
          metaType: MetaType.Lyric,
          tick: parsed.data.tick,
          text: parsed.data.lyric,
        });
      }
      return { commands, rejections: [] };
    }
    case DomainCommandType.SetLyric: {
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
      const classification = VocalTrackView.classifyPitch(layout, note.pitch);
      if (
        classification.type !== "note" ||
        !VocalTrackView.kindNeedsLyric(classification.kind)
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
          ? [
              {
                type: EditCommandType.UpdateText,
                id: existing.id,
                text: parsed.data.text,
              },
            ]
          : [
              {
                type: EditCommandType.AddText,
                trackIndex: note.trackIndex,
                metaType: MetaType.Lyric,
                tick: note.tick,
                text: parsed.data.text,
              },
            ],
        rejections: [],
      };
    }
    case DomainCommandType.MoveVocalEntities: {
      const parsed = MoveSchema.safeParse(command);
      if (!parsed.success) {
        return rejected(command, "invalid-command", "Vocal move is invalid");
      }
      const owned = ownsNotes(parsed.data.targetIds, context, command);
      if (owned.rejection)
        return { commands: [], rejections: [owned.rejection] };
      if (
        owned.notes.some(
          (note) =>
            VocalTrackView.classifyPitch(layout, note.pitch).type === "unknown",
        )
      ) {
        return rejected(
          command,
          "not-movable",
          "Unknown vocal entities cannot be moved",
        );
      }
      const lyricMap = pairedLyrics(context, layout);
      const build = (delta: number): GeneralCommand[] | null => {
        const patches: {
          note: { id: EntityId; tick: number; pitch?: number };
          lyric: { id: EntityId; tick: number } | null;
        }[] = [];
        for (const note of owned.notes) {
          const classification = VocalTrackView.classifyPitch(
            layout,
            note.pitch,
          );
          const tick = Math.max(0, note.tick + delta);
          if (!Number.isSafeInteger(tick)) return null;
          const patch: { id: EntityId; tick: number; pitch?: number } = {
            id: note.id,
            tick,
          };
          if (
            classification.type === "note" &&
            classification.kind === VocalNoteKind.Pitched
          ) {
            patch.pitch = Math.max(
              layout.range.low,
              Math.min(layout.range.high, note.pitch + parsed.data.pitchDelta),
            );
          }
          const lyric = lyricMap.get(note.id);
          patches.push({
            note: patch,
            lyric: lyric ? { id: lyric.id, tick } : null,
          });
        }
        const commands: GeneralCommand[] = [
          {
            type: EditCommandType.UpdateNotes,
            patches: patches.map((entry) => entry.note),
          },
        ];
        for (const entry of patches) {
          if (entry.lyric) {
            commands.push({
              type: EditCommandType.UpdateText,
              id: entry.lyric.id,
              tick: entry.lyric.tick,
            });
          }
        }
        return commands;
      };
      const hasErrors = (commands: GeneralCommand[]) =>
        context.validate(commands).some((v) => v.severity === "error");

      const requested = build(parsed.data.tickDelta);
      if (requested === null) {
        return rejected(
          command,
          "invalid-tick",
          "Moved vocal tick is outside the safe integer range",
        );
      }
      // When the requested offset breaks a rule (e.g. a phrase would overlap
      // another), fall back to the last offset the drag found valid. If that
      // is invalid too, return the request and let the session report why.
      if (
        hasErrors(requested) &&
        parsed.data.previousValidTickDelta !== parsed.data.tickDelta
      ) {
        const previous = build(parsed.data.previousValidTickDelta);
        if (previous !== null && !hasErrors(previous)) {
          return { commands: previous, rejections: [] };
        }
      }
      return { commands: requested, rejections: [] };
    }
    case DomainCommandType.ResizeVocalEntities: {
      const parsed = ResizeSchema.safeParse(command);
      if (!parsed.success) {
        return rejected(command, "invalid-command", "Vocal resize is invalid");
      }
      const owned = ownsNotes(parsed.data.targetIds, context, command);
      if (owned.rejection)
        return { commands: [], rejections: [owned.rejection] };
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
      }
      return {
        commands: [{ type: EditCommandType.UpdateNotes, patches }],
        rejections: [],
      };
    }
    case DomainCommandType.CreateVocalPhrase: {
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
      const pitch = VocalTrackView.phrasePitch(layout, parsed.data.phraseKind);
      if (pitch < 0) {
        return rejected(
          command,
          "missing-config-note",
          "This phrase kind is not defined by the ruleset",
        );
      }
      return {
        commands: [
          {
            type: EditCommandType.AddNotes,
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
    const classification = VocalTrackView.classifyPitch(layout, note.pitch);
    if (
      classification.type !== "note" ||
      !VocalTrackView.kindNeedsLyric(classification.kind)
    ) {
      continue;
    }
    const lyric = byTick.get(note.tick)?.shift();
    if (lyric) result.set(note.id, lyric);
  }
  return result;
}

function getLayout(context: ModeContext): VocalLayout | null {
  const rules = targetRules(context);
  return rules && rules.kind === "vocals"
    ? VocalTrackView.layoutFromRules(rules)
    : null;
}

function emptyProjection(): Projection {
  return {
    getRows: () => [],
    rowForNote: () => null,
    pitchForRow: () => null,
  };
}
