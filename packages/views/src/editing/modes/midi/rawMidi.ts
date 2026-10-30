import { z } from "zod";
import { EntityType } from "../../entity";
import {
  isUnmappedTrackRules,
  type TrackDescriptor,
} from "../../../ruleset/compile";
import type { ClipboardPayload } from "../../clipboard";
import {
  GeneralCommandType,
  type EditCommand,
  type GeneralCommand,
} from "../../commands";
import {
  AbstractEditingMode,
  EditingModeId,
  type EntityClassification,
  type ExpansionResult,
  type ModeCapabilities,
  type ModeContext,
  type Projection,
  type ToolDescriptor,
} from "../../modes/mode";
import type { Rejection } from "../../result";
import { getExpander } from "./expansion";

const noteCommandTypes: ReadonlySet<GeneralCommandType> = new Set([
  GeneralCommandType.AddNotes,
  GeneralCommandType.UpdateNotes,
  GeneralCommandType.MoveNotes,
  GeneralCommandType.ResizeNotes,
  GeneralCommandType.DeleteEntities,
]);

const rows = Array.from({ length: 128 }, (_, pitch) => ({
  id: String(pitch),
  label: String(pitch),
  index: pitch,
  kind: "pitch",
}));

/** Unrestricted pitch-grid mode used by the Piano Roll. */
export class RawMidiMode extends AbstractEditingMode<Record<string, never>> {
  public readonly id: EditingModeId = EditingModeId.MidiRaw;
  public readonly label: string = "Raw MIDI";
  public readonly hostKinds: ReadonlySet<string> = new Set(["piano-roll"]);
  public readonly capabilities: ModeCapabilities = {
    generalCommands: noteCommandTypes,
    domainCommands: new Set(),
    entityKinds: new Set([EntityType.Note]),
    canCreateTrack: true,
    requiresDifficulty: false,
    trackKinds: new Set(["guitar", "gamepad", "drums", "vocals"]),
  };
  public readonly toolStateSchema = z.object({});

  public appliesTo(track: TrackDescriptor): boolean {
    return (
      isUnmappedTrackRules(track.rules) ||
      this.capabilities.trackKinds.has(track.kind)
    );
  }

  public createTools(): readonly ToolDescriptor[] {
    return [];
  }

  public createDefaultToolState(): Record<string, never> {
    return {};
  }

  public createProjection(): Projection {
    return {
      getRows: () => rows,
      rowForNote: (note) => rows[note.pitch] ?? null,
      pitchForRow: (row) =>
        Number.isInteger(row.index) && row.index >= 0 && row.index <= 127
          ? row.index
          : null,
    };
  }

  public classify(): EntityClassification {
    return {
      type: EntityType.Note,
      kind: EntityType.Note,
      subtype: "raw",
      movable: true,
      resizable: true,
    };
  }

  public expandPaste(
    payload: ClipboardPayload,
    anchorTick: number,
    context: ModeContext,
  ): ExpansionResult {
    const commands: GeneralCommand[] = [];
    const rejections: Rejection[] = [];
    for (const entity of payload.entities) {
      const command: GeneralCommand = {
        type: GeneralCommandType.AddNotes,
        notes: [
          {
            trackIndex: context.target.trackIndex ?? 0,
            tick: anchorTick + entity.relativeTick,
            pitch: entity.pitch,
            duration: entity.duration,
            velocity: entity.velocity,
          },
        ],
      };
      const expansion = this.expand(command, context);
      commands.push(...expansion.commands);
      rejections.push(...expansion.rejections);
    }
    return { commands, rejections };
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
    if (!expander) {
      return this.rejected(
        command,
        "unsupported-command",
        "Command is not supported by midi.raw",
      );
    }
    return expander(this, command, context);
  }
}
