import { MetaType } from "@openchart/midi";
import { z } from "zod";
import type { ClipboardPayload } from "../clipboard.js";
import type { EditCommand, RawCommand } from "../commands.js";
import { parseEntityId, type EntityId } from "../entityId.js";
import type {
  EditingMode,
  ExpansionResult,
  ModeContext,
  Projection,
} from "../mode.js";
import { isRawCommand } from "../mode.js";
import type { NoteSnapshot } from "../reader.js";

const EmptyToolStateSchema = z.object({});
const AddSectionSchema = z.object({
  type: z.literal("ADD_SECTION"),
  tick: z.number().int().nonnegative(),
  name: z.string(),
});

const rawCommandTypes = new Set([
  "ADD_TEXT",
  "UPDATE_TEXT",
  "DELETE_ENTITIES",
  "SET_TEMPO",
  "REMOVE_TEMPO",
  "SET_TIME_SIGNATURE",
  "REMOVE_TIME_SIGNATURE",
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
        "ADD_TEXT",
        "UPDATE_TEXT",
        "DELETE_ENTITIES",
        "SET_TEMPO",
        "REMOVE_TEMPO",
        "SET_TIME_SIGNATURE",
        "REMOVE_TIME_SIGNATURE",
      ]),
      domainCommands: new Set(["ADD_SECTION"]),
      entityKinds: new Set(["text", "tempo", "time-signature"]),
      canCreateTrack: false,
      requiresDifficulty: false,
    },
    tools: [],
    toolStateSchema: EmptyToolStateSchema,
    createDefaultToolState: () => ({}),
    createProjection: (): Projection => ({
      getRows: () => [],
      rowForNote: () => null,
      pitchForRow: () => null,
    }),
    classify: (_note: NoteSnapshot) => ({
      kind: "text",
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
          command: { type: "PASTE_CLIPBOARD" },
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
    const raw: RawCommand = {
      type: "ADD_TEXT",
      trackIndex: context.target.trackIndex,
      metaType: MetaType.Marker,
      tick: section.tick,
      text: `[section ${section.name}]`,
    };
    return { commands: [raw], rejections: [] };
  }

  if (!isRawCommand(command) || !rawCommandTypes.has(command.type)) {
    return rejected(command, "unsupported-command");
  }
  if (command.type === "DELETE_ENTITIES") {
    const targetIds = command.targetIds.filter((id) =>
      isTargetText(id, context),
    );
    if (targetIds.length !== command.targetIds.length) {
      return rejected(command, "wrong-entity");
    }
    return {
      commands: [{ type: "DELETE_ENTITIES", targetIds }],
      rejections: [],
    };
  }
  if (command.type === "UPDATE_TEXT") {
    return isTargetText(command.id, context)
      ? { commands: [command], rejections: [] }
      : rejected(command, "wrong-track");
  }
  if (command.type === "ADD_TEXT") {
    return command.trackIndex === context.target.trackIndex &&
      command.metaType !== MetaType.Lyric
      ? { commands: [command], rejections: [] }
      : rejected(command, "wrong-track");
  }
  return { commands: [command], rejections: [] };
}

function isTargetText(id: EntityId, context: ModeContext): boolean {
  const parsed = parseEntityId(id);
  if (
    context.target.trackIndex === null ||
    parsed?.kind !== "text" ||
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
