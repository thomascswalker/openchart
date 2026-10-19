import { Midi, MidiTrack } from "../../src/midi.js";
import { expect, test } from "vitest";
import * as fs from "fs";
import { ChannelMessage, MidiChannelEvent } from "../../src/types.js";

test("is constructed", () => {
  const midi = new Midi();
  expect(midi).toBeDefined();
});

test("clone preserves MIDI data and isolates mutable event payloads", () => {
  const midi = new Midi();
  const track = new MidiTrack("Lead");
  midi.header.division = 960;
  midi.tracks = [track];
  track.addNote(60, 0, 100, 240);
  track.addTextEvent(1, 480, "section");
  track.events.push({
    deltaTime: 0,
    status: 0xf0,
    length: 2,
    data: new Uint8Array([1, 2]),
  });

  const cloned = midi.clone();

  expect(cloned).not.toBe(midi);
  expect(cloned.header).not.toBe(midi.header);
  expect(cloned.header).toEqual(midi.header);
  expect(cloned.tracks[0]).not.toBe(track);
  expect(cloned.tracks[0].events).toEqual(track.events);
  const clonedMeta = cloned.tracks[0].events.find(
    (event) => event.status === 0xff,
  )!;
  const originalMeta = track.events.find((event) => event.status === 0xff)!;
  const clonedSysEx = cloned.tracks[0].events.find(
    (event) => event.status === 0xf0 || event.status === 0xf7,
  )!;
  const originalSysEx = track.events.find(
    (event) => event.status === 0xf0 || event.status === 0xf7,
  )!;
  expect(clonedMeta).not.toBe(originalMeta);
  expect(clonedSysEx).not.toBe(originalSysEx);

  (clonedMeta as { text: string }).text = "changed";
  (clonedSysEx as { data: Uint8Array }).data[0] = 9;
  expect((originalMeta as { text: string }).text).toBe("section");
  expect((originalSysEx as { data: Uint8Array }).data[0]).toBe(1);
});

test("clone preserves an empty MIDI document", () => {
  const midi = new Midi();

  const cloned = midi.clone();

  expect(cloned.header).toEqual(midi.header);
  expect(cloned.tracks).toEqual([]);
});

test("read file", async () => {
  const { default: testData } = await import("../data.json");

  const midiPath = new URL(`../${testData.filename}`, import.meta.url);
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

test("note revision advances once for each note mutation", () => {
  const track = new MidiTrack();
  track.addNote(50, 0);
  const [note] = track.getNotes();
  const afterAdd = track.getNoteRevision();

  expect(track.setNotePitch(note, 60)).toBe(true);
  expect(track.getNoteRevision()).toBe(afterAdd + 1);

  expect(track.setNoteDuration(note, 240)).toBe(true);
  expect(track.getNoteRevision()).toBe(afterAdd + 2);

  expect(track.setNoteStart(note, 120)).toBe(true);
  expect(track.getNoteRevision()).toBe(afterAdd + 3);
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

test("addTempoEvent/removeTempoEventAt", () => {
  const midi = new Midi();
  midi.tracks = [new MidiTrack()];

  midi.addTempoEvent(480, 400_000);

  const events = midi.getTempoEvents();
  expect(events).toContainEqual({
    tick: 480,
    microsecondsPerQuarterNote: 400_000,
  });

  expect(midi.removeTempoEventAt(480)).toBe(true);
  expect(midi.getTempoEvents().some((event) => event.tick === 480)).toBe(false);
  expect(midi.removeTempoEventAt(480)).toBe(false);
});

test("addTimeSignatureEvent/removeTimeSignatureEventAt", () => {
  const midi = new Midi();
  midi.tracks = [new MidiTrack()];

  midi.addTimeSignatureEvent(960, 3, 3);

  const events = midi.getTimeSignatureEvents();
  expect(events).toContainEqual({
    tick: 960,
    numerator: 3,
    denominator: 3,
  });

  expect(midi.removeTimeSignatureEventAt(960)).toBe(true);
  expect(
    midi.getTimeSignatureEvents().some((event) => event.tick === 960),
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
