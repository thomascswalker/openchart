import { Midi } from "@openchart/midi";
import { SongView, VocalNoteKind, VocalPhraseKind } from "@openchart/views";
import { describe, expect, it } from "vitest";
import { notesForVocalFeedback } from "../playback";

describe("notesForVocalFeedback", () => {
  it("collects only pitched vocal notes, for any selected instrument", () => {
    const midi = new Midi();
    const song = new SongView(midi);
    song.ensureMidiTrack("vocals");
    const vocals = song.getVocalTrackView("VOCALS")!;
    vocals.addPhrase(VocalPhraseKind.Vocal, 0, 1920);
    vocals.addNote(VocalNoteKind.Pitched, 0, 240, {
      pitch: 60,
      lyric: "la",
    });
    vocals.addNote(VocalNoteKind.Pitchless, 480, 720, { lyric: "hey" });
    vocals.addNote(VocalNoteKind.Percussion, 960, 1080);
    vocals.addNote(VocalNoteKind.Pitched, 1440, 1680, {
      pitch: 64,
      lyric: "lo",
    });

    const pitches = (instrument: string) =>
      notesForVocalFeedback(midi, instrument).map((note) => note.pitch);
    expect(pitches("VOCALS")).toEqual([60, 64]);
    // Editing another part still lets you hear the vocal melody.
    expect(pitches("LEAD GUITAR")).toEqual([60, 64]);
    expect(notesForVocalFeedback(null, "VOCALS")).toEqual([]);
    expect(notesForVocalFeedback(new Midi(), "VOCALS")).toEqual([]);
  });
});
