import type { Midi, MidiNote, MidiTrack } from "@openchart/midi";
import {
  addNotePhrase,
  type EditablePhraseKind,
  getPhrasePitch,
  updateNotePhrase,
} from "../chartEditing.js";
import type { TrackDescriptor } from "../config.js";
import type { ChartEditAction } from "./action.js";

export type PhrasePitchResolver = (
  trackIndex: number,
  phraseType: EditablePhraseKind,
) => number | null;

export interface NoteSnapshot {
  id: string;
  trackIndex: number;
  tick: number;
  pitch: number;
  duration: number;
  velocity: number;
}

const PhraseKinds: readonly EditablePhraseKind[] = [
  "stagepower",
  "solo",
  "vocal",
  "power-window",
];

/** Headless command executor over the editor's MIDI-backed chart document. */
export class ChartDocument {
  private readonly midi: Midi;
  private readonly resolvePhrasePitch: PhrasePitchResolver;

  public constructor(midi: Midi, resolvePhrasePitch: PhrasePitchResolver) {
    this.midi = midi;
    this.resolvePhrasePitch = resolvePhrasePitch;
  }

  /** @deprecated Removed in Phase 10; resolve phrase pitches through a mode. */
  public static phrasePitchResolver(
    descriptors: readonly TrackDescriptor[],
    trackIndices: ReadonlyMap<string, number>,
  ): PhrasePitchResolver {
    return (trackIndex, phraseType) => {
      const descriptor = descriptors.find(
        (item) => trackIndices.get(item.key) === trackIndex,
      );
      return descriptor ? getPhrasePitch(descriptor, phraseType) : null;
    };
  }

  public getNoteId(trackIndex: number, note: MidiNote): string {
    const track = this.getTrack(trackIndex);
    return `note:${trackIndex}:${track.getEventId(note.noteOn)}`;
  }

  public getNote(id: string): NoteSnapshot | null {
    const target = this.resolveNote(id);
    if (!target) return null;
    const { trackIndex, note } = target;
    return {
      id,
      trackIndex,
      tick: note.start,
      pitch: note.note,
      duration: note.end - note.start,
      velocity: note.velocity,
    };
  }

  public apply(action: ChartEditAction): boolean {
    switch (action.type) {
      case "MOVE_NOTES":
        return this.moveNotes(
          action.targetIds,
          action.tickDelta,
          action.trackDelta,
        );
      case "RESIZE_NOTES":
        return this.resizeNotes(action.targetIds, action.durationDelta);
      case "ADD_NOTE":
        return this.addNote(action);
      case "DELETE_SELECTION":
        return this.deleteNotes(action.targetIds);
      case "CREATE_PHRASE":
        return this.createPhrase(action);
      case "RESIZE_PHRASE":
        return this.resizePhrase(action);
    }
  }

  private moveNotes(
    targetIds: readonly string[],
    tickDelta: number,
    trackDelta: number,
  ): boolean {
    this.requireInteger(tickDelta, "tickDelta");
    this.requireInteger(trackDelta, "trackDelta");
    let changed = false;
    for (const id of targetIds) {
      const target = this.resolveNote(id);
      if (!target) continue;
      const { track, note } = target;
      const start = Math.max(0, note.start + tickDelta);
      changed =
        track.updateNote(note, {
          start,
          duration: note.end - note.start,
          pitch: Math.max(0, Math.min(127, note.note + trackDelta)),
        }) || changed;
    }
    return changed;
  }

  private resizeNotes(
    targetIds: readonly string[],
    durationDelta: number,
  ): boolean {
    this.requireInteger(durationDelta, "durationDelta");
    let changed = false;
    for (const id of targetIds) {
      const target = this.resolveNote(id);
      if (!target) continue;
      changed =
        target.track.setNoteDuration(
          target.note,
          Math.max(1, target.note.end - target.note.start + durationDelta),
        ) || changed;
    }
    return changed;
  }

  private addNote(
    action: Extract<ChartEditAction, { type: "ADD_NOTE" }>,
  ): boolean {
    this.validateNote(action.tick, action.pitch, action.duration);
    const track = this.getTrack(action.trackIndex);
    track.addNoteAt({
      tick: action.tick,
      pitch: action.pitch,
      velocity: action.velocity,
      duration: action.duration,
    });
    return true;
  }

  private deleteNotes(targetIds: readonly string[]): boolean {
    let changed = false;
    for (const id of targetIds) {
      const target = this.resolveNote(id);
      if (!target) continue;
      changed =
        target.track.removeNote(target.note.noteOn, target.note.noteOff) ||
        changed;
    }
    return changed;
  }

  private createPhrase(
    action: Extract<ChartEditAction, { type: "CREATE_PHRASE" }>,
  ): boolean {
    this.requireInteger(action.startTick, "startTick");
    this.requireInteger(action.duration, "duration");
    if (action.startTick < 0 || action.duration < 1) {
      throw new RangeError(
        "Phrase start must be non-negative and duration positive",
      );
    }
    const pitch = this.resolvePhrasePitch(action.trackIndex, action.phraseType);
    if (pitch === null) {
      throw new Error(
        `No MIDI pitch is configured for phrase type '${action.phraseType}' on track ${action.trackIndex}`,
      );
    }
    const phrase = addNotePhrase(
      this.getTrack(action.trackIndex),
      pitch,
      action.phraseType,
      action.startTick,
      action.startTick + action.duration,
    );
    return phrase !== null;
  }

  private resizePhrase(
    action: Extract<ChartEditAction, { type: "RESIZE_PHRASE" }>,
  ): boolean {
    this.requireInteger(action.startDelta, "startDelta");
    this.requireInteger(action.durationDelta, "durationDelta");
    const target = this.resolveNote(action.targetId);
    if (!target) return false;
    const isPhrase = PhraseKinds.some(
      (phraseType) =>
        this.resolvePhrasePitch(target.trackIndex, phraseType) ===
        target.note.note,
    );
    if (!isPhrase) return false;
    const start = target.note.start + action.startDelta;
    const duration = target.note.end - target.note.start + action.durationDelta;
    return (
      start >= 0 &&
      duration >= 1 &&
      updateNotePhrase(target.track, target.note, start, start + duration)
    );
  }

  private resolveNote(
    id: string,
  ): { trackIndex: number; track: MidiTrack; note: MidiNote } | null {
    const match = /^note:(\d+):(.+)$/.exec(id);
    if (!match) return null;
    const trackIndex = Number(match[1]);
    if (!Number.isSafeInteger(trackIndex)) return null;
    const track = this.midi.tracks[trackIndex];
    if (!track) return null;
    const eventId = match[2]!;
    const note = track.getNoteByEventId(eventId);
    return note ? { trackIndex, track, note } : null;
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
