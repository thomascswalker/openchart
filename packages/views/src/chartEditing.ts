import type {
  MidiMetaEvent,
  MidiNote,
  MidiTrack,
  TextMidiEvent,
} from "@openchart/midi";
import { MetaType } from "@openchart/midi";
import type { TrackDescriptor } from "./config.js";

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

  const insertAt = track.getInsertionIndexAt(start);
  const previousTick = track.getAbsoluteTickAt(insertAt);
  const events = track.addNote(
    pitch,
    start - previousTick,
    100,
    end - start,
    insertAt,
  );
  const note = track
    .getNotes()
    .find((candidate) => candidate.noteOn === events.noteOn);
  return note ? { start: note.start, end: note.end, kind, note } : null;
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

  const originalStart = note.start;
  if (!track.setNoteStart(note, start)) return false;
  if (track.setNoteDuration(note, end - start)) return true;
  track.setNoteStart(note, originalStart);
  return false;
}

export function removeNotePhrase(track: MidiTrack, note: MidiNote): boolean {
  return track.removeNote(note.noteOn, note.noteOff);
}

export function groupNotesAtTick(
  notes: readonly MidiNote[],
  tick: number,
): MidiNote[] {
  return notes.filter((note) => note.start === tick);
}

export function moveNoteGroup(
  track: MidiTrack,
  notes: readonly MidiNote[],
  deltaTick: number,
  deltaPitch = 0,
): boolean {
  if (!Number.isInteger(deltaTick) || !Number.isInteger(deltaPitch))
    return false;
  const keep = new Set(notes.map((note) => note.noteOn));
  let changed = false;
  for (const note of notes) {
    changed =
      track.setNoteStart(note, Math.max(0, note.start + deltaTick)) || changed;
    changed =
      track.setNotePitch(
        note,
        Math.max(0, Math.min(127, note.note + deltaPitch)),
      ) || changed;
  }
  return changed && keep.size > 0;
}

export function trimNoteAt(
  track: MidiTrack,
  note: MidiNote,
  tick: number,
): boolean {
  if (!Number.isInteger(tick) || tick <= note.start) return false;
  return track.setNoteDuration(note, Math.max(1, tick - note.start));
}

function textValue(event: MidiMetaEvent | TextMidiEvent): string {
  return "text" in event ? event.text : "";
}

export function extractSections(
  track: MidiTrack,
): Array<{ name: string; tick: number }> {
  return track
    .getTimedEvents()
    .filter(
      (item) =>
        item.event.status === 0xff &&
        (item.event as MidiMetaEvent | TextMidiEvent).type === MetaType.Marker,
    )
    .map((item) => ({
      name: textValue(item.event as MidiMetaEvent | TextMidiEvent),
      tick: item.tick,
    }))
    .filter((section) => /^\s*\[section\s+.+\]\s*$/i.test(section.name));
}

export function findSection(
  track: MidiTrack,
  tick: number,
  direction: -1 | 1,
): { name: string; tick: number } | null {
  const sections = extractSections(track).sort((a, b) => a.tick - b.tick);
  return direction > 0
    ? (sections.find((section) => section.tick > tick) ?? null)
    : ([...sections].reverse().find((section) => section.tick < tick) ?? null);
}
