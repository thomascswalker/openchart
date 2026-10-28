# `@openchart/views`

`@openchart/views` provides non-owning, chart-oriented views over MIDI data.
`SongView` maps MIDI tracks to configured instrument tracks and exposes
difficulty-specific `ChartView` objects. Edits made through a chart update the
underlying `MidiTrack`.

## Build a chart view

`SongView` is built from a compiled ruleset (the bundled default unless you pass
one). Track names in the MIDI file are matched to the ruleset's track names.

```ts
import { readFile } from "node:fs/promises";
import { Midi } from "@openchart/midi";
import { Difficulty, SongView } from "@openchart/views";

const midi = new Midi(new Uint8Array(await readFile("song.mid")));
const song = new SongView(midi);

const lead = song.getInstrumentTrackView("LEAD GUITAR");
if (!lead) throw new Error("The ruleset has no lead guitar");

const expert = lead.getChart(Difficulty.Expert)!;
console.log(expert.getNotes());
```

## Read charts

Views are read-only. `ChartView` exposes the ruleset's lanes (`getLanes`,
`getColumns`, `getBars`), notes, phrases (`getPhrases`) and `classify(pitch)`,
which says what a MIDI pitch means on that difficulty (lane note, marker,
phrase, reserved, unknown, ...). Edits go through an editing session
(`createStandaloneEditing`), which validates every change against the ruleset.

## Inspect tracks and load a ruleset

```ts
import { compileRuleset, loadRuleset, SongView } from "@openchart/views";

console.log(
  song
    .getVisibleTrackDescriptors()
    .map(({ key, name, kind }) => ({ key, name, kind })),
);

const loaded = loadRuleset(await readFile("ruleset.json", "utf8"));
if (loaded.ok) {
  const customSong = new SongView(midi, compileRuleset(loaded.ruleset));
} else {
  console.error(loaded.issues); // schema and cross-reference problems
}
```

Rulesets follow `configs/schema.json` (mirrored by `newConfig.ts`, with the
schema's cross-reference checks). `DefaultRuleset` and `DefaultCompiledRuleset`
are the bundled defaults.

## Phrases and sections

Phrases are notes on the pitches the ruleset assigns to them; create and move
them with `CREATE_PHRASE` / `UPDATE_PHRASE` through an editing session (below).
`getNotePhrases(track, pitch, kind)` reads them back, and `findSection` looks
for `[section name]` text events (MIDI meta type Text, as the ruleset defines).

## Build an editing session

The editor uses editing modes and sessions so a view can preview a gesture,
commit it as one transaction, or cancel it without changing MIDI. A mode
expands domain commands such as phrase edits into validated raw MIDI commands.
Every command is checked by the rule enforcer before it is applied: an
`error` violation rejects the edit (`rule:<ruleId>`), warnings are returned in
`result.diagnostics`. The session also provides the mode's projection, selection, and shared
clipboard.

```ts
import { Midi } from "@openchart/midi";
import { createStandaloneEditing, Difficulty } from "@openchart/views";

const midi = new Midi();
const leadTrackIndex = midi.addTrack();
midi.tracks[leadTrackIndex]!.name = "LEAD GUITAR";

const editing = createStandaloneEditing(midi);
const session = editing.createSession(
  {
    trackKey: "lead-guitar",
    trackIndex: leadTrackIndex,
    difficulty: Difficulty.Expert,
  },
  "highway",
);

const gesture = session.beginGesture();
gesture.preview({
  type: "PLACE_CHART_NOTE",
  lane: 0,
  tick: 480,
  placement: "normal",
  cutPolicy: "all",
});
const result = gesture.commit();
```

Use `gesture.cancel()` when the pointer operation is abandoned. For a
single-step edit, call `session.execute(command)` instead. Editor UI code uses
the app's `EditingService`, which binds sessions to document history and
playback; `createStandaloneEditing` is for tests and embedded tools.

For mode and view implementation walkthroughs, see
[Adding a mode](../../docs/editing/ADDING_A_MODE.md) and
[Adding a view](../../docs/editing/ADDING_A_VIEW.md).
