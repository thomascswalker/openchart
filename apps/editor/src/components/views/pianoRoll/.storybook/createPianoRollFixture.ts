import { MetaType, Midi, MidiTrack } from "@openchart/midi";
import { SongView } from "@openchart/views";

/** Which sample document a story loads. */
export type PianoRollFixtureVariant =
  "populated" | "empty" | "dense" | "vocals" | "vocals-empty";

/** Inserts a note at an absolute tick, keeping the track ordered. */
function insertNote(
  track: MidiTrack,
  pitch: number,
  startTick: number,
  durationTicks: number,
  velocity = 100,
): void {
  track.insertNote({
    tick: startTick,
    pitch,
    velocity,
    duration: durationTicks,
  });
}

/**
 * A short sung line on the VOCALS track: pitched notes with lyrics (one
 * deliberately missing, to show the validation colour), a pitchless and a
 * percussion note, and one phrase of each kind.
 */
function createVocalsFixture(withNotes: boolean): Midi {
  const midi = new Midi();
  midi.header.division = 480;
  const conductor = new MidiTrack("CONDUCTOR");
  midi.tracks.push(conductor);
  midi.addTempoEvent(0, 500_000);
  midi.addTimeSignatureEvent(0, 4, 2);
  const song = new SongView(midi);
  song.ensureMidiTrack("vocals");
  const view = song.getVocalTrackView("vocals")!;
  if (!withNotes) return midi;

  view.addPhrase("vocal", 0, 3_840);
  view.addPhrase("power-window", 1_920, 3_840);
  view.addPhrase("stagepower", 2_880, 3_840);
  // Sung line as [pitch, start tick, duration ticks, lyric].
  const line: Array<[number, number, number, string | undefined]> = [
    [60, 0, 360, "Sing"],
    [62, 480, 240, "a"],
    [64, 720, 720, "song,"],
    [67, 1_920, 480, "é-"],
    [67, 2_400, 240, "+"],
    [65, 2_880, 480, undefined],
  ];
  for (const [pitch, start, duration, lyric] of line) {
    view.addNote("pitched", start, start + duration, {
      pitch,
      ...(lyric === undefined ? {} : { lyric }),
    });
  }
  view.addNote("pitchless", 3_360, 3_600, { lyric: "hey!" });
  view.addNote("percussion", 3_600, 3_720);
  return midi;
}

/**
 * Builds the sample MIDI document for a story: a populated or empty
 * guitar/bass chart, a dense variant with a tempo change, or a vocals chart.
 */
export function createPianoRollFixture(
  variant: PianoRollFixtureVariant = "populated",
): Midi {
  if (variant === "vocals" || variant === "vocals-empty") {
    return createVocalsFixture(variant === "vocals");
  }
  const midi = new Midi();
  midi.header.division = 480;

  const conductor = new MidiTrack("CONDUCTOR");
  const lead = new MidiTrack("LEAD GUITAR");
  const bass = new MidiTrack("BASS");
  midi.tracks.push(conductor, lead, bass);

  if (variant === "empty") return midi;

  midi.addTempoEvent(0, 500_000);
  midi.addTimeSignatureEvent(0, 4, 2);
  lead.addTextEvent(MetaType.Text, 0, "[section Verse]");
  lead.addTextEvent(MetaType.Text, 1_920, "[section Chorus]");

  // Lead notes as [pitch, start tick, duration ticks, velocity].
  const leadNotes: Array<[number, number, number, number]> = [
    [72, 0, 480, 104],
    [76, 240, 720, 96],
    [79, 480, 480, 110],
    [74, 960, 960, 100],
  ];
  if (variant === "dense") {
    midi.addTempoEvent(1_920, 300_000);
    leadNotes.push(
      [77, 1_440, 240, 100],
      [81, 1_680, 240, 100],
      [84, 1_920, 480, 112],
      [79, 2_160, 720, 90],
      [72, 2_400, 480, 100],
    );
  }
  for (const [pitch, start, duration, velocity] of leadNotes) {
    insertNote(lead, pitch, start, duration, velocity);
  }

  insertNote(bass, 60, 0, 960, 105);
  insertNote(bass, 64, 960, 480, 98);

  return midi;
}
