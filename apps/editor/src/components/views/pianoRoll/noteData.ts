import type { Midi, MidiNote, MidiTrack } from "@openchart/midi";
import { formatNoteId } from "@openchart/views";
import {
  buildNoteIndex,
  type PianoRollNoteIndex,
} from "./rendering/visibility";
import type { PianoRollNote } from "./types";

/** Converts a MIDI note into the piano roll's flattened representation. */
export function toPianoRollNote(
  track: MidiTrack,
  trackIndex: number,
  note: MidiNote,
): PianoRollNote {
  return {
    id: formatNoteId(trackIndex, track.getEventId(note.noteOn)),
    tick: note.start,
    durationTicks: note.end - note.start,
    pitch: note.pitch,
    velocity: note.velocity,
    midiNote: note,
  };
}

/** Owns the model-to-view note mapping and its sorted visibility index. */
export class NoteDataStore {
  /** Track the cached mapping was built for. */
  private mappedNotesTrack: MidiTrack | null = null;

  /** The track's note list at the time of mapping; compared by identity. */
  private mappedNotesSource: MidiNote[] | null = null;

  /** Piano-roll notes mapped from the source list. */
  private mappedNotes: PianoRollNote[] = [];

  /** Visibility index over `mappedNotes`. */
  private mappedNotesIndex: PianoRollNoteIndex | null = null;

  /**
   * Returns the piano-roll notes of a track, remapping only when the track or
   * its note list changed. Returns an empty list for an unknown track.
   */
  public getTrackNotes(midi: Midi, trackIndex: number): PianoRollNote[] {
    const track = midi.tracks[trackIndex];
    if (!track) return [];

    const sourceNotes = track.getNotes();
    if (this.isCachedFor(track, sourceNotes)) return this.mappedNotes;

    this.mapNotes(track, trackIndex, sourceNotes);
    return this.mappedNotes;
  }

  /** Notes produced by the most recent mapping. */
  public get currentNotes(): PianoRollNote[] {
    return this.mappedNotes;
  }

  /** Visibility index of the most recent mapping, if any. */
  public get currentIndex(): PianoRollNoteIndex | null {
    return this.mappedNotesIndex;
  }

  /** Forgets the cached mapping. */
  public clear(): void {
    this.mappedNotesTrack = null;
    this.mappedNotesSource = null;
    this.mappedNotes = [];
    this.mappedNotesIndex = null;
  }

  /** True when the cache was built from exactly this track and note list. */
  private isCachedFor(track: MidiTrack, sourceNotes: MidiNote[]): boolean {
    return (
      track === this.mappedNotesTrack && sourceNotes === this.mappedNotesSource
    );
  }

  /** Rebuilds the cached mapping and its visibility index. */
  private mapNotes(
    track: MidiTrack,
    trackIndex: number,
    sourceNotes: MidiNote[],
  ): void {
    this.mappedNotesTrack = track;
    this.mappedNotesSource = sourceNotes;
    this.mappedNotes = sourceNotes.map((note) =>
      toPianoRollNote(track, trackIndex, note),
    );
    this.mappedNotesIndex = buildNoteIndex(this.mappedNotes);
  }
}
