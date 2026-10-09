# `@midiedit/views`

`@midiedit/views` provides non-owning, chart-oriented views over MIDI data.
`SongView` maps MIDI tracks to configured instrument tracks and exposes
difficulty-specific `ChartView` objects. Edits made through a chart update the
underlying `MidiTrack`.

## Build a chart view

The default configuration describes common rhythm-game tracks and their MIDI
pitch ranges. Track names in the MIDI file are matched to configured track
names.

```ts
import { readFile } from "node:fs/promises";
import { Midi } from "@midiedit/core";
import { Difficulty, Note, SongView } from "@midiedit/views";

const midi = new Midi(new Uint8Array(await readFile("song.mid")));
const song = new SongView(midi);

const lead = song.getInstrumentTrackView("LEAD GUITAR");
if (!lead) throw new Error("The default configuration has no lead guitar");

const expert = lead.getChart(Difficulty.Expert);
console.log(expert.getNotes());

// Lane values are zero-based: Green is lane 0, Red lane 1, and so on.
expert.addNote(Note.Green, 480, 720);
```

Import `readFile` from `node:fs/promises` when loading a file in Node.js.

## Read and edit notes by lane

`ChartView` exposes chart lanes rather than raw MIDI pitches. The configured
offset determines each difficulty's MIDI pitch range. Notes use absolute ticks.

```ts
const notes = expert.getNotes();
const firstNote = notes[0];
if (firstNote) {
  expert.moveNote(firstNote, Note.Red, 960);
  expert.setNoteEnd(firstNote, 1_200);
  expert.removeNote(firstNote);
}
```

For example, the default lead-guitar Expert chart begins at MIDI pitch 96, so
`Note.Green` maps to pitch 96. `ChartView.addNoteAtPitch` can be used when the
raw pitch is already known; it validates that the pitch belongs to that chart.

## Inspect tracks and configure a view

`getVisibleTrackDescriptors()` returns the configured tracks suitable for a
track list or editor navigation. You can also load a configuration from JSON;
invalid JSON is reported to the console and returns `undefined`.

```ts
import { readFile } from "node:fs/promises";
import { defaultConfig, loadConfig } from "@midiedit/views";

const descriptors = song.getVisibleTrackDescriptors();
console.log(descriptors.map(({ key, name, type }) => ({ key, name, type })));

const config = loadConfig(await readFile("chart-view.json", "utf8"));
if (config) {
  const customSong = new SongView(midi, config);
}

// The default configuration can also be passed explicitly.
const defaultSong = new SongView(midi, defaultConfig);
```

Configuration contains a song name, ticks per quarter note, and track
definitions. Instrument definitions include a name, a `notes` map, and
optionally difficulty `offsets` and a `noteCount`. `describeTrack` converts a
track definition into a descriptor with a stable key and default visibility
and editability.

## Edit chart phrases

The `chartEditing` helpers operate directly on a `MidiTrack`. They can add,
move, resize, and remove special-note phrases, and find section marker events.

```ts
import { MidiTrack } from "@midiedit/core";
import { addNotePhrase, findSection, updateNotePhrase } from "@midiedit/views";

const track = new MidiTrack("LEAD GUITAR");
const phrase = addNotePhrase(track, 116, "stagepower", 480, 1_440);

if (phrase) {
  updateNotePhrase(track, phrase.note, 720, 1_680);
}

const nextSection = findSection(track, 720, 1);
```

Phrase start and end values are absolute ticks. `findSection` looks for MIDI
marker text matching `[section name]`.
