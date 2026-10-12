import type { Midi, MidiNote, MidiTrack } from "@openchart/core";
import { buildNoteIndex, type PianoRollNoteIndex } from "./visibility";
import type { PianoRollNote } from "./types";

/** Owns the model-to-view note mapping and its sorted visibility index. */
export class NoteDataStore {
  private mappedNotesTrack: MidiTrack | null = null;
  private mappedNotesSource: MidiNote[] | null = null;
  private mappedNotes: PianoRollNote[] = [];
  private mappedNotesIndex: PianoRollNoteIndex | null = null;

  public getTrackNotes(midi: Midi, trackIndex: number): PianoRollNote[] {
    const track = midi.tracks[trackIndex];
    if (!track) {
      return [];
    }

    const sourceNotes = track.getNotes();
    if (
      track === this.mappedNotesTrack &&
      sourceNotes === this.mappedNotesSource
    ) {
      return this.mappedNotes;
    }

    this.mappedNotesTrack = track;
    this.mappedNotesSource = sourceNotes;
    this.mappedNotes = sourceNotes.map((note) => ({
      tick: note.start,
      durationTicks: note.end - note.start,
      pitch: note.note,
      velocity: note.velocity,
      midiNote: note,
    }));
    this.mappedNotesIndex = buildNoteIndex(this.mappedNotes);
    return this.mappedNotes;
  }

  public get currentNotes(): PianoRollNote[] {
    return this.mappedNotes;
  }

  public get currentIndex(): PianoRollNoteIndex | null {
    return this.mappedNotesIndex;
  }

  public clear(): void {
    this.mappedNotesTrack = null;
    this.mappedNotesSource = null;
    this.mappedNotes = [];
    this.mappedNotesIndex = null;
  }
}
