import { EntityType } from "../../entity";
import { z } from "zod";
import type { ClipboardPayload } from "../../clipboard";
import {
  DomainCommandType,
  GeneralCommandType,
  type EditCommand,
  type GeneralCommand,
} from "../../commands";
import {
  AbstractEditingMode,
  type EntityClassification,
  type ExpansionResult,
  type ModeCapabilities,
  type ModeContext,
  type Projection,
  type ToolDescriptor,
} from "../mode";
import { EditingModeId } from "../mode";
import type { NoteHandle } from "../../entity";
import { getExpander } from "./expansion";

const EmptyToolStateSchema = z.object({});
/** Document-wide mode used by Piano Roll header controls. */
export class GlobalTrackMode extends AbstractEditingMode<
  Record<string, never>
> {
  public readonly id = EditingModeId.MidiGlobal;
  public readonly label = "Global MIDI";
  public readonly hostKinds: ReadonlySet<string> = new Set(["global"]);
  public readonly capabilities: ModeCapabilities = {
    generalCommands: new Set([
      GeneralCommandType.AddText,
      GeneralCommandType.UpdateText,
      GeneralCommandType.DeleteEntities,
      GeneralCommandType.SetTempo,
      GeneralCommandType.RemoveTempo,
      GeneralCommandType.SetTimeSignature,
      GeneralCommandType.RemoveTimeSignature,
    ]),
    domainCommands: new Set([DomainCommandType.AddSection]),
    entityKinds: new Set([
      EntityType.Text,
      EntityType.Tempo,
      EntityType.TimeSignature,
    ]),
    canCreateTrack: false,
    requiresDifficulty: false,
    trackKinds: new Set(["global"]),
  };
  public readonly toolStateSchema = EmptyToolStateSchema;

  public appliesTo(): boolean {
    return true;
  }

  public createTools(): readonly ToolDescriptor[] {
    return [];
  }

  public createDefaultToolState(): Record<string, never> {
    return {};
  }

  public createProjection(): Projection {
    return {
      getRows: () => [],
      rowForNote: () => null,
      pitchForRow: () => null,
    };
  }

  public classify(_note: NoteHandle): EntityClassification {
    return {
      type: EntityType.Text,
      subtype: "global",
      movable: false,
      resizable: false,
    };
  }

  public expandPaste(
    _payload: ClipboardPayload,
    _anchorTick: number,
  ): ExpansionResult {
    return {
      commands: [],
      rejections: [
        {
          code: "unsupported-paste",
          message: "midi.global does not support paste",
          command: { type: DomainCommandType.PasteClipboard },
        },
      ],
    };
  }

  public override rejected(
    command: EditCommand,
    code: string,
    message: string,
  ): ExpansionResult {
    return {
      commands: [],
      rejections: [{ command, code, message }],
    };
  }
  public expand(command: EditCommand, context: ModeContext): ExpansionResult {
    const expander = getExpander(command.type);
    if (expander) return expander(this, command, context);
    // Tempo and time-signature commands are not track-scoped.
    return this.capabilities.generalCommands.has(
      command.type as GeneralCommandType,
    )
      ? { commands: [command as GeneralCommand], rejections: [] }
      : this.rejected(
          command,
          "unsupported-command",
          "Command is not supported by midi.global",
        );
  }
}
