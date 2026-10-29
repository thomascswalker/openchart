import {
  MetaType,
  TextMetaType,
  type Midi,
  type MidiEvent,
  type MidiNote,
  type MidiTrack,
} from "@openchart/midi";
import { SongView } from "../views/song.js";
import {
  DefaultCompiledRuleset,
  type CompiledRuleset,
  type TrackDescriptor,
} from "../ruleset/compile.js";
import type { ChartDocumentReader, NoteSnapshot } from "./reader.js";
import {
  EntityType,
  formatNoteId,
  formatTempoId,
  formatTextId,
  formatTimeSignatureId,
  parseEntityFromId,
  type EntityId,
} from "./entity.js";
import {
  emptyEditResult,
  EditRejectedError,
  type EditResult,
} from "./result.js";
import { EditCommandType, type GeneralCommand } from "./commands.js";

export type { NoteSnapshot } from "./reader.js";

/** Headless raw-command executor and read-only projection of a MIDI document. */
export class ChartDocument implements ChartDocumentReader {
  private readonly midi: Midi;
  private readonly trackDescriptors: readonly TrackDescriptor[];
  private readonly rules: CompiledRuleset;

  /** Creates a reader and command executor for a mutable MIDI document. */
  public constructor(
    midi: Midi,
    rules: CompiledRuleset = DefaultCompiledRuleset,
  ) {
    this.midi = midi;
    this.rules = rules;
    this.trackDescriptors = rules.descriptors();
  }

  /** The compiled ruleset this document was built with. */
  public getRules(): CompiledRuleset {
    return this.rules;
  }

  /** Returns the stable ID for a note on the given track. */
  public getNoteId(trackIndex: number, note: MidiNote): EntityId {
    const track = this.getTrack(trackIndex);
    return formatNoteId(trackIndex, track.getEventId(note.noteOn));
  }

  /** Returns the document's ticks-per-quarter-note resolution. */
  public getPpqn(): number {
    return this.midi.header.division;
  }

  /** Returns the configured descriptor for a MIDI track, if one exists. */
  public getTrackDescriptor(trackIndex: number): TrackDescriptor | null {
    const track = this.midi.tracks[trackIndex];
    if (!track) return null;
    return (
      this.trackDescriptors.find(
        (descriptor) => descriptor.name === track.name,
      ) ?? null
    );
  }

  /** Resolves a configured track key to its MIDI index. */
  public findTrackIndex(trackKey: string): number | null {
    const descriptor = this.trackDescriptors.find(
      (item) => item.key === trackKey,
    );
    if (!descriptor) return null;
    const index = this.midi.tracks.findIndex(
      (track) => track.name === descriptor.name,
    );
    return index >= 0 ? index : null;
  }

  /** Materializes a configured target track and returns its current index. */
  public ensureTrack(trackKey: string): number | null {
    const track = new SongView(this.midi, this.rules).ensureMidiTrack(trackKey);
    if (!track) return null;
    const index = this.midi.tracks.indexOf(track);
    return index >= 0 ? index : null;
  }

  /** Reads note snapshots from a track, optionally restricting the pitch range. */
  public getNotes(
    trackIndex: number,
    pitchRange?: { low: number; high: number },
  ): readonly NoteSnapshot[] {
    const track = this.midi.tracks[trackIndex];
    if (!track) return [];
    const notes = track.getNotes(
      pitchRange ? { pitch: pitchRange } : undefined,
    );
    return notes.map((note) =>
      this.toNoteSnapshot(trackIndex, track.getEventId(note.noteOn), note),
    );
  }

  /** Returns the lyric event exactly at a tick, or null when there is none. */
  public getLyricAt(
    trackIndex: number,
    tick: number,
  ): { id: EntityId; text: string } | null {
    const lyric = this.getTextEvents(trackIndex).find(
      (event) => event.metaType === MetaType.Lyric && event.tick === tick,
    );
    return lyric ? { id: lyric.id, text: lyric.text } : null;
  }

  /** Returns text-bearing MIDI meta events with stable text entity IDs. */
  public getTextEvents(
    trackIndex: number,
  ): readonly { id: EntityId; tick: number; text: string; metaType: number }[] {
    const track = this.midi.tracks[trackIndex];
    if (!track) return [];
    return track.events.flatMap((source) => {
      if (
        source.status !== 0xff ||
        !("type" in source) ||
        !("text" in source) ||
        typeof source.text !== "string"
      ) {
        return [];
      }
      return [
        {
          id: formatTextId(trackIndex, track.getEventId(source)),
          tick: source.tick,
          text: source.text,
          metaType: source.type,
        },
      ];
    });
  }

  /** Resolves a stable note ID to a read-only snapshot. */
  public getNote(id: EntityId | string): NoteSnapshot | null {
    const target = this.resolveNote(id);
    if (!target) return null;
    const { trackIndex, note } = target;
    return this.toNoteSnapshot(
      trackIndex,
      target.track.getEventId(note.noteOn),
      note,
    );
  }

  /**
   * Applies one raw command through the same preflight and execution path as a
   * batch. Invalid commands throw before any MIDI event is changed.
   */
  public apply(command: GeneralCommand): EditResult {
    return this.applyBatch([command]);
  }

  /**
   * Preflights every command before mutation starts. Validation failures throw
   * EditRejectedError without changing MIDI. Unexpected failures after the
   * first mutation are rethrown; the caller must restore its transaction.
   */
  public applyBatch(commands: readonly GeneralCommand[]): EditResult {
    if (commands.length === 0) return emptyEditResult();
    for (const command of commands) this.validateCommand(command);

    const createdIds = new Set<EntityId>();
    const updatedIds = new Set<EntityId>();
    const removedIds = new Set<EntityId>();
    let changed = false;
    for (const command of commands) {
      const result = this.applyValidated(command);
      changed = result.changed || changed;
      result.createdIds.forEach((id) => createdIds.add(id));
      result.updatedIds.forEach((id) => updatedIds.add(id));
      result.removedIds.forEach((id) => removedIds.add(id));
    }
    return {
      changed,
      createdIds: [...createdIds],
      updatedIds: [...updatedIds],
      removedIds: [...removedIds],
      rejections: [],
      diagnostics: [],
    };
  }

  private validateCommand(command: GeneralCommand): void {
    switch (command.type) {
      case EditCommandType.AddNotes:
        for (const spec of command.notes) {
          this.validateTrackIndex(command, spec.trackIndex);
          this.validateNoteFields(
            command,
            spec.tick,
            spec.pitch,
            spec.duration,
          );
          if (!Number.isSafeInteger(spec.tick + spec.duration)) {
            this.reject(
              command,
              "invalid-note-range",
              "Note end tick is too large",
            );
          }
          if (
            spec.velocity !== undefined &&
            (!Number.isInteger(spec.velocity) ||
              spec.velocity < 1 ||
              spec.velocity > 127)
          ) {
            this.reject(command, "invalid-velocity", "Velocity must be 1–127");
          }
        }
        break;
      case EditCommandType.UpdateNotes:
        for (const patch of command.patches) {
          const { note } = this.requireCommandNote(command, patch.id);
          if (patch.tick !== undefined) {
            this.validateTick(command, patch.tick);
          }
          if (
            patch.pitch !== undefined &&
            (!Number.isInteger(patch.pitch) ||
              patch.pitch < 0 ||
              patch.pitch > 127)
          ) {
            this.reject(command, "invalid-pitch", "Pitch must be 0–127");
          }
          if (
            patch.duration !== undefined &&
            (!Number.isSafeInteger(patch.duration) || patch.duration < 1)
          ) {
            this.reject(
              command,
              "invalid-duration",
              "Duration must be a positive integer",
            );
          }
          if (
            patch.velocity !== undefined &&
            (!Number.isInteger(patch.velocity) ||
              patch.velocity < 1 ||
              patch.velocity > 127)
          ) {
            this.reject(command, "invalid-velocity", "Velocity must be 1–127");
          }
          const nextStart = patch.tick ?? note.start;
          const nextDuration = patch.duration ?? note.end - note.start;
          if (!Number.isSafeInteger(nextStart + nextDuration)) {
            this.reject(
              command,
              "invalid-note-range",
              "Note end tick is too large",
            );
          }
        }
        break;
      case EditCommandType.MoveNotes:
        this.validateInteger(command, command.tickDelta, "tickDelta");
        this.validateInteger(command, command.pitchDelta, "pitchDelta");
        command.targetIds.forEach((id) => {
          const { note } = this.requireCommandNote(command, id);
          const start = Math.max(0, note.start + command.tickDelta);
          if (
            !Number.isSafeInteger(start) ||
            !Number.isSafeInteger(start + note.end - note.start)
          ) {
            this.reject(
              command,
              "invalid-note-range",
              "Moved note end tick is too large",
            );
          }
        });
        break;
      case EditCommandType.ResizeNotes:
        this.validateInteger(command, command.durationDelta, "durationDelta");
        command.targetIds.forEach((id) => {
          const { note } = this.requireCommandNote(command, id);
          const duration = Math.max(
            1,
            note.end - note.start + command.durationDelta,
          );
          if (!Number.isSafeInteger(note.start + duration)) {
            this.reject(
              command,
              "invalid-note-range",
              "Resized note end tick is too large",
            );
          }
        });
        break;
      case EditCommandType.DeleteEntities:
        command.targetIds.forEach((id) => {
          if (!this.entityExists(id)) {
            this.reject(
              command,
              "missing-entity",
              `Entity '${id}' does not exist`,
            );
          }
        });
        break;
      case EditCommandType.AddText:
        this.validateTrackIndex(command, command.trackIndex);
        this.validateTick(command, command.tick);
        if (!this.isTextMetaType(command.metaType)) {
          this.reject(
            command,
            "invalid-text-type",
            "Text meta type is invalid",
          );
        }
        if (typeof command.text !== "string" || !command.text.trim()) {
          this.reject(command, "invalid-text", "Text must not be empty");
        }
        break;
      case EditCommandType.UpdateText: {
        this.requireTextEvent(command, command.id);
        if (
          command.text !== undefined &&
          (typeof command.text !== "string" || !command.text.trim())
        ) {
          this.reject(command, "invalid-text", "Text must not be empty");
        }
        if (command.tick !== undefined)
          this.validateTick(command, command.tick);
        if (command.text === undefined && command.tick === undefined) {
          this.reject(
            command,
            "empty-update",
            "Text update has no changed fields",
          );
        }
        break;
      }
      case EditCommandType.SetTempo:
        this.validateGlobalTick(command, command.tick);
        if (
          !Number.isInteger(command.microsecondsPerQuarterNote) ||
          command.microsecondsPerQuarterNote < 1 ||
          command.microsecondsPerQuarterNote > 0xff_ffff
        ) {
          this.reject(
            command,
            "invalid-tempo",
            "Microseconds per quarter note must fit in three bytes",
          );
        }
        break;
      case EditCommandType.RemoveTempo:
      case EditCommandType.RemoveTimeSignature:
        this.validateGlobalTick(command, command.tick);
        break;
      case EditCommandType.SetTimeSignature:
        this.validateGlobalTick(command, command.tick);
        if (
          !Number.isInteger(command.numerator) ||
          command.numerator < 1 ||
          command.numerator > 255
        ) {
          this.reject(
            command,
            "invalid-time-signature",
            "Numerator must be 1–255",
          );
        }
        if (
          !Number.isInteger(command.denominator) ||
          command.denominator < 0 ||
          command.denominator > 7
        ) {
          this.reject(
            command,
            "invalid-time-signature",
            "Denominator exponent must be 0–7",
          );
        }
        break;
    }
  }

  private applyValidated(command: GeneralCommand): EditResult {
    switch (command.type) {
      case EditCommandType.AddNotes: {
        const createdIds = command.notes.map((spec) => {
          const note = this.getTrack(spec.trackIndex).insertNote(spec);
          return formatNoteId(
            spec.trackIndex,
            this.getTrack(spec.trackIndex).getEventId(note.noteOn),
          );
        });
        return {
          ...emptyEditResult(),
          changed: createdIds.length > 0,
          createdIds,
        };
      }
      case EditCommandType.UpdateNotes: {
        const updatedIds: EntityId[] = [];
        for (const patch of command.patches) {
          const target = this.resolveNote(patch.id)!;
          const duration =
            patch.duration ?? target.note.end - target.note.start;
          const start = patch.tick ?? target.note.start;
          const pitch = patch.pitch ?? target.note.pitch;
          const velocity = patch.velocity ?? target.note.velocity;
          if (
            start === target.note.start &&
            pitch === target.note.pitch &&
            duration === target.note.end - target.note.start &&
            velocity === target.note.velocity
          ) {
            continue;
          }
          target.track.updateNote(target.note, {
            start,
            pitch,
            duration,
            velocity,
          });
          updatedIds.push(patch.id);
        }
        return {
          ...emptyEditResult(),
          changed: updatedIds.length > 0,
          updatedIds,
        };
      }
      case EditCommandType.MoveNotes: {
        const updatedIds: EntityId[] = [];
        for (const id of command.targetIds) {
          const target = this.resolveNote(id)!;
          const start = Math.max(0, target.note.start + command.tickDelta);
          const pitch = Math.max(
            0,
            Math.min(127, target.note.pitch + command.pitchDelta),
          );
          if (start === target.note.start && pitch === target.note.pitch)
            continue;
          target.track.updateNote(target.note, {
            start,
            duration: target.note.end - target.note.start,
            pitch,
          });
          updatedIds.push(id);
        }
        return {
          ...emptyEditResult(),
          changed: updatedIds.length > 0,
          updatedIds,
        };
      }
      case EditCommandType.ResizeNotes: {
        const updatedIds: EntityId[] = [];
        for (const id of command.targetIds) {
          const target = this.resolveNote(id)!;
          const duration = Math.max(
            1,
            target.note.end - target.note.start + command.durationDelta,
          );
          if (duration === target.note.end - target.note.start) continue;
          target.track.updateNote(target.note, { duration });
          updatedIds.push(id);
        }
        return {
          ...emptyEditResult(),
          changed: updatedIds.length > 0,
          updatedIds,
        };
      }
      case EditCommandType.DeleteEntities: {
        const removedIds: EntityId[] = [];
        command.targetIds.forEach((targetId) => {
          const entity = parseEntityFromId(targetId)!;

          switch (entity.type) {
            case EntityType.Note: {
              const target = this.resolveNote(targetId)!;

              if (target.track.removeNote(target.note)) {
                removedIds.push(targetId);
              }
              break;
            }
            case EntityType.Text: {
              const track = this.getTrack(entity.trackIndex!);
              if (track.removeEventById(entity.eventId)) {
                removedIds.push(targetId);
              }
              break;
            }
            case EntityType.Tempo:
            case EntityType.TimeSignature: {
              if (this.getTrack(0).removeEventById(entity.eventId)) {
                removedIds.push(targetId);
                break;
              }
              break;
            }
          }
        });

        return {
          ...emptyEditResult(),
          changed: removedIds.length > 0,
          removedIds,
        };
      }
      case EditCommandType.AddText: {
        const track = this.getTrack(command.trackIndex);
        const text = track.addTextEvent(
          command.metaType,
          command.tick,
          command.text,
        );
        const id = formatTextId(command.trackIndex, track.getEventId(text));
        return { ...emptyEditResult(), changed: true, createdIds: [id] };
      }
      case EditCommandType.UpdateText: {
        const entity = parseEntityFromId(command.id)!;
        const track = this.getTrack(entity.trackIndex!);
        const event = track.getEventById(entity.eventId)!;
        if (event.status !== 0xff || !("text" in event)) {
          throw new Error("Validated text event changed before execution");
        }
        const currentTick = event.tick;
        const textChanged =
          command.text !== undefined && command.text !== event.text;
        const tickChanged =
          command.tick !== undefined && command.tick !== currentTick;
        if (!textChanged && !tickChanged) return emptyEditResult();
        if (textChanged) {
          const text = command.text;
          if (text === undefined || !track.updateTextEvent(event, text)) {
            throw new Error("Validated text event could not be updated");
          }
        }
        if (tickChanged) {
          const tick = command.tick;
          if (tick === undefined || !track.moveEvent(event, tick)) {
            throw new Error("Validated text event could not be moved");
          }
        }
        return {
          ...emptyEditResult(),
          changed: true,
          updatedIds: [command.id],
        };
      }
      case EditCommandType.SetTempo: {
        const existing = this.globalEventAt(MetaType.Tempo, command.tick);
        if (
          existing &&
          "microsecondsPerQuarterNote" in existing &&
          existing.microsecondsPerQuarterNote ===
            command.microsecondsPerQuarterNote
        ) {
          return emptyEditResult();
        }
        const removedId = existing
          ? formatTempoId(this.getTrack(0).getEventId(existing))
          : null;
        if (existing) this.midi.removeTempoEventAt(command.tick);
        this.midi.addTempoEvent(
          command.tick,
          command.microsecondsPerQuarterNote,
        );
        const added = this.globalEventAt(MetaType.Tempo, command.tick, "last");
        if (!added) throw new Error("Inserted tempo event is missing");
        const id = formatTempoId(this.getTrack(0).getEventId(added));
        return {
          changed: true,
          createdIds: [id],
          updatedIds: [],
          removedIds: removedId ? [removedId] : [],
          rejections: [],
          diagnostics: [],
        };
      }
      case EditCommandType.RemoveTempo:
        return this.removeGlobalEventAt(command, MetaType.Tempo, "tempo");
      case EditCommandType.SetTimeSignature: {
        const existing = this.globalEventAt(
          MetaType.TimeSignature,
          command.tick,
        );
        if (
          existing &&
          "numerator" in existing &&
          "denominator" in existing &&
          existing.numerator === command.numerator &&
          existing.denominator === command.denominator
        ) {
          return emptyEditResult();
        }
        const removedId = existing
          ? formatTimeSignatureId(this.getTrack(0).getEventId(existing))
          : null;
        if (existing) this.midi.removeTimeSignatureEventAt(command.tick);
        this.midi.addTimeSignatureEvent(
          command.tick,
          command.numerator,
          command.denominator,
        );
        const added = this.globalEventAt(
          MetaType.TimeSignature,
          command.tick,
          "last",
        );
        if (!added) throw new Error("Inserted time-signature event is missing");
        const id = formatTimeSignatureId(this.getTrack(0).getEventId(added));
        return {
          changed: true,
          createdIds: [id],
          updatedIds: [],
          removedIds: removedId ? [removedId] : [],
          rejections: [],
          diagnostics: [],
        };
      }
      case EditCommandType.RemoveTimeSignature:
        return this.removeGlobalEventAt(
          command,
          MetaType.TimeSignature,
          "time-signature",
        );
    }
  }

  private toNoteSnapshot(
    trackIndex: number,
    eventId: string,
    note: MidiNote,
  ): NoteSnapshot {
    return {
      id: formatNoteId(trackIndex, eventId),
      trackIndex,
      tick: note.start,
      pitch: note.pitch,
      duration: note.end - note.start,
      velocity: note.velocity,
    };
  }

  private resolveNote(
    id: string,
  ): { trackIndex: number; track: MidiTrack; note: MidiNote } | null {
    const parsed = parseEntityFromId(id);
    if (parsed?.type !== "note" || parsed.trackIndex === undefined) {
      return null;
    }
    const track = this.midi.tracks[parsed.trackIndex];
    if (!track) return null;
    const note = track.getNoteByEventId(parsed.eventId);
    return note ? { trackIndex: parsed.trackIndex, track, note } : null;
  }

  private requireCommandNote(
    command: GeneralCommand,
    id: EntityId,
  ): { trackIndex: number; track: MidiTrack; note: MidiNote } {
    const target = this.resolveNote(id);
    if (!target) {
      this.reject(command, "missing-note", `Note '${id}' does not exist`);
    }
    return target;
  }

  private requireTextEvent(command: GeneralCommand, id: EntityId): MidiEvent {
    const parsed = parseEntityFromId(id);
    if (parsed?.type !== "text" || parsed.trackIndex === undefined) {
      this.reject(command, "invalid-entity-id", `Text ID '${id}' is invalid`);
    }
    const event = this.midi.tracks[parsed.trackIndex]?.getEventById(
      parsed.eventId,
    );
    if (!event || event.status !== 0xff || !("text" in event)) {
      this.reject(command, "missing-text", `Text event '${id}' does not exist`);
    }
    return event;
  }

  private entityExists(id: EntityId): boolean {
    const parsed = parseEntityFromId(id);
    if (!parsed) return false;
    if (parsed.type === "note") return this.resolveNote(id) !== null;
    if (parsed.trackIndex !== undefined) {
      const event = this.midi.tracks[parsed.trackIndex]?.getEventById(
        parsed.eventId,
      );
      return Boolean(
        event &&
        event.status === 0xff &&
        (parsed.type !== "text" || "text" in event),
      );
    }
    const event = this.midi.tracks[0]?.getEventById(parsed.eventId);
    return Boolean(
      event &&
      event.status === 0xff &&
      "type" in event &&
      (parsed.type === "tempo"
        ? event.type === MetaType.Tempo
        : event.type === MetaType.TimeSignature),
    );
  }

  private validateTrackIndex(
    command: GeneralCommand,
    trackIndex: number,
  ): void {
    if (
      !Number.isSafeInteger(trackIndex) ||
      trackIndex < 0 ||
      trackIndex >= this.midi.tracks.length
    ) {
      this.reject(
        command,
        "missing-track",
        `MIDI track ${trackIndex} does not exist`,
      );
    }
  }

  private validateGlobalTick(command: GeneralCommand, tick: number): void {
    this.validateTick(command, tick);
    if (!this.midi.tracks[0]) {
      this.reject(
        command,
        "missing-global-track",
        "MIDI track 0 does not exist",
      );
    }
  }

  private validateTick(command: GeneralCommand, tick: number): void {
    if (!Number.isSafeInteger(tick) || tick < 0) {
      this.reject(
        command,
        "invalid-tick",
        "Tick must be a non-negative integer",
      );
    }
  }

  private validateInteger(
    command: GeneralCommand,
    value: number,
    name: string,
  ): void {
    if (!Number.isSafeInteger(value)) {
      this.reject(command, "invalid-integer", `${name} must be an integer`);
    }
  }

  private validateNoteFields(
    command: GeneralCommand,
    tick: number,
    pitch: number,
    duration: number,
  ): void {
    this.validateTick(command, tick);
    if (!Number.isInteger(pitch) || pitch < 0 || pitch > 127) {
      this.reject(command, "invalid-pitch", "Pitch must be 0–127");
    }
    if (!Number.isSafeInteger(duration) || duration < 1) {
      this.reject(
        command,
        "invalid-duration",
        "Duration must be a positive integer",
      );
    }
  }

  private isTextMetaType(value: number): value is TextMetaType {
    return typeof value === "number" && Boolean(TextMetaType[value]);
  }

  private globalEventAt(
    type: MetaType.Tempo | MetaType.TimeSignature,
    tick: number,
    position: "first" | "last" = "first",
  ): MidiEvent | undefined {
    const track = this.midi.tracks[0];
    if (!track) return undefined;
    const matching = track.events.filter(
      (event) =>
        event.tick === tick &&
        event.status === 0xff &&
        "type" in event &&
        event.type === type,
    );
    return position === "first" ? matching[0] : matching[matching.length - 1];
  }

  private removeGlobalEventAt(
    command: Extract<
      GeneralCommand,
      {
        type: EditCommandType.RemoveTempo | EditCommandType.RemoveTimeSignature;
      }
    >,
    type: MetaType.Tempo | MetaType.TimeSignature,
    kind: "tempo" | "time-signature",
  ): EditResult {
    const event = this.globalEventAt(type, command.tick);
    if (!event) return emptyEditResult();
    const id =
      kind === "tempo"
        ? formatTempoId(this.getTrack(0).getEventId(event))
        : formatTimeSignatureId(this.getTrack(0).getEventId(event));
    const removed =
      type === MetaType.Tempo
        ? this.midi.removeTempoEventAt(command.tick)
        : this.midi.removeTimeSignatureEventAt(command.tick);
    return {
      changed: removed,
      createdIds: [],
      updatedIds: [],
      removedIds: removed ? [id] : [],
      rejections: [],
      diagnostics: [],
    };
  }

  private reject(
    command: GeneralCommand,
    code: string,
    message: string,
  ): never {
    throw new EditRejectedError(code, message, command);
  }

  private getTrack(trackIndex: number): MidiTrack {
    if (!Number.isInteger(trackIndex) || trackIndex < 0) {
      throw new RangeError("trackIndex must be a non-negative integer");
    }
    const track = this.midi.tracks[trackIndex];
    if (!track) throw new RangeError(`MIDI track ${trackIndex} does not exist`);
    return track;
  }

  private validateNote(tick: number, pitch: number, duration: number): void {
    this.requireInteger(tick, "tick");
    this.requireInteger(pitch, "pitch");
    this.requireInteger(duration, "duration");
    if (tick < 0 || pitch < 0 || pitch > 127 || duration < 1) {
      throw new RangeError(
        "Note tick, pitch, or duration is outside its valid range",
      );
    }
  }

  private requireInteger(value: number, name: string): void {
    if (!Number.isInteger(value))
      throw new RangeError(`${name} must be an integer`);
  }
}
