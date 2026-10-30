import type { AbstractEditingMode } from "../mode";
import { MetaType } from "@openchart/midi";
import { z } from "zod";
import {
  VocalNoteKind,
  VocalPhraseKind,
  VocalTrackView,
  type VocalLayout,
} from "../../../views/vocal";
import {
  DomainCommandType,
  GeneralCommandType,
  type EditCommand,
  type GeneralCommand,
} from "../../commands";
import type { EntityId } from "../../entity";
import { validSpan } from "../common";
import type { ExpansionResult, ModeContext } from "../mode";

export const VocalNoteKindSchema = z.nativeEnum(VocalNoteKind);
export const VocalPhraseKindSchema = z.nativeEnum(VocalPhraseKind);

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

export const domainCommandTypes: ReadonlySet<DomainCommandType> = new Set([
  DomainCommandType.AddVocalNote,
  DomainCommandType.SetLyric,
  DomainCommandType.MoveVocalEntities,
  DomainCommandType.ResizeVocalEntities,
  DomainCommandType.CreateVocalPhrase,
]);

export function getLayout(context: ModeContext): VocalLayout | null {
  const rules = context.target.rules();
  return rules && rules.kind === "vocals"
    ? VocalTrackView.layoutFromRules(rules)
    : null;
}

export function pairedLyrics(
  context: ModeContext,
  layout: VocalLayout,
): Map<EntityId, { id: EntityId; text: string }> {
  const trackIndex = context.target.trackIndex;
  if (trackIndex === null) return new Map();
  const lyrics = context.executor
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
  for (const note of context.target.noteHandles()) {
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

export function expandDeleteEntities(
  mode: AbstractEditingMode,
  command: EditCommand,
  context: ModeContext,
  layout: VocalLayout,
): ExpansionResult {
  if (command.type !== GeneralCommandType.DeleteEntities) {
    return mode.rejected(command, "invalid-command", "Vocal delete is invalid");
  }
  const owned = context.target.ownsNoteEntities(command.targetIds, command);
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
        type: GeneralCommandType.DeleteEntities,
        targetIds: [...deleteIds] as EntityId[],
      },
    ],
    rejections: [],
  };
}

export function expandAddNote(
  mode: AbstractEditingMode,
  command: EditCommand,
  context: ModeContext,
  layout: VocalLayout,
): ExpansionResult {
  const parsed = AddNoteSchema.safeParse(command);
  if (!parsed.success || !validSpan(parsed.data.tick, parsed.data.endTick)) {
    return mode.rejected(command, "invalid-span", "Vocal note span is invalid");
  }
  const pitch = VocalTrackView.notePitch(
    layout,
    parsed.data.kind,
    parsed.data.pitch,
  );
  if (pitch === null) {
    return mode.rejected(
      command,
      "invalid-pitch",
      "Vocal note pitch is outside its configured range",
    );
  }
  const trackIndex = context.target.trackIndex ?? 0;
  const commands: GeneralCommand[] = [
    {
      type: GeneralCommandType.AddNotes,
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
      type: GeneralCommandType.AddText,
      trackIndex,
      metaType: MetaType.Lyric,
      tick: parsed.data.tick,
      text: parsed.data.lyric,
    });
  }
  return { commands, rejections: [] };
}

export function expandSetLyric(
  mode: AbstractEditingMode,
  command: EditCommand,
  context: ModeContext,
  layout: VocalLayout,
): ExpansionResult {
  const parsed = SetLyricSchema.safeParse(command);
  if (!parsed.success || !parsed.data.text.trim()) {
    return mode.rejected(
      command,
      "invalid-lyric",
      "Lyric text must not be empty",
    );
  }
  const owned = context.target.ownsNoteEntities([parsed.data.id], command);
  if (owned.rejection) return { commands: [], rejections: [owned.rejection] };
  const note = owned.notes[0]!;
  const classification = VocalTrackView.classifyPitch(layout, note.pitch);
  if (
    classification.type !== "note" ||
    !VocalTrackView.kindNeedsLyric(classification.kind)
  ) {
    return mode.rejected(
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
            type: GeneralCommandType.UpdateText,
            id: existing.id,
            text: parsed.data.text,
          },
        ]
      : [
          {
            type: GeneralCommandType.AddText,
            trackIndex: note.trackIndex,
            metaType: MetaType.Lyric,
            tick: note.tick,
            text: parsed.data.text,
          },
        ],
    rejections: [],
  };
}

export function expandMove(
  mode: AbstractEditingMode,
  command: EditCommand,
  context: ModeContext,
  layout: VocalLayout,
): ExpansionResult {
  const parsed = MoveSchema.safeParse(command);
  if (!parsed.success) {
    return mode.rejected(command, "invalid-command", "Vocal move is invalid");
  }
  const owned = context.target.ownsNoteEntities(parsed.data.targetIds, command);
  if (owned.rejection) return { commands: [], rejections: [owned.rejection] };
  if (
    owned.notes.some(
      (note) =>
        VocalTrackView.classifyPitch(layout, note.pitch).type === "unknown",
    )
  ) {
    return mode.rejected(
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
      const classification = VocalTrackView.classifyPitch(layout, note.pitch);
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
        type: GeneralCommandType.UpdateNotes,
        patches: patches.map((entry) => entry.note),
      },
    ];
    for (const entry of patches) {
      if (entry.lyric) {
        commands.push({
          type: GeneralCommandType.UpdateText,
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
    return mode.rejected(
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

export function expandResize(
  mode: AbstractEditingMode,
  command: EditCommand,
  context: ModeContext,
): ExpansionResult {
  const parsed = ResizeSchema.safeParse(command);
  if (!parsed.success) {
    return mode.rejected(command, "invalid-command", "Vocal resize is invalid");
  }
  const owned = context.target.ownsNoteEntities(parsed.data.targetIds, command);
  if (owned.rejection) return { commands: [], rejections: [owned.rejection] };
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
      return mode.rejected(
        command,
        "invalid-range",
        `Resized vocal entity '${note.id}' is outside the safe tick range`,
      );
    }
  }
  return {
    commands: [{ type: GeneralCommandType.UpdateNotes, patches }],
    rejections: [],
  };
}

export function expandCreatePhrase(
  mode: AbstractEditingMode,
  command: EditCommand,
  context: ModeContext,
  layout: VocalLayout,
): ExpansionResult {
  const parsed = CreatePhraseSchema.safeParse(command);
  if (
    !parsed.success ||
    !validSpan(parsed.data.startTick, parsed.data.endTick)
  ) {
    return mode.rejected(
      command,
      "invalid-span",
      "Vocal phrase span is invalid",
    );
  }
  const pitch = VocalTrackView.phrasePitch(layout, parsed.data.phraseKind);
  if (pitch < 0) {
    return mode.rejected(
      command,
      "missing-config-note",
      "This phrase kind is not defined by the ruleset",
    );
  }
  return {
    commands: [
      {
        type: GeneralCommandType.AddNotes,
        notes: [
          {
            trackIndex: context.target.trackIndex ?? 0,
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

type VocalExpanderFn = (
  mode: AbstractEditingMode,
  command: EditCommand,
  context: ModeContext,
  layout: VocalLayout,
) => ExpansionResult;

const ExpansionCommandMap = new Map<string, VocalExpanderFn>([
  [GeneralCommandType.DeleteEntities, expandDeleteEntities],
  [DomainCommandType.AddVocalNote, expandAddNote],
  [DomainCommandType.SetLyric, expandSetLyric],
  [DomainCommandType.MoveVocalEntities, expandMove],
  [DomainCommandType.ResizeVocalEntities, expandResize],
  [DomainCommandType.CreateVocalPhrase, expandCreatePhrase],
]);

export function getExpander(commandType: string): VocalExpanderFn | undefined {
  return ExpansionCommandMap.get(commandType);
}
