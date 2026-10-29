import { MetaType } from "@openchart/midi";
import { EntityType } from "../../entity.js";
import { z } from "zod";
import type { ClipboardPayload } from "../../clipboard.js";
import {
  DomainCommandType,
  EditCommandType,
  type EditCommand,
  type GeneralCommand,
} from "../../commands.js";
import { parseEntityFromId, type EntityId } from "../../entity.js";
import type {
  EditingMode,
  ExpansionResult,
  ModeContext,
  Projection,
} from "../mode.js";
import { isRawCommand } from "../mode.js";
import type { NoteSnapshot } from "../../reader.js";

const EmptyToolStateSchema = z.object({});
const AddSectionSchema = z.object({
  type: z.literal(DomainCommandType.AddSection),
  tick: z.number().int().nonnegative(),
  name: z.string(),
});

const rawCommandTypes = new Set([
  EditCommandType.AddText,
  EditCommandType.UpdateText,
  EditCommandType.DeleteEntities,
  EditCommandType.SetTempo,
  EditCommandType.RemoveTempo,
  EditCommandType.SetTimeSignature,
  EditCommandType.RemoveTimeSignature,
]);

/** Creates the document-wide mode used by Piano Roll header controls. */
export function createGlobalTrackMode(): EditingMode<Record<string, never>> {
  return {
    id: "midi.global",
    label: "Global MIDI",
    hostKinds: new Set(["global"]),
    appliesTo: () => true,
    capabilities: {
      rawCommands: new Set([
        EditCommandType.AddText,
        EditCommandType.UpdateText,
        EditCommandType.DeleteEntities,
        EditCommandType.SetTempo,
        EditCommandType.RemoveTempo,
        EditCommandType.SetTimeSignature,
        EditCommandType.RemoveTimeSignature,
      ]),
      domainCommands: new Set([DomainCommandType.AddSection]),
      entityKinds: new Set([
        EntityType.Text,
        EntityType.Tempo,
        EntityType.TimeSignature,
      ]),
      canCreateTrack: false,
      requiresDifficulty: false,
    },
    createTools: () => [],
    toolStateSchema: EmptyToolStateSchema,
    createDefaultToolState: () => ({}),
    createProjection: (): Projection => ({
      getRows: () => [],
      rowForNote: () => null,
      pitchForRow: () => null,
    }),
    classify: (_note: NoteSnapshot) => ({
      type: EntityType.Text,
      subtype: "global",
      movable: false,
      resizable: false,
    }),
    expandPaste: (
      _payload: ClipboardPayload,
      _anchorTick: number,
    ): ExpansionResult => ({
      commands: [],
      rejections: [
        {
          code: "unsupported-paste",
          message: "midi.global does not support paste",
          command: { type: DomainCommandType.PasteClipboard },
        },
      ],
    }),
    expand: (command, context) => expandGlobalCommand(command, context),
  };
}

function expandGlobalCommand(
  command: EditCommand,
  context: ModeContext,
): ExpansionResult {
  if (AddSectionSchema.safeParse(command).success) {
    const section = AddSectionSchema.parse(command);
    if (context.target.trackIndex === null) {
      return rejected(command, "missing-track");
    }
    const raw: GeneralCommand = {
      type: EditCommandType.AddText,
      trackIndex: context.target.trackIndex,
      metaType: MetaType.Text,
      tick: section.tick,
      text: `[section ${section.name}]`,
    };
    return { commands: [raw], rejections: [] };
  }

  if (!isRawCommand(command) || !rawCommandTypes.has(command.type)) {
    return rejected(command, "unsupported-command");
  }
  if (command.type === EditCommandType.DeleteEntities) {
    const targetIds = command.targetIds.filter((id) =>
      isTargetText(id, context),
    );
    if (targetIds.length !== command.targetIds.length) {
      return rejected(command, "wrong-entity");
    }
    return {
      commands: [{ type: EditCommandType.DeleteEntities, targetIds }],
      rejections: [],
    };
  }
  if (command.type === EditCommandType.UpdateText) {
    return isTargetText(command.id, context)
      ? { commands: [command], rejections: [] }
      : rejected(command, "wrong-track");
  }
  if (command.type === EditCommandType.AddText) {
    return command.trackIndex === context.target.trackIndex &&
      command.metaType !== MetaType.Lyric
      ? { commands: [command], rejections: [] }
      : rejected(command, "wrong-track");
  }
  return { commands: [command], rejections: [] };
}

function isTargetText(id: EntityId, context: ModeContext): boolean {
  const parsed = parseEntityFromId(id);
  if (
    context.target.trackIndex === null ||
    parsed?.type !== "text" ||
    parsed.trackIndex !== context.target.trackIndex
  ) {
    return false;
  }
  return context.reader
    .getTextEvents(parsed.trackIndex)
    .some((event) => event.id === id && event.metaType !== MetaType.Lyric);
}

function rejected(command: EditCommand, code: string): ExpansionResult {
  return {
    commands: [],
    rejections: [
      {
        code,
        message: `Command is not supported by midi.global`,
        command,
      },
    ],
  };
}
