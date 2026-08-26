# Midi Edit

Typescript libraries and applications for editing and reviewing MIDI files for rhythm games.

## What's in this repo

| Type    | Name       | Description                                                                                                                                                                     |
| ------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Package | `midi`     | Core MIDI parsing (read/write) library.                                                                                                                                         |
| Package | `midiview` | MIDI view library providing non-owning "views" of MIDI data. These views provide an abstraction of the MIDI data in order to more easily interface with a specific MIDI schema. |

## Packages

### `midilib`

#### Construction

```ts
import { Midi, MidiTrack } from "@midiedit/core";

// Create in memory
const midi = new Midi();
const track = new MidiTrack("My Track");
midi.tracks.push(track);

// Load from file
const midi = Midi.fromFile("song.mid");
```

#### Mutating notes

```ts
// Place four notes (C4, D4, D#4, F4) a quarter note apart (assuming ppqn=480), starting at tick 0.
track.addNote(60 /* Pitch */, 0 /* Delta from previous note */);
track.addNote(62, 480);
track.addNote(63, 480);
track.addNote(65, 480);

// A delta of 0 means the note is placed at the same position of the previous note (creating a chord).
track.addNote(63, 0);
track.addNote(62, 0);


// Remove some notes
const notes = track.getNoteEvents();
track.removeNote(notes[0] /* NoteOn */, notes[1] /* NoteOff */);
```