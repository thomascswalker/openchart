import { type MidiTrack, MetaType } from "@openchart/midi";

export interface SectionMarker {
  name: string;
  tick: number;
}
export function extractSections(track: MidiTrack): SectionMarker[] {
  return track
    .getTextEvents()
    .filter((event) => event.type === MetaType.Text)
    .map((event) => ({ name: event.text, tick: event.tick }))
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
