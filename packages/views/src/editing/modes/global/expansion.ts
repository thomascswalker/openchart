import type { AbstractEditingMode } from "../mode";
import { MetaType } from "@openchart/midi";
import { z } from "zod";
import {
  DomainCommandType,
  GeneralCommandType,
  GeneralOf,
  type EditCommand,
} from "../../commands";
import { parseEntityFromId, type EntityId } from "../../entity";
import type { ExpansionResult, ModeContext } from "../mode";
import type { ExpanderFn } from "../mode";

export const AddSectionSchema = z.object({
  type: z.literal(DomainCommandType.AddSection),
  tick: z.number().int().nonnegative(),
  name: z.string(),
});

function isTargetText(id: EntityId, context: ModeContext): boolean {
  const parsed = parseEntityFromId(id);
  if (
    context.target.trackIndex === null ||
    parsed?.type !== "text" ||
    parsed.trackIndex !== context.target.trackIndex
  ) {
    return false;
  }
  return context.executor
    .getTextEvents(parsed.trackIndex)
    .some((event) => event.id === id && event.metaType !== MetaType.Lyric);
}

export function expandAddSection(
  mode: AbstractEditingMode,
  command: EditCommand,
  context: ModeContext,
): ExpansionResult {
  const parsed = AddSectionSchema.safeParse(command);
  if (!parsed.success)
    return mode.rejected(
      command,
      "invalid-command",
      "Section command is invalid",
    );
  if (context.target.trackIndex === null) {
    return mode.rejected(
      command,
      "missing-track",
      "Global track is unavailable",
    );
  }
  return {
    commands: [
      {
        type: GeneralCommandType.AddText,
        trackIndex: context.target.trackIndex,
        metaType: MetaType.Text,
        tick: parsed.data.tick,
        text: `[section ${parsed.data.name}]`,
      },
    ],
    rejections: [],
  };
}

export function expandDeleteEntities(
  mode: AbstractEditingMode,
  command: GeneralOf<GeneralCommandType.DeleteEntities>,
  context: ModeContext,
): ExpansionResult {
  const targetIds = command.targetIds.filter((id) => isTargetText(id, context));
  if (targetIds.length !== command.targetIds.length) {
    return mode.rejected(
      command,
      "wrong-entity",
      "Entity is not a global text event",
    );
  }
  return {
    commands: [{ type: GeneralCommandType.DeleteEntities, targetIds }],
    rejections: [],
  };
}

export function expandUpdateText(
  mode: AbstractEditingMode,
  command: GeneralOf<GeneralCommandType.UpdateText>,
  context: ModeContext,
): ExpansionResult {
  return isTargetText(command.id, context)
    ? { commands: [command], rejections: [] }
    : mode.rejected(
        command,
        "wrong-track",
        "Entity does not belong to the global track",
      );
}

export function expandAddText(
  mode: AbstractEditingMode,
  command: GeneralOf<GeneralCommandType.AddText>,
  context: ModeContext,
): ExpansionResult {
  return command.trackIndex === context.target.trackIndex &&
    command.metaType !== MetaType.Lyric
    ? { commands: [command], rejections: [] }
    : mode.rejected(
        command,
        "wrong-track",
        "Entity does not belong to the global track",
      );
}

const ExpansionCommandMap = new Map<string, ExpanderFn>([
  [DomainCommandType.AddSection, expandAddSection as ExpanderFn],
  [GeneralCommandType.DeleteEntities, expandDeleteEntities as ExpanderFn],
  [GeneralCommandType.UpdateText, expandUpdateText as ExpanderFn],
  [GeneralCommandType.AddText, expandAddText as ExpanderFn],
]);

export function getExpander(commandType: string): ExpanderFn | undefined {
  return ExpansionCommandMap.get(commandType);
}
