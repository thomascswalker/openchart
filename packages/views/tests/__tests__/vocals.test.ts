import path from "path";
import * as fs from "fs";
import { fileURLToPath } from "url";
import { MetaType, Midi, MidiTrack } from "@openchart/midi";
import { describe, expect, it } from "vitest";
import { getPhrasePitch } from "../../src/chartEditing.js";
import { SongView, VocalTrackView } from "../../src/chartView.js";
import { defaultConfig, describeTrack } from "../../src/config.js";
import { createDefaultModeRegistry } from "../../src/editing/modes/index.js";
import { classifyVocalPitch, DEFAULT_VOCAL_LAYOUT } from "../../src/vocals.js";

function vocals(midi = new Midi()): { midi: Midi; view: VocalTrackView } {
  const view = new SongView(midi).getVocalTrackView("VOCALS")!;
  return { midi, view };
}

function lyrics(view: VocalTrackView): Array<[number, string]> {
  return view.getLyrics().map(({ tick, text }) => [tick, text]);
}

describe("vocal configuration", () => {
  it("has no difficulties and maps the special pitches", () => {
    const song = new SongView(new Midi());
    const view = song.getInstrumentTrackView("VOCALS")!;
    expect(view).toBeInstanceOf(VocalTrackView);
    expect(view.hasDifficulties()).toBe(false);
    expect(view.getCharts()).toEqual([]);
    expect(view.getChart(3)).toBeUndefined();
    const registry = createDefaultModeRegistry();
    const vocalDescriptor = describeTrack(
      defaultConfig.tracks.find((track) => track.name === "VOCALS")!,
    );
    const leadDescriptor = describeTrack(
      defaultConfig.tracks.find((track) => track.name === "LEAD GUITAR")!,
    );
    expect(registry.resolve(vocalDescriptor, "piano-roll")?.id).toBe("vocals");
    expect(registry.resolve(vocalDescriptor, "highway")).toBeNull();
    expect(registry.resolve(leadDescriptor, "highway")?.id).toBe("chart.frets");

    const layout = (view as VocalTrackView).getLayout();
    expect(layout.range).toEqual({ low: 36, high: 84 });
    expect(layout.pitchlessPlacement).toBe(85);

    const descriptor = describeTrack(
      defaultConfig.tracks.find((track) => track.name === "VOCALS")!,
    );
    expect(getPhrasePitch(descriptor, "vocal")).toBe(96);
    expect(getPhrasePitch(descriptor, "power-window")).toBe(111);
    expect(getPhrasePitch(descriptor, "stagepower")).toBe(116);
  });

  it("classifies pitched, pitchless, percussion and phrase pitches", () => {
    const layout = DEFAULT_VOCAL_LAYOUT;
    expect(classifyVocalPitch(layout, 36)).toEqual({
      type: "note",
      kind: "pitched",
    });
    expect(classifyVocalPitch(layout, 84)).toEqual({
      type: "note",
      kind: "pitched",
    });
    for (const pitch of [85, 35]) {
      expect(classifyVocalPitch(layout, pitch)).toEqual({
        type: "note",
        kind: "pitchless",
      });
    }
    expect(classifyVocalPitch(layout, 90)).toEqual({
      type: "note",
      kind: "percussion",
    });
    expect(classifyVocalPitch(layout, 96)).toEqual({
      type: "phrase",
      kind: "vocal",
    });
    expect(classifyVocalPitch(layout, 111)).toEqual({
      type: "phrase",
      kind: "power-window",
    });
    expect(classifyVocalPitch(layout, 116)).toEqual({
      type: "phrase",
      kind: "stagepower",
    });
    expect(classifyVocalPitch(layout, 23)).toEqual({ type: "unknown" });
  });
});

describe("VocalTrackView editing", () => {
  it("creates the VOCALS track lazily with a TrackName event", () => {
    const { midi, view } = vocals();
    expect(midi.getTrack("VOCALS")).toBeUndefined();
    view.addPitched(60, 480, 720, "la");
    const track = midi.getTrack("VOCALS")!;
    expect(track).toBeDefined();
    expect(
      track.getTextEvents().some((event) => event.type === MetaType.TrackName),
    ).toBe(true);
    // A saved file still maps the track back to VOCALS.
    const restored = new Midi(midi.toBuffer());
    expect(restored.getTrack("VOCALS")?.getNotes()).toHaveLength(1);
  });

  it("writes the note and its lyric on the same tick in one operation", () => {
    const { view } = vocals();
    const pitched = view.addPitched(60, 480, 720, "hel-")!;
    const pitchless = view.addPitchless(960, 1200, "lo")!;
    const low = view.addPitchless(1440, 1680, "oh", 35)!;
    const percussion = view.addPercussion(1920, 2040)!;

    expect(pitched.lyric?.tick).toBe(480);
    expect(pitchless.note.note).toBe(85);
    expect(low.note.note).toBe(35);
    expect(percussion.note.note).toBe(90);
    expect(percussion.lyric).toBeNull();
    expect(lyrics(view)).toEqual([
      [480, "hel-"],
      [960, "lo"],
      [1440, "oh"],
    ]);
    expect(view.getNotes("pitched")).toHaveLength(1);
    expect(view.getNotes().map((note) => note.kind)).toEqual([
      "pitched",
      "pitchless",
      "pitchless",
      "percussion",
    ]);
  });

  it("rejects pitched notes outside C2-C6 without touching the track", () => {
    const { midi, view } = vocals();
    expect(view.addPitched(35, 0, 120, "x")).toBeNull();
    expect(view.addPitched(85, 0, 120, "x")).toBeNull();
    expect(view.addPitched(60, 120, 120, "x")).toBeNull();
    expect(midi.getTrack("VOCALS")?.getNotes() ?? []).toHaveLength(0);
  });

  it("moves notes with their lyrics and keeps kinds in their lanes", () => {
    const { view } = vocals();
    const first = view.addPitched(60, 0, 240, "one")!;
    const second = view.addPitched(62, 480, 720, "two")!;
    const perc = view.addPercussion(960, 1080)!;

    // Swap ticks: lyrics must follow their own note, not the tick.
    const moves = [
      { note: first.note, start: 480, pitch: 100, lyric: first.lyric! },
      { note: second.note, start: 0, pitch: 20, lyric: second.lyric! },
      { note: perc.note, start: 1200, pitch: 60 },
    ];
    expect(view.moveNotes(moves)).toBe(true);

    const notes = view.getNotes();
    const byText = new Map(
      notes.map((item) => [item.lyric?.text ?? item.kind, item]),
    );
    expect(byText.get("one")!.note).toMatchObject({ start: 480, note: 84 });
    expect(byText.get("two")!.note).toMatchObject({ start: 0, note: 36 });
    expect(byText.get("percussion")!.note).toMatchObject({
      start: 1200,
      note: 90,
    });
    expect(view.validate()).toEqual([]);
  });

  it("removes lyrics with their notes and sets lyrics on existing notes", () => {
    const { view } = vocals();
    const keep = view.addPitched(60, 0, 240, "stay")!;
    const drop = view.addPitched(62, 480, 720, "go")!;
    expect(view.removeNotes([drop.note])).toBe(true);
    expect(lyrics(view)).toEqual([[0, "stay"]]);

    expect(view.setLyric(keep.note, "")).toBe(false);
    expect(view.setLyric(keep.note, "café")).toBe(true);
    expect(lyrics(view)).toEqual([[0, "café"]]);

    const bare = view.addPitched(64, 960, 1200)!;
    expect(view.validate().map((issue) => issue.type)).toEqual([
      "missing-lyric",
    ]);
    expect(view.setLyric(bare.note, "new")).toBe(true);
    expect(view.validate()).toEqual([]);
  });

  it("reports orphan and near-miss lyrics and repairs near misses", () => {
    const { midi, view } = vocals();
    const note = view.addPitched(60, 480, 720)!;
    const track = midi.getTrack("VOCALS")!;
    track.addTextEvent(MetaType.Lyric, 485, "late");
    track.addTextEvent(MetaType.Lyric, 4000, "lost");

    expect(view.validate().map((issue) => [issue.type, issue.tick])).toEqual([
      ["mismatched-tick", 485],
      ["orphan-lyric", 4000],
    ]);
    expect(view.repair()).toBe(1);
    expect(view.getVocalNote(note.note)?.lyric?.text).toBe("late");
    expect(view.validate().map((issue) => issue.type)).toEqual([
      "orphan-lyric",
    ]);
    expect(view.repair({ removeOrphans: true })).toBe(1);
    expect(view.validate()).toEqual([]);
  });

  it("creates phrases and rejects overlaps of the same kind", () => {
    const { view } = vocals();
    const phrase = view.addPhrase("vocal", 0, 960)!;
    expect(phrase).toMatchObject({ kind: "vocal", start: 0, end: 960 });
    expect(view.addPhrase("vocal", 480, 1440)).toBeNull();
    expect(view.addPhrase("vocal", 960, 1440)).not.toBeNull();
    // A different phrase kind may overlap.
    expect(view.addPhrase("stagepower", 0, 1440)).not.toBeNull();
    expect(view.addPhrase("power-window", 240, 720)).not.toBeNull();

    expect(view.updatePhrase(phrase.note, 0, 1200)).toBe(false);
    expect(view.updatePhrase(phrase.note, 120, 900)).toBe(true);
    expect(view.getPhrases("vocal").map((p) => [p.start, p.end])).toEqual([
      [120, 900],
      [960, 1440],
    ]);
    expect(view.removePhrase(phrase.note)).toBe(true);
    expect(view.getPhrases("vocal")).toHaveLength(1);
  });

  it("flags overlapping phrases and unknown pitches in loaded data", () => {
    const track = new MidiTrack("VOCALS");
    const midi = new Midi();
    midi.tracks.push(track);
    track.addNote(96, 0, 100, 960);
    track.addNote(96, 480, 100, 960, track.getInsertionIndexAt(480));
    track.addNote(23, 0, 100, 120);
    const { view } = vocals(midi);
    expect(
      view
        .validate()
        .map((issue) => issue.type)
        .sort(),
    ).toEqual(["phrase-overlap", "unknown-pitch"]);
  });
});

describe("fixture VOCALS track", () => {
  it("classifies the shipped chart and pairs every lyric", () => {
    const dir = path.dirname(fileURLToPath(import.meta.url));
    const midi = new Midi(fs.readFileSync(path.join(dir, "..", "song.mid")));
    const { view } = vocals(midi);
    expect(view.getNotes("pitched")).toHaveLength(492);
    expect(view.getNotes("pitchless")).toHaveLength(1);
    expect(view.getPhrases("vocal")).toHaveLength(48);
    expect(view.getPhrases("power-window")).toHaveLength(39);
    expect(view.getPhrases("stagepower")).toHaveLength(11);
    const issues = view.validate();
    expect(
      issues.filter((issue) => issue.type === "unknown-pitch"),
    ).toHaveLength(1);
    // Every lyric in the shipped chart sits on a note tick.
    expect(
      issues.filter((issue) => issue.type === "orphan-lyric"),
    ).toHaveLength(0);
  });
});
