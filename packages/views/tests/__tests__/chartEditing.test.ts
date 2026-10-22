import { MetaType, MidiTrack } from "@openchart/midi";
import { describe, expect, it } from "vitest";
import {
  addNotePhrase,
  extractSections,
  findSection,
  getNotePhrases,
  getPhrasePitch,
  moveNoteGroup,
  removeNotePhrase,
  updateNotePhrase,
} from "../../src/chartEditing.js";
import { defaultConfig, describeTrack } from "../../src/config.js";

const leadDescriptor = describeTrack(
  defaultConfig.tracks.find((track) => track.name === "LEAD GUITAR")!,
);

describe("chart phrase editing", () => {
  it("resolves phrase pitches from the instrument configuration", () => {
    expect(getPhrasePitch(leadDescriptor, "stagepower")).toBe(116);
    expect(getPhrasePitch(leadDescriptor, "solo")).toBe(118);
  });

  it("creates, moves, resizes, and removes a MIDI-note phrase", () => {
    const track = new MidiTrack("LEAD GUITAR");

    const phrase = addNotePhrase(track, 116, "stagepower", 480, 960);

    expect(phrase).toMatchObject({ start: 480, end: 960, kind: "stagepower" });
    expect(track.getNotes()).toHaveLength(1);
    expect(getNotePhrases(track, 116, "stagepower")).toEqual([phrase]);

    expect(updateNotePhrase(track, phrase!.note, 720, 1_200)).toBe(true);
    expect(getNotePhrases(track, 116, "stagepower")).toMatchObject([
      { start: 720, end: 1_200, kind: "stagepower" },
    ]);
    expect(track.getNotes()[0]?.noteOn).toBe(phrase!.note.noteOn);

    expect(removeNotePhrase(track, phrase!.note)).toBe(true);
    expect(track.getNotes()).toHaveLength(0);
  });

  it("rejects invalid phrase bounds without changing the track", () => {
    const track = new MidiTrack("LEAD GUITAR");

    expect(addNotePhrase(track, 116, "solo", -1, 480)).toBeNull();
    expect(addNotePhrase(track, 116, "solo", 480, 480)).toBeNull();
    expect(track.getNotes()).toHaveLength(0);

    const phrase = addNotePhrase(track, 116, "solo", 0, 480)!;
    expect(updateNotePhrase(track, phrase.note, 120, 120)).toBe(false);
    expect(getNotePhrases(track, 116, "solo")).toMatchObject([
      { start: 0, end: 480 },
    ]);
  });

  it("rolls back a phrase start if resizing fails", () => {
    const track = new MidiTrack("LEAD GUITAR");
    const phrase = addNotePhrase(track, 116, "solo", 480, 960)!;
    const setDuration = track.setNoteDuration.bind(track);
    track.setNoteDuration = () => false;

    expect(updateNotePhrase(track, phrase.note, 720, 1_200)).toBe(false);
    expect(track.getNotes()).toMatchObject([{ start: 480, end: 960 }]);
    track.setNoteDuration = setDuration;
  });

  it("moves a note group by one stable tick and pitch delta", () => {
    const track = new MidiTrack("LEAD GUITAR");
    track.addNote(96, 0, 100, 120);
    track.addNote(97, 240, 100, 120);

    expect(moveNoteGroup(track, track.getNotes(), 480, 2)).toBe(true);
    expect(
      track.getNotes().map((note) => [note.note, note.start, note.end]),
    ).toEqual([
      [98, 480, 600],
      [99, 840, 960],
    ]);
  });

  it("extracts section markers and finds the adjacent section", () => {
    const track = new MidiTrack("LEAD GUITAR");
    track.addTextEvent(MetaType.Marker, 480, "[section Verse]");
    track.addTextEvent(MetaType.Marker, 960, "[section Chorus]");
    track.addTextEvent(MetaType.Marker, 1_440, "Bridge");

    expect(extractSections(track)).toEqual([
      { name: "[section Verse]", tick: 480 },
      { name: "[section Chorus]", tick: 960 },
    ]);
    expect(findSection(track, 500, 1)).toEqual({
      name: "[section Chorus]",
      tick: 960,
    });
    expect(findSection(track, 500, -1)).toEqual({
      name: "[section Verse]",
      tick: 480,
    });
  });
});
