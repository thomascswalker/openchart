import { Midi } from "@openchart/midi";
import { SongView } from "@openchart/views";
import { describe, expect, it } from "vitest";
import { notesForVocalFeedback } from "../playback";

describe("notesForVocalFeedback", () => {
  it("collects only pitched vocal notes, for any selected instrument", () => {
    const midi = new Midi();
    const song = new SongView(midi);
    song.ensureMidiTrack("vocals");
    const vocals = song.getVocalTrackView("VOCALS")!;
    vocals.addPhrase("vocal", 0, 1920);
    vocals.addNote("pitched", 0, 240, { pitch: 60, lyric: "la" });
    vocals.addNote("pitchless", 480, 720, { lyric: "hey" });
    vocals.addNote("percussion", 960, 1080);
    vocals.addNote("pitched", 1440, 1680, { pitch: 64, lyric: "lo" });

    const pitches = (instrument: string) =>
      notesForVocalFeedback(midi, instrument).map((note) => note.pitch);
    expect(pitches("VOCALS")).toEqual([60, 64]);
    // Editing another part still lets you hear the vocal melody.
    expect(pitches("LEAD GUITAR")).toEqual([60, 64]);
    expect(notesForVocalFeedback(null, "VOCALS")).toEqual([]);
    expect(notesForVocalFeedback(new Midi(), "VOCALS")).toEqual([]);
  });
});
