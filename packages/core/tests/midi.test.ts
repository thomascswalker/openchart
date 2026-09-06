import path from "path";
import { Midi, MidiTrack } from "../src/midi.js";
import { expect, test } from "vitest";
import * as fs from "fs";
import { ChannelMessage, MidiChannelEvent } from "../src/types.js";

test("is constructed", () => {
  const midi = new Midi();
  expect(midi).toBeDefined();
});

test("read file", async () => {
  const { default: testData } = await import("./data.json");

  const currentDir = path.dirname(new URL(import.meta.url).pathname);
  const midiPath = path.join(currentDir, testData.filename);
  const content = fs.readFileSync(midiPath);
  const midi = new Midi(content);

  const header = midi.header;
  expect(header.format).toBe(testData.header.format);
  expect(header.trackCount).toBe(testData.header.trackCount);
  expect(header.division).toBe(testData.header.division);

  expect(midi.tracks).toHaveLength(9);
  expect(
    midi.tracks.every((t, i) => t.events.length === testData.trackLengths[i]),
  ).toBe(true);
  expect(midi.tracks.every((t, i) => t.name === testData.trackNames[i])).toBe(
    true,
  );
});

test("write file", async () => {
  const midi = new Midi();
  const track = new MidiTrack();
  midi.tracks = [track];

  track.addNote(50, 0);
  track.addNote(52, 120);
  track.addNote(53, 120);
  track.addNote(55, 120);

  expect(track.getNoteEvents().length).toBe(8);

  // Write the MIDI to a file
  const outPath = "./test-write.mid";
  const outData = midi.toBuffer();
  fs.writeFileSync(outPath, outData);

  // Re-read the file we just wrote
  const content = fs.readFileSync(outPath);
  const writtenMidi = new Midi(content);
  expect(writtenMidi).toBeDefined();

  // Delete the file
  fs.unlinkSync(outPath);
});

test("setNotePitch mutates pitch and invalidates note cache", () => {
  const midi = new Midi();
  const track = new MidiTrack();
  midi.tracks = [track];

  track.addNote(50, 0);
  const [note] = track.getNotes();

  expect(track.setNotePitch(note, 60)).toBe(true);
  expect(track.getNotes()[0].note).toBe(60);
});

test("setNotePitch rejects out-of-range pitch", () => {
  const midi = new Midi();
  const track = new MidiTrack();
  midi.tracks = [track];

  track.addNote(50, 0);
  const [note] = track.getNotes();

  expect(() => track.setNotePitch(note, 128)).toThrow(RangeError);
});

test("getNotes includes time elapsed by non-note events", () => {
  const track = new MidiTrack();
  track.events = [
    {
      deltaTime: 120,
      status: 0x90,
      channel: 0,
      messageType: ChannelMessage.NoteOn,
      data1: 60,
      data2: 100,
    } as MidiChannelEvent,
    {
      deltaTime: 120,
      status: 0xb0,
      channel: 0,
      messageType: ChannelMessage.ControlChange,
      data1: 64,
      data2: 127,
    } as MidiChannelEvent,
    {
      deltaTime: 120,
      status: 0x80,
      channel: 0,
      messageType: ChannelMessage.NoteOff,
      data1: 60,
      data2: 0,
    } as MidiChannelEvent,
  ];

  expect(track.getNotes()).toMatchObject([{ start: 120, end: 360 }]);
});

test("addTempoChange/removeTempoChangeAt", () => {
  const midi = new Midi();
  midi.tracks = [new MidiTrack()];

  midi.addTempoChange(480, 400_000);

  const changes = midi.getTempoChanges();
  expect(changes).toContainEqual({
    tick: 480,
    microsecondsPerQuarterNote: 400_000,
  });

  expect(midi.removeTempoChangeAt(480)).toBe(true);
  expect(midi.getTempoChanges().some((change) => change.tick === 480)).toBe(
    false,
  );
  expect(midi.removeTempoChangeAt(480)).toBe(false);
});

test("addTimeSignatureChange/removeTimeSignatureChangeAt", () => {
  const midi = new Midi();
  midi.tracks = [new MidiTrack()];

  midi.addTimeSignatureChange(960, 3, 3);

  const changes = midi.getTimeSignatureChanges();
  expect(changes).toContainEqual({
    tick: 960,
    numerator: 3,
    denominator: 3,
  });

  expect(midi.removeTimeSignatureChangeAt(960)).toBe(true);
  expect(
    midi.getTimeSignatureChanges().some((change) => change.tick === 960),
  ).toBe(false);
});

test("insertEventsAt bumps trailing EndOfTrack past inserted notes", () => {
  const midi = new Midi();
  const track = new MidiTrack();
  midi.tracks = [track];

  track.addNote(50, 0, 100, 240);
  track.addNote(52, 480, 100, 240);

  const eventsBefore = midi.toBuffer();
  const reparsed = new Midi(eventsBefore);
  const notes = reparsed.tracks[0].getNotes();

  expect(notes.map((n) => n.start)).toEqual([0, 720]);
  expect(notes.map((n) => n.end)).toEqual([240, 960]);
});
