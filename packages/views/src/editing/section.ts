import { MetaType, type MidiTrack } from "@openchart/midi";

/**
 * Lightweight representation of a section marker in a MIDI track.
 */
export interface SectionMarker {
  /** Name of the section marker (without the `[section ]` prefix) */
  name: string;
  /** Absolute tick position of the section marker */
  tick: number;
}

/**
 * Returns all section markers in the given MIDI track.
 * A section marker is a text event that matches the pattern `[section <name>]`.
 */
export function getSections(track: MidiTrack): SectionMarker[] {
  return track
    .getTextEvents()
    .filter((event) => event.type === MetaType.Text)
    .filter((event) => /^\s*\[section\s+.+\]\s*$/i.test(event.text))
    .map((event) => ({ name: event.text, tick: event.tick }));
}

/**
 * Finds the next or previous section marker relative to the given tick.
 * @param track The MIDI track to search for section markers.
 * @param tick The reference tick to find the section marker from.
 * @param forward If true, finds the next section; if false, finds the previous
 * section.
 * @returns The found section marker, or null if none is found.
 */
export function findSection(
  track: MidiTrack,
  tick: number,
  forward: boolean,
): SectionMarker | null {
  const sections = getSections(track).sort((a, b) => a.tick - b.tick);
  if (forward) {
    return sections.find((section) => section.tick > tick) ?? null;
  }
  const reverseSections = [...sections].reverse();
  return reverseSections.find((section) => section.tick < tick) ?? null;
}
