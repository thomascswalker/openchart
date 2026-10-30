import { z } from "zod";
import { EntityType } from "../../entity";
import {
  VocalNoteKind,
  VocalPhraseKind,
  VOCAL_NOTE_KINDS,
  VocalTrackView,
} from "../../../views/vocal";
import { phraseIcon, phraseLabel } from "../../../ruleset/labels";
import {
  DomainCommandType,
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
  type ProjectionRow,
  type ToolDescriptor,
} from "../../modes/mode";
import type { TrackDescriptor } from "../../../ruleset/compile";
import type { NoteHandle } from "../../entity";
import type { Rejection } from "../../result";
import { validSpan } from "../common";
import {
  VocalNoteKindSchema,
  VocalPhraseKindSchema,
  domainCommandTypes,
  getExpander,
  getLayout,
} from "./expansion";
import { ClipboardPayload } from "../../clipboard";

const ToolStateSchema = z.object({
  noteKind: VocalNoteKindSchema,
  phrase: VocalPhraseKindSchema.nullable(),
});
type VocalsToolState = z.infer<typeof ToolStateSchema>;

/** Vocal track mode: pitched/percussion notes, lyrics and phrases. */
export class VocalsMode extends AbstractEditingMode<VocalsToolState> {
  public readonly id = EditingModeId.MidiVocals;
  public readonly label = "Vocals";
  public readonly hostKinds: ReadonlySet<string> = new Set(["piano-roll"]);
  public readonly capabilities: ModeCapabilities = {
    generalCommands: new Set([GeneralCommandType.DeleteEntities]),
    domainCommands: domainCommandTypes,
    entityKinds: new Set([
      EntityType.Note,
      EntityType.Phrase,
      EntityType.Lyric,
    ]),
    canCreateTrack: true,
    requiresDifficulty: false,
    trackKinds: new Set(["vocals"]),
  };
  public readonly toolStateSchema = ToolStateSchema;

  public appliesTo(track: TrackDescriptor): boolean {
    return track.kind === "vocals";
  }

  public createTools(context: ModeContext): readonly ToolDescriptor[] {
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

  public createDefaultToolState(): VocalsToolState {
    return { noteKind: VocalNoteKind.Pitched, phrase: null };
  }

  public createProjection(context: ModeContext): Projection {
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
          : (rows[layout.range.high - layout.range.low + 1 + laneIndex] ??
              null);
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

  public classify(
    note: NoteHandle,
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

  public expandPaste(
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
      return this.rejected(
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
    const layout = getLayout(context);
    if (!layout) {
      return this.rejected(
        command,
        "missing-config",
        "Vocal layout is unavailable",
      );
    }
    const expander = getExpander(command.type);
    if (!expander) {
      return this.rejected(
        command,
        "unsupported-command",
        `Command '${command.type}' is unsupported by vocals`,
      );
    }
    return expander(this, command, context, layout);
  }
}
const PHRASE_TOOLS = [
  [VocalPhraseKind.Vocal, "lyricPhrase"],
  [VocalPhraseKind.PowerWindow, "powerWindow"],
  [VocalPhraseKind.StagePower, "starPower"],
] as const;

function emptyProjection(): Projection {
  return {
    getRows: () => [],
    rowForNote: () => null,
    pitchForRow: () => null,
  };
}
