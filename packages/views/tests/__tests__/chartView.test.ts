import path from "path";
import { fileURLToPath } from "url";
import { Midi, MidiTrack } from "@openchart/midi";
import { expect, describe, beforeAll, it } from "vitest";
import * as fs from "fs";
import { SongView, createStandaloneEditing } from "../../src/index.js";
import { Difficulty } from "../../src/types.js";

function placeSession(midi: Midi, trackKey: string) {
  const editing = createStandaloneEditing(midi);
  const trackIndex = midi.tracks.findIndex(
    (track) => track.name === trackKey.toUpperCase().replace("-", " "),
  );
  return editing.createSession(
    {
      trackKey,
      trackIndex: trackIndex < 0 ? null : trackIndex,
      difficulty: Difficulty.Expert,
    },
    "highway",
  );
}

describe("data.json", () => {
  let midi: Midi;
  let song: SongView;

  beforeAll(async () => {
    const { default: testData } = await import("../data.json");
    const currentDir = path.dirname(fileURLToPath(import.meta.url));
    midi = new Midi(
      fs.readFileSync(path.join(currentDir, "..", testData.filename)),
    );
    song = new SongView(midi);
  });

  it("instrument parsing", () => {
    const lead = song.getInstrumentTrackView("LEAD GUITAR")!;
    expect(lead).toBeDefined();
    expect(
      song.getInstrumentTrackViews().map((instrument) => instrument.getName()),
    ).toEqual([
      "LEAD GUITAR",
      "RHYTHM GUITAR",
      "DRUMS",
      "FOUR PAD",
      "FIVE PAD",
    ]);
    expect(song.getInstrumentTrackView("RHYTHM GUITAR")).toBeDefined();
    expect(song.getInstrumentTrackView("DRUMS")).toBeDefined();
    expect(song.getVocalTrackView()?.getName()).toBe("VOCALS");
    expect(
      song
        .getInstrumentTrackView("FOUR PAD")
        ?.getChart(Difficulty.Expert)
        ?.getColumns(),
    ).toHaveLength(4);
    expect(
      song
        .getInstrumentTrackView("FIVE PAD")
        ?.getChart(Difficulty.Expert)
        ?.getColumns(),
    ).toHaveLength(5);

    const noteCounts = [1998, 1725, 1094, 685]; // Expert, Hard, Medium, Easy
    lead.getCharts().forEach((chart, index) => {
      expect(chart.getNotes().length).toBe(noteCounts[index]);
    });
  });
});

describe("SongView", () => {
  it("builds views by track kind and exposes descriptors", () => {
    const song = new SongView(new Midi());
    expect(song.getTrackDescriptors().map((d) => d.key)).toEqual([
      "chart-header",
      "global",
      "lead-guitar",
      "rhythm-guitar",
      "drums",
      "vocals",
      "four-pad",
      "five-pad",
    ]);
    expect(song.getVisibleTrackDescriptors().map((d) => d.key)).not.toContain(
      "chart-header",
    );
    expect(song.getTrackView("lead-guitar")).toBe(
      song.getTrackView("LEAD GUITAR"),
    );
    // Vocals are found even though the old config used `role: "vocals"`.
    expect(song.getVocalTrackViews()).toHaveLength(1);
  });

  it("maps four- and five-pad difficulty lanes", () => {
    const song = new SongView(new Midi());
    const columns = (name: string) =>
      song
        .getInstrumentTrackView(name)!
        .getCharts()
        .map((chart) => chart.getColumns().length);
    expect(columns("FOUR PAD")).toEqual([4, 4, 4, 4]);
    expect(columns("FIVE PAD")).toEqual([5, 5, 5, 5]);
  });

  it("lists lanes, columns and bars from the rules", () => {
    const drums = new SongView(new Midi())
      .getInstrumentTrackView("DRUMS")!
      .getChart(Difficulty.Expert)!;
    expect(drums.getColumns().map((l) => l.id)).toEqual([
      "red",
      "yellow",
      "blue",
      "green",
    ]);
    expect(drums.getBars().map((l) => l.id)).toEqual(["kick"]);
    expect(drums.getLanes()).toHaveLength(5);
  });

  it("reuses its sorted note list until the track revision changes", () => {
    const midi = new Midi();
    const track = new MidiTrack("LEAD GUITAR");
    midi.tracks = [track];
    track.addNote(96, 0, 100, 1);
    const chart = new SongView(midi)
      .getInstrumentTrackView("LEAD GUITAR")!
      .getChart(Difficulty.Expert)!;

    const cached = chart.getNotes();
    expect(chart.getNotes()).toBe(cached);
    track.addNote(97, 240, 100, 120);
    expect(chart.getNotes()).not.toBe(cached);
    expect(chart.getNotes()).toHaveLength(2);
  });

  it("classifies pitches through the chart's rules", () => {
    const chart = new SongView(new Midi())
      .getInstrumentTrackView("LEAD GUITAR")!
      .getChart(Difficulty.Expert)!;
    expect(chart.classify(96)).toMatchObject({
      kind: "laneNote",
      laneId: "green",
    });
    expect(chart.classify(101)).toMatchObject({
      kind: "marker",
      effect: "forceHopo",
    });
    expect(chart.classify(116)).toMatchObject({
      kind: "phrase",
      id: "stagePower",
    });
    expect(chart.getPhrases().map((p) => p.id)).toEqual(["solo", "stagePower"]);
  });

  it("includes the Expert drum Kick2 boundary pitch without widening other charts", () => {
    const midi = new Midi();
    const drums = new MidiTrack("DRUMS");
    const guitar = new MidiTrack("LEAD GUITAR");
    midi.tracks = [drums, guitar];
    for (const pitch of [95, 96, 104, 105]) drums.addNote(pitch, 0, 100, 1);
    guitar.addNote(95, 0, 100, 1);

    const song = new SongView(midi);
    const view = song.getInstrumentTrackView("DRUMS")!;
    expect(
      view
        .getChart(Difficulty.Expert)!
        .getNotes()
        .map((n) => n.pitch),
    ).toEqual([95, 96, 104]);
    expect(
      song
        .getInstrumentTrackView("LEAD GUITAR")!
        .getChart(Difficulty.Expert)!
        .getNotes(),
    ).toHaveLength(0);
    expect(view.getChart(Difficulty.Hard)!.getNotes()).toEqual([]);
  });

  it("materialises a missing configured track with a TrackName event", () => {
    const midi = new Midi();
    const song = new SongView(midi);
    const track = song.ensureMidiTrack("lead-guitar")!;
    expect(track.name).toBe("LEAD GUITAR");
    expect(midi.getTrack("LEAD GUITAR")).toBe(track);
    expect(song.ensureMidiTrack("chart-header")).toBeUndefined();
    expect(song.getUnmappedMidiTracks()).toHaveLength(0);
  });
});

describe("editing through a session", () => {
  it("creates the track on the first placed note and keeps relative timing", () => {
    const midi = new Midi();
    midi.tracks = [new MidiTrack("")]; // sync track; a MIDI file needs a track
    const session = placeSession(midi, "lead-guitar");
    const result = session.execute({
      type: "PLACE_CHART_NOTE",
      lane: 0,
      tick: 480,
      endTick: 720,
      placement: "normal",
      cutPolicy: "none",
    });
    expect(result.changed).toBe(true);

    const track = midi.getTrack("LEAD GUITAR")!;
    const chart = new SongView(midi)
      .getInstrumentTrackView("LEAD GUITAR")!
      .getChart(Difficulty.Expert)!;
    const notes = chart.getNotes();
    expect(notes.map((n) => [n.pitch, n.start, n.end])).toEqual([
      [96, 480, 720],
    ]);
    expect(track.getNotes()).toHaveLength(1);
  });
});
