# `@openchart/core`

`@openchart/core` parses, edits, and writes Standard MIDI Files. It exposes the
`Midi` and `MidiTrack` classes along with MIDI event types and tick/time
conversion utilities.

## Read and write a MIDI file

`Midi` accepts MIDI file data as a `Uint8Array`. In Node.js, `Buffer` can be
converted to the required byte array when reading a file. To write a file,
pass the serialized bytes to `writeFile`.

```ts
import { readFile, writeFile } from "node:fs/promises";
import { Midi } from "@openchart/core";

const midi = new Midi(new Uint8Array(await readFile("song.mid")));
await writeFile("copy.mid", midi.toBuffer());
```

## Add notes at absolute tick positions

`MidiTrack.addNote` takes a delta from the event at the insertion point, plus
the note duration in ticks. This helper calculates that delta for an absolute
start position. With the default 480 ticks per quarter note, each note below
lasts one quarter note.

```ts
import { MidiTrack } from "@openchart/core";

const track = new MidiTrack("Lead");

function addNoteAtTick(
  track: MidiTrack,
  pitch: number,
  start: number,
  end: number,
) {
  const insertAt = track.getInsertionIndexAt(start);
  const previousTick = track.getAbsoluteTickAt(insertAt);
  track.addNote(pitch, start - previousTick, 100, end - start, insertAt);
}

// MIDI pitches 60, 62, 63, and 65: C4, D4, D#4, and F4.
addNoteAtTick(track, 60, 0, 480);
addNoteAtTick(track, 62, 480, 960);
addNoteAtTick(track, 63, 960, 1_440);
addNoteAtTick(track, 65, 1_440, 1_920);

// Notes beginning at the same tick form a chord.
addNoteAtTick(track, 64, 0, 480);

const notes = track.getNotes();
track.removeNote(notes[0]!.noteOn, notes[0]!.noteOff);
```

## Query and edit notes

`getNotes()` returns paired notes with absolute `start` and `end` ticks. Use a
half-open pitch range (`low` inclusive, `high` exclusive) to query selected
pitches.

```ts
const cAndDNotes = track.getNotes({ pitch: { low: 60, high: 63 } });

const note = cAndDNotes[0];
if (note) {
  track.setNotePitch(note, 67); // Change the pitch to G4.
  track.setNoteStart(note, 240);
  track.setNoteDuration(note, 360);
}
```

## Set tempo and time signature

Tempo is stored as microseconds per quarter note. The MIDI time-signature
denominator is stored as a power-of-two exponent (`2` means quarter note).
These events are placed on the first MIDI track.

```ts
import { Midi, MidiTrack } from "@openchart/core";

const midi = new Midi();
midi.tracks.push(new MidiTrack("Conductor"));

midi.addTempoEvent(0, 500_000); // 120 BPM
midi.addTimeSignatureEvent(0, 4, 2); // 4/4

console.log(midi.getTempoEvents());
console.log(midi.getTimeSignatureEvents());
```

## Convert between ticks and milliseconds

Use the file's ticks-per-quarter-note division and the active tempo to convert
between timeline positions.

```ts
import { msToTicks, ticksToMs } from "@openchart/core";

import { Midi, MidiTrack, msToTicks, ticksToMs } from "@openchart/core";

const midi = new Midi();
midi.tracks.push(new MidiTrack("Conductor"));
const tempoEvents = midi.getTempoEvents();
const ticks = msToTicks(1_000, midi.header.division, tempoEvents);
const milliseconds = ticksToMs(ticks, midi.header.division, tempoEvents);
```
