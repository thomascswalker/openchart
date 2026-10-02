import path from "path";
import { fileURLToPath } from "url";
import { ChannelMessage, Midi, MidiTrack } from "@midiedit/core";
import { expect, describe, beforeAll, it } from "vitest";
import { SongView, Difficulty, Note } from "../../src/chartView.js";
import * as fs from "fs";

describe("data.json", () => {
  let midi: Midi;
  let song: SongView;

  beforeAll(async () => {
    const { default: testData } = await import("../data.json");

    const currentDir = path.dirname(fileURLToPath(import.meta.url));
    const midiPath = path.join(currentDir, "..", testData.filename);
    const content = fs.readFileSync(midiPath);
    midi = new Midi(content);
    expect(midi).toBeDefined();

    song = new SongView(midi);
  });

  it("instrument parsing", async () => {
    const lead = song.getInstrumentTrackView("LEAD GUITAR")!;
    expect(lead).toBeDefined();
    expect(
      song.getInstrumentTrackViews().map((instrument) => instrument.getName()),
    ).toEqual(["LEAD GUITAR", "RHYTHM GUITAR", "DRUMS", "VOCALS"]);
    expect(song.getInstrumentTrackView("RHYTHM GUITAR")).toBeDefined();
    expect(song.getInstrumentTrackView("DRUMS")).toBeDefined();
    expect(song.getInstrumentTrackView("VOCALS")).toBeDefined();

    const noteCounts = [
      1954, // Expert
      1425, // Hard
      980, // Medium
      661, // Easy
    ];
    lead.getCharts().forEach((chart, index) => {
      const notes = chart.getNotes();
      expect(notes.length).toBe(noteCounts[index]);
    });
  });

  it("mutates both the ChartView and its underlying MidiTrack", () => {
    const midi = new Midi();
    const track = new MidiTrack();
    track.name = "LEAD GUITAR";
    midi.tracks = [track];

    const chart = new SongView(midi)
      .getInstrumentTrackView("LEAD GUITAR")!
      .getChart(Difficulty.Expert);

    chart.addNote(Note.Green, 480, 720);

    const events = track.getChannelEvents();
    expect(events).toHaveLength(2);
    expect(events.map((event) => event.deltaTime)).toEqual([480, 240]);
    expect(events[0]?.status).toBe(0x90);
    expect(events[1]?.status).toBe(0x80);
    expect(events[0]?.messageType).toBe(ChannelMessage.NoteOn);
    expect(events[1]?.messageType).toBe(ChannelMessage.NoteOff);
    expect(events[0]?.data1).toBe(96); // Expert offset + Green lane
    expect(events[1]?.data1).toBe(96);

    const notes = chart.getNotes();
    expect(notes).toHaveLength(1);
    expect(notes[0]?.start).toBe(480);
    expect(notes[0]?.end).toBe(720);
    expect(midi.getTrack("LEAD GUITAR")?.events).toBe(track.events);

    expect(chart.removeNote(notes[0])).toBe(true);
    expect(track.events).toHaveLength(0);
    expect(chart.getNotes()).toHaveLength(0);
  });

  it("moves and resizes notes within its configured chart lanes", () => {
    const midi = new Midi();
    const track = new MidiTrack("LEAD GUITAR");
    midi.tracks = [track];

    const chart = new SongView(midi)
      .getInstrumentTrackView("LEAD GUITAR")!
      .getChart(Difficulty.Expert);
    chart.addNote(Note.Green, 480, 720);

    const note = chart.getNotes()[0]!;
    expect(chart.moveNote(note, Note.Orange, 960)).toBe(true);
    expect(chart.setNoteEnd(note, 1_680)).toBe(true);
    expect(
      chart.getNotes().map((value) => [value.note, value.start, value.end]),
    ).toEqual([[100, 960, 1_680]]);
    expect(chart.moveNote(note, 5 as Note, 1_920)).toBe(false);
    expect(chart.setNoteEnd(note, 960)).toBe(false);
  });

  it("adds a missing instrument track when its chart is first edited", () => {
    const midi = new Midi();
    const chart = new SongView(midi)
      .getInstrumentTrackView("LEAD GUITAR")!
      .getChart(Difficulty.Expert);

    chart.addNote(Note.Green, 480, 720);

    expect(midi.getTrack("LEAD GUITAR")?.getNotes()).toHaveLength(1);
  });

  it("includes the Expert drum Kick2 boundary pitch without widening other charts", () => {
    const midi = new Midi();
    const drums = new MidiTrack("DRUMS");
    const guitar = new MidiTrack("LEAD GUITAR");
    midi.tracks = [drums, guitar];
    drums.addNote(95, 0, 100, 1);
    drums.addNote(96, 0, 100, 1);
    drums.addNote(104, 0, 100, 1);
    drums.addNote(105, 0, 100, 1);
    guitar.addNote(95, 0, 100, 1);

    const song = new SongView(midi);
    const drumNotes = song
      .getInstrumentTrackView("DRUMS")!
      .getChart(Difficulty.Expert)
      .getNotes();
    const guitarNotes = song
      .getInstrumentTrackView("LEAD GUITAR")!
      .getChart(Difficulty.Expert)
      .getNotes();

    expect(drumNotes.map((note) => note.note)).toEqual([95, 96, 104]);
    expect(guitarNotes).toHaveLength(0);
    expect(
      song
        .getInstrumentTrackView("DRUMS")!
        .getChart(Difficulty.Hard)
        .getNotes()
        .map((note) => note.note),
    ).toEqual([]);
  });

  it("adds and removes Expert Kick2 without changing pitch 95", () => {
    const midi = new Midi();
    const track = new MidiTrack("DRUMS");
    midi.tracks = [track];
    const chart = new SongView(midi)
      .getInstrumentTrackView("DRUMS")!
      .getChart(Difficulty.Expert);

    expect(chart.addNoteAtPitch(95, 480, 720)).toBe(true);
    const kick2 = chart.getNotes()[0]!;
    expect(kick2.note).toBe(95);
    expect(chart.removeNote(kick2)).toBe(true);
    expect(chart.getNotes()).toEqual([]);
  });

  it("keeps MidiTrack relative timing and ChartView absolute timing separate", () => {
    const midi = new Midi();
    const track = new MidiTrack();
    track.name = "LEAD GUITAR";
    midi.tracks = [track];

    track.addNote(97, 0, 100, 960);
    track.addNote(98, 240, 100, 240);

    const chart = new SongView(midi)
      .getInstrumentTrackView("LEAD GUITAR")!
      .getChart(Difficulty.Expert);

    chart.addNote(Note.Green, 480, 720);

    expect(track.events.map((event) => event.deltaTime)).toEqual([
      0, 480, 240, 240, 240, 240,
    ]);
    expect(
      chart.getNotes().map((note) => [note.note, note.start, note.end]),
    ).toEqual([
      [97, 0, 960],
      [96, 480, 720],
      [98, 1200, 1440],
    ]);

    const added = chart.getNotes().find((note) => note.note === 96)!;
    expect(chart.removeNote(added)).toBe(true);
    expect(track.events.map((event) => event.deltaTime)).toEqual([
      0, 960, 240, 240,
    ]);
    expect(
      chart.getNotes().map((note) => [note.note, note.start, note.end]),
    ).toEqual([
      [97, 0, 960],
      [98, 1200, 1440],
    ]);
  });
});
