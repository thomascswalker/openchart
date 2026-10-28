import type { MidiNote, MidiTrack } from "@openchart/midi";

/** A phrase span read from a MIDI track. `kind` is a phrase id or kind name. */
export interface NotePhrase {
  start: number;
  end: number;
  kind: string;
}

export interface MidiNotePhrase extends NotePhrase {
  note: MidiNote;
}

/** Reads the phrases stored as notes on `pitch`. */
export function getNotePhrases(
  track: MidiTrack,
  pitch: number,
  kind: string,
): MidiNotePhrase[] {
  if (!Number.isInteger(pitch) || pitch < 0 || pitch > 127) return [];
  return track
    .getNotes({ pitch: { low: pitch, high: pitch + 1 } })
    .map((note) => ({ start: note.start, end: note.end, kind, note }));
}
