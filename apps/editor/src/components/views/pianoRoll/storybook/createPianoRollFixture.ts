import { MetaType, Midi, MidiTrack } from "@openchart/core";

export type PianoRollFixtureVariant = "populated" | "empty" | "dense";

function addNoteAt(
  track: MidiTrack,
  pitch: number,
  startTick: number,
  durationTicks: number,
  velocity = 100,
): void {
  const insertAt = track.getInsertionIndexAt(startTick);
  const startDelta = startTick - track.getAbsoluteTickAt(insertAt);
  track.addNote(pitch, startDelta, velocity, durationTicks, insertAt);
}

export function createPianoRollFixture(
  variant: PianoRollFixtureVariant = "populated",
): Midi {
  const midi = new Midi();
  midi.header.division = 480;

  const conductor = new MidiTrack("CONDUCTOR");
  const lead = new MidiTrack("LEAD GUITAR");
  const bass = new MidiTrack("BASS");
  midi.tracks.push(conductor, lead, bass);

  if (variant === "empty") return midi;

  midi.addTempoChange(0, 500_000);
  midi.addTimeSignatureChange(0, 4, 2);
  lead.addTextEvent(MetaType.Marker, 0, "[section Verse]");
  lead.addTextEvent(MetaType.Marker, 1_920, "[section Chorus]");

  const leadNotes: Array<[number, number, number, number]> = [
    [72, 0, 480, 104],
    [76, 240, 720, 96],
    [79, 480, 480, 110],
    [74, 960, 960, 100],
  ];
  if (variant === "dense") {
    midi.addTempoChange(1_920, 300_000);
    leadNotes.push(
      [77, 1_440, 240, 100],
      [81, 1_680, 240, 100],
      [84, 1_920, 480, 112],
      [79, 2_160, 720, 90],
      [72, 2_400, 480, 100],
    );
  }
  for (const [pitch, start, duration, velocity] of leadNotes) {
    addNoteAt(lead, pitch, start, duration, velocity);
  }

  addNoteAt(bass, 60, 0, 960, 105);
  addNoteAt(bass, 64, 960, 480, 98);

  return midi;
}
