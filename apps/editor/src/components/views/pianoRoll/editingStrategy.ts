import type { MidiChannelEvent, MidiTrack } from "@openchart/core";
import { clamp } from "es-toolkit";
import type { CanvasPoint } from "../../../rendering/geometry";
import type { CoordinateSystem } from "./coordinates";
import type { PianoRollContext, PianoRollNote } from "./types";

export interface ResizeTarget {
  note: PianoRollNote;
  initialDuration: number;
}

export interface MoveTarget {
  note: PianoRollNote;
  initialTick: number;
  initialPitch: number;
}

export interface ClipboardNote {
  relativeTick: number;
  pitch: number;
  durationTicks: number;
  velocity: number;
  /** Lyric copied with a vocal note; pasted back onto the same tick. */
  lyric?: string;
}

export interface CreatedNote {
  noteOn: MidiChannelEvent;
  /** The note needs a lyric before the create gesture is complete. */
  needsLyric: boolean;
}

/**
 * Model mutations behind the Piano Roll's gestures. The controller owns
 * gesture state, selection and history bracketing; a strategy decides what
 * each gesture does to the MIDI data. The generic strategy edits raw pitches;
 * the vocal strategy routes everything through the vocal data model.
 */
export interface NoteEditingStrategy {
  readonly id: "generic" | "vocal";
  /** The track to edit, created on demand when `create` is true. */
  getTrack(create: boolean): MidiTrack | null;
  create(local: CanvasPoint): CreatedNote | null;
  /** Called once when a move gesture starts (e.g. to capture lyrics). */
  beginMove(targets: readonly MoveTarget[]): void;
  move(
    targets: readonly MoveTarget[],
    tickDelta: number,
    pitchDelta: number,
  ): boolean;
  resize(targets: readonly ResizeTarget[], delta: number): boolean;
  remove(notes: readonly PianoRollNote[]): boolean;
  transpose(notes: readonly PianoRollNote[], semitones: number): boolean;
  shift(notes: readonly PianoRollNote[], deltaTicks: number): boolean;
  copy(notes: readonly PianoRollNote[]): ClipboardNote[];
  paste(
    entries: readonly ClipboardNote[],
    anchorTick: number,
  ): MidiChannelEvent[];
  /** Vocal only: sets the lyric of a just-created note. */
  setLyric?(noteOn: MidiChannelEvent, text: string): boolean;
}

function insertNote(
  track: MidiTrack,
  pitch: number,
  tick: number,
  velocity: number,
  duration: number,
): MidiChannelEvent {
  const insertAt = track.getInsertionIndexAt(tick);
  const startDelta = tick - track.getAbsoluteTickAt(insertAt);
  return track.addNote(pitch, startDelta, velocity, duration, insertAt).noteOn;
}

export function copyNotes(notes: readonly PianoRollNote[]): ClipboardNote[] {
  if (notes.length === 0) return [];
  const minTick = Math.min(...notes.map((note) => note.tick));
  return notes.map((note) => ({
    relativeTick: note.tick - minTick,
    pitch: note.pitch,
    durationTicks: note.durationTicks,
    velocity: note.velocity,
  }));
}

/** Today's Piano Roll behaviour: any pitch 0-127, no note kinds. */
export class GenericEditingStrategy implements NoteEditingStrategy {
  public readonly id = "generic";
  private readonly context: PianoRollContext;
  private readonly coordinates: CoordinateSystem;

  public constructor(context: PianoRollContext, coordinates: CoordinateSystem) {
    this.context = context;
    this.coordinates = coordinates;
  }

  public getTrack(): MidiTrack | null {
    return this.context.getSelectedTrack();
  }

  public create(local: CanvasPoint): CreatedNote | null {
    const track = this.getTrack();
    if (!track) return null;
    const pitch = this.coordinates.pitchAtScreenY(local.y);
    const tick = this.coordinates.snapTick(
      this.coordinates.tickAtScreenX(local.x),
    );
    return {
      noteOn: insertNote(track, pitch, tick, 100, 1),
      needsLyric: false,
    };
  }

  public beginMove(): void {}

  public move(
    targets: readonly MoveTarget[],
    tickDelta: number,
    pitchDelta: number,
  ): boolean {
    const track = this.getTrack();
    if (!track) return false;
    let changed = false;
    for (const { note, initialTick, initialPitch } of targets) {
      changed =
        track.setNoteStart(
          note.midiNote,
          Math.max(0, initialTick + tickDelta),
        ) || changed;
      changed =
        track.setNotePitch(
          note.midiNote,
          clamp(initialPitch + pitchDelta, 0, 127),
        ) || changed;
    }
    return changed;
  }

  public resize(targets: readonly ResizeTarget[], delta: number): boolean {
    const track = this.getTrack();
    if (!track) return false;
    let changed = false;
    for (const { note, initialDuration } of targets) {
      changed =
        track.setNoteDuration(
          note.midiNote,
          Math.max(1, initialDuration + delta),
        ) || changed;
    }
    return changed;
  }

  public remove(notes: readonly PianoRollNote[]): boolean {
    const track = this.getTrack();
    if (!track) return false;
    let changed = false;
    for (const note of notes) {
      changed =
        track.removeNote(note.midiNote.noteOn, note.midiNote.noteOff) ||
        changed;
    }
    return changed;
  }

  public transpose(
    notes: readonly PianoRollNote[],
    semitones: number,
  ): boolean {
    const track = this.getTrack();
    if (!track) return false;
    let changed = false;
    for (const note of notes) {
      changed =
        track.setNotePitch(
          note.midiNote,
          clamp(note.pitch + semitones, 0, 127),
        ) || changed;
    }
    return changed;
  }

  public shift(notes: readonly PianoRollNote[], deltaTicks: number): boolean {
    const track = this.getTrack();
    if (!track) return false;
    let changed = false;
    for (const note of notes) {
      changed =
        track.setNoteStart(
          note.midiNote,
          Math.max(0, Math.round(note.tick + deltaTicks)),
        ) || changed;
    }
    return changed;
  }

  public copy(notes: readonly PianoRollNote[]): ClipboardNote[] {
    return copyNotes(notes);
  }

  public paste(
    entries: readonly ClipboardNote[],
    anchorTick: number,
  ): MidiChannelEvent[] {
    const track = this.getTrack();
    if (!track) return [];
    return entries.map((entry) =>
      insertNote(
        track,
        entry.pitch,
        Math.max(0, anchorTick + entry.relativeTick),
        entry.velocity,
        entry.durationTicks,
      ),
    );
  }
}
