import type { MidiMetaEvent, MidiNote, MidiTrack } from "@midiedit/core";
import { MetaType } from "@midiedit/core";

export interface NotePhrase {
  start: number;
  end: number;
  kind: "starpower" | "solo" | "forced-strum" | "forced-hopo" | "forced-tap";
}

export function groupNotesAtTick(notes: readonly MidiNote[], tick: number): MidiNote[] {
  return notes.filter((note) => note.start === tick);
}

export function moveNoteGroup(track: MidiTrack, notes: readonly MidiNote[], deltaTick: number, deltaPitch = 0): boolean {
  if (!Number.isInteger(deltaTick) || !Number.isInteger(deltaPitch)) return false;
  const keep = new Set(notes.map((note) => note.noteOn));
  let changed = false;
  for (const note of notes) {
    changed = track.setNoteStart(note, Math.max(0, note.start + deltaTick)) || changed;
    changed = track.setNotePitch(note, Math.max(0, Math.min(127, note.note + deltaPitch))) || changed;
  }
  return changed && keep.size > 0;
}

export function trimNoteAt(track: MidiTrack, note: MidiNote, tick: number): boolean {
  if (!Number.isInteger(tick) || tick <= note.start) return false;
  return track.setNoteDuration(note, Math.max(1, tick - note.start));
}

function textValue(event: MidiMetaEvent): string {
  return "text" in event.data && typeof event.data.text === "string" ? event.data.text : "";
}

export function extractSections(track: MidiTrack): Array<{ name: string; tick: number }> {
  return track.getTimedEvents()
    .filter((item) => item.event.status === 0xff && (item.event as MidiMetaEvent).type === MetaType.Marker)
    .map((item) => ({ name: textValue(item.event as MidiMetaEvent), tick: item.tick }))
    .filter((section) => /^\s*\[section\s+.+\]\s*$/i.test(section.name));
}

export function findSection(track: MidiTrack, tick: number, direction: -1 | 1): { name: string; tick: number } | null {
  const sections = extractSections(track).sort((a, b) => a.tick - b.tick);
  return direction > 0
    ? sections.find((section) => section.tick > tick) ?? null
    : [...sections].reverse().find((section) => section.tick < tick) ?? null;
}
