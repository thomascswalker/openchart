import { Midi } from "@openchart/midi";
import { SongView } from "@openchart/views";
import { describe, expect, it } from "vitest";
import { notesForVocalFeedback } from "../playback";

describe("notesForVocalFeedback", () => {
  it("collects only pitched vocal notes, for any selected instrument", () => {
    const midi = new Midi();
    const vocals = new SongView(midi).getVocalTrackView("VOCALS")!;
    vocals.addPhrase("vocal", 0, 1920);
    vocals.addPitched(60, 0, 240, "la");
    vocals.addPitchless(480, 720, "hey");
    vocals.addPercussion(960, 1080);
    vocals.addPitched(64, 1440, 1680, "lo");

    const pitches = (instrument: string) =>
      notesForVocalFeedback(midi, instrument).map((note) => note.note);
    expect(pitches("VOCALS")).toEqual([60, 64]);
    // Editing another part still lets you hear the vocal melody.
    expect(pitches("LEAD GUITAR")).toEqual([60, 64]);
    expect(notesForVocalFeedback(null, "VOCALS")).toEqual([]);
    expect(notesForVocalFeedback(new Midi(), "VOCALS")).toEqual([]);
  });
});
