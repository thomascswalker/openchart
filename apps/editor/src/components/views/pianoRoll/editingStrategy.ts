import type { MidiChannelEvent, MidiTrack } from "@openchart/midi";
import { SongView } from "@openchart/views";
import { clamp } from "es-toolkit";
import { Vector2 } from "three";
import type { CoordinateSystem } from "./coordinates";
import type { PianoRollContext, PianoRollNote } from "./types";
import type { PianoRollEditingType } from "./profile";

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
  lyric?: string;
}

export interface CreatedNote {
  noteOn: MidiChannelEvent;
  needsLyric: boolean;
}

export interface IEditingStrategy {
  readonly id: PianoRollEditingType;
  getTrack(create: boolean): MidiTrack | null;
  create(local: Vector2): CreatedNote | null;
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
  // If there's no notes, return an empty array
  if (notes.length === 0) {
    return [];
  }
  // Get the minimum tick of the specified notes
  const minTick = Math.min(...notes.map((note) => note.tick));

  // Return a copy of the specified notes with the tick converted
  // to a tick relative to the minimum tick of the original array.
  return notes.map((note) => ({
    ...note,
    relativeTick: note.tick - minTick,
  }));
}

/** Today's Piano Roll behaviour: any pitch 0-127, no note kinds. */
export class NoteEditingStrategy implements IEditingStrategy {
  public readonly id = "generic";
  private readonly context: PianoRollContext;
  private readonly coordinates: CoordinateSystem;

  public constructor(context: PianoRollContext, coordinates: CoordinateSystem) {
    this.context = context;
    this.coordinates = coordinates;
  }

  public getTrack(create = false): MidiTrack | null {
    const selected = this.context.getSelectedTrack();
    if (selected || !create) return selected;

    const midi = this.context.getMidi();
    if (!midi) return null;
    const song = new SongView(midi);
    const instrument = song.getInstrumentTrackView(
      this.context.getState().selectedInstrument,
    );
    return instrument
      ? (song.ensureMidiTrack(instrument.getKey()) ?? null)
      : null;
  }

  public create(local: Vector2): CreatedNote | null {
    const track = this.getTrack(true);
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
