import type { MidiChannelEvent, MidiTrack } from "@openchart/core";
import { clamp } from "es-toolkit";
import type { Vector2 } from "three";
import {
  DefaultNoteVelocity,
  MaximumMidiPitch,
  MinimumMidiPitch,
  NewNoteDurationTicks,
} from "../constants";
import type { CoordinateSystem } from "../coordinates";
import type { PianoRollContext, PianoRollNote } from "../types";
import {
  type IEditContext,
  insertNote,
  applyToEach,
  copyNotes,
} from "./context";
import {
  type ClipboardNote,
  type CreatedNote,
  type MoveTarget,
  type ResizeTarget,
} from "./types";

/** Today's Piano Roll behaviour: any pitch 0-127, no note kinds. */
export class DefaultEditContext implements IEditContext {
  public readonly id = "default";

  /** Supplies the selected track and document state. */
  private readonly context: PianoRollContext;

  /** Converts canvas positions to ticks and pitches. */
  private readonly coordinates: CoordinateSystem;

  public constructor(context: PianoRollContext, coordinates: CoordinateSystem) {
    this.context = context;
    this.coordinates = coordinates;
  }

  /** The selected track; the default strategy never creates one. */
  public getTrack(): MidiTrack | null {
    return this.context.getSelectedTrack();
  }

  /** The default strategy requires an existing track. */
  public canCreateTrack(): boolean {
    return false;
  }

  /** Inserts a one-tick note at the snapped tick and pitch under `local`. */
  public create(local: Vector2): CreatedNote | null {
    const track = this.getTrack();
    if (!track) {
      return null;
    }

    const pitch = this.coordinates.pitchAtScreenY(local.y);
    const tick = this.coordinates.snapTick(
      this.coordinates.tickAtScreenX(local.x),
    );

    return {
      noteOn: insertNote(track, {
        pitch,
        tick,
        velocity: DefaultNoteVelocity,
        durationTicks: NewNoteDurationTicks,
      }),
      needsLyric: false,
    };
  }

  /** Default notes carry no extra state to capture when a move begins. */
  public beginMove(): void {}

  /** Moves each target by the deltas, clamped to ticks >= 0 and valid pitches. */
  public move(
    targets: readonly MoveTarget[],
    tickDelta: number,
    pitchDelta: number,
  ): boolean {
    return this.updateEach(targets, (track, target) => {
      const startChanged = track.setNoteStart(
        target.note.midiNote,
        Math.max(0, target.initialTick + tickDelta),
      );
      const pitchChanged = track.setNotePitch(
        target.note.midiNote,
        this.clampMidiPitch(target.initialPitch + pitchDelta),
      );

      return startChanged || pitchChanged;
    });
  }

  /** Resizes each target by `delta`, keeping durations at least one tick. */
  public resize(targets: readonly ResizeTarget[], delta: number): boolean {
    return this.updateEach(targets, (track, target) =>
      track.setNoteDuration(
        target.note.midiNote,
        Math.max(1, target.initialDuration + delta),
      ),
    );
  }

  /** Deletes the given notes from the track. */
  public remove(notes: readonly PianoRollNote[]): boolean {
    return this.updateEach(notes, (track, note) =>
      track.removeNote(note.midiNote.noteOn, note.midiNote.noteOff),
    );
  }

  /** Shifts each note's pitch by `semitones`, clamped to valid pitches. */
  public transpose(
    notes: readonly PianoRollNote[],
    semitones: number,
  ): boolean {
    return this.updateEach(notes, (track, note) =>
      track.setNotePitch(
        note.midiNote,
        this.clampMidiPitch(note.pitch + semitones),
      ),
    );
  }

  /** Shifts each note's start by `deltaTicks`, never before tick 0. */
  public shift(notes: readonly PianoRollNote[], deltaTicks: number): boolean {
    return this.updateEach(notes, (track, note) =>
      track.setNoteStart(
        note.midiNote,
        Math.max(0, Math.round(note.tick + deltaTicks)),
      ),
    );
  }

  /** Captures notes for the clipboard. */
  public copy(notes: readonly PianoRollNote[]): ClipboardNote[] {
    return copyNotes(notes);
  }

  /** Inserts clipboard notes starting at `anchorTick`. */
  public paste(
    entries: readonly ClipboardNote[],
    anchorTick: number,
  ): MidiChannelEvent[] {
    const track = this.getTrack();
    if (!track) return [];

    return entries.map((entry) =>
      insertNote(track, {
        pitch: entry.pitch,
        tick: Math.max(0, anchorTick + entry.relativeTick),
        velocity: entry.velocity,
        durationTicks: entry.durationTicks,
      }),
    );
  }

  /**
   * Runs `apply` for each item against the selected track and reports whether
   * any call changed the track. Returns false when there is no track.
   */
  private updateEach<T>(
    items: readonly T[],
    apply: (track: MidiTrack, item: T) => boolean,
  ): boolean {
    const track = this.getTrack();
    if (!track) {
      return false;
    }

    return applyToEach(items, (item) => apply(track, item));
  }

  /** Clamps a pitch to the 0-127 MIDI range. */
  private clampMidiPitch(pitch: number): number {
    return clamp(pitch, MinimumMidiPitch, MaximumMidiPitch);
  }
}
