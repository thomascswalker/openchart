import type { MidiNote, MidiTrack } from "@openchart/midi";
import { MetaType } from "@openchart/midi";
import type { TrackDescriptor } from "./config.js";

export interface SectionMarker {
  name: string;
  tick: number;
}

export type EditablePhraseKind =
  "stagepower" | "solo" | "vocal" | "power-window";

export interface NotePhrase {
  start: number;
  end: number;
  kind: EditablePhraseKind | "forced-strum" | "forced-hopo" | "forced-tap";
}

/** `notes` config key that stores each editable phrase's MIDI pitch. */
export const PHRASE_NOTE_KEYS: Record<EditablePhraseKind, string> = {
  stagepower: "power",
  solo: "solo",
  vocal: "vocalPhrase",
  "power-window": "powerWindow",
};

export interface MidiNotePhrase extends NotePhrase {
  note: MidiNote;
}

export function getPhrasePitch(
  descriptor: TrackDescriptor,
  kind: EditablePhraseKind,
): number | null {
  const pitch = descriptor.config.notes[PHRASE_NOTE_KEYS[kind]];
  return Number.isInteger(pitch) && pitch >= 0 && pitch <= 127 ? pitch : null;
}

export function getNotePhrases(
  track: MidiTrack,
  pitch: number,
  kind: EditablePhraseKind,
): MidiNotePhrase[] {
  if (!Number.isInteger(pitch) || pitch < 0 || pitch > 127) return [];
  return track
    .getNotes({ pitch: { low: pitch, high: pitch + 1 } })
    .map((note) => ({ start: note.start, end: note.end, kind, note }));
}

export function addNotePhrase(
  track: MidiTrack,
  pitch: number,
  kind: EditablePhraseKind,
  start: number,
  end: number,
): MidiNotePhrase | null {
  if (
    !Number.isInteger(pitch) ||
    pitch < 0 ||
    pitch > 127 ||
    !Number.isInteger(start) ||
    start < 0 ||
    !Number.isInteger(end) ||
    end <= start
  ) {
    return null;
  }

  const note = track.insertNote({
    tick: start,
    pitch,
    velocity: 100,
    duration: end - start,
  });
  return { start: note.start, end: note.end, kind, note };
}

export function updateNotePhrase(
  track: MidiTrack,
  note: MidiNote,
  start: number,
  end: number,
): boolean {
  if (
    !Number.isInteger(start) ||
    start < 0 ||
    !Number.isInteger(end) ||
    end <= start
  ) {
    return false;
  }

  return track.updateNote(note, { start, duration: end - start });
}

export function removeNotePhrase(track: MidiTrack, note: MidiNote): boolean {
  return track.removeNote(note.noteOn, note.noteOff);
}

export function extractSections(track: MidiTrack): SectionMarker[] {
  const textEvents = track.getTextEventRecords();
  return textEvents
    .filter((item) => item.type === MetaType.Marker)
    .map((item) => ({
      name: item.text,
      tick: item.tick,
    }))
    .filter((section) => /^\s*\[section\s+.+\]\s*$/i.test(section.name));
}

export function findSection(
  track: MidiTrack,
  tick: number,
  direction: -1 | 1,
): SectionMarker | null {
  const sections = extractSections(track).sort((a, b) => a.tick - b.tick);
  return direction > 0
    ? (sections.find((section) => section.tick > tick) ?? null)
    : ([...sections].reverse().find((section) => section.tick < tick) ?? null);
}
