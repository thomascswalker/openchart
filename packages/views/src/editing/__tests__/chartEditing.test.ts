import { MetaType, MidiTrack } from "@openchart/midi";
import { describe, expect, it } from "vitest";
import { getNotePhrases } from "../phrase.js";
import { getSections, findSection } from "../section.js";
import { DefaultCompiledRuleset } from "../../ruleset/compile.js";

const lead = DefaultCompiledRuleset.byKey.get("lead-guitar")!;

describe("chart phrases and sections", () => {
  it("resolves phrase pitches from the track rules", () => {
    const pitch = (id: string) =>
      lead.phrases.find((p) => p.id === id)?.pitches[0];
    expect(pitch("stagePower")).toBe(116);
    expect(pitch("solo")).toBe(118);
  });

  it("reads phrases stored as MIDI notes", () => {
    const track = new MidiTrack("LEAD GUITAR");
    track.insertNote({ tick: 480, pitch: 116, velocity: 100, duration: 480 });
    track.insertNote({ tick: 0, pitch: 60, velocity: 100, duration: 10 });

    expect(getNotePhrases(track, 116, "stagePower")).toMatchObject([
      { start: 480, end: 960, kind: "stagePower" },
    ]);
    expect(getNotePhrases(track, 200, "x")).toEqual([]);
  });

  it("extracts section markers (meta type Text) and finds the adjacent section", () => {
    const track = new MidiTrack("LEAD GUITAR");
    track.addTextEvent(MetaType.Text, 480, "[section Verse]");
    track.addTextEvent(MetaType.Text, 960, "[section Chorus]");
    track.addTextEvent(MetaType.Text, 1_440, "Bridge");
    // Markers are not sections: sections are Text events (ruleset meta type 1).
    track.addTextEvent(MetaType.Marker, 1_920, "[section Outro]");

    expect(getSections(track)).toEqual([
      { name: "[section Verse]", tick: 480 },
      { name: "[section Chorus]", tick: 960 },
    ]);
    expect(findSection(track, 500, true)).toEqual({
      name: "[section Chorus]",
      tick: 960,
    });
    expect(findSection(track, 500, false)).toEqual({
      name: "[section Verse]",
      tick: 480,
    });
  });
});
