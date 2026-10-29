import { Midi } from "../midi.js";
import { MidiTrack } from "../track.js";
import { expect, test } from "vitest";
import * as fs from "fs";
import {
  ChannelMessage,
  MetaType,
  MidiChannelEvent,
  TempoEvent,
} from "../types.js";
import { msToTicks, ticksToMs } from "../util.js";

test("is constructed", () => {
  const midi = new Midi();
  expect(midi).toBeDefined();
});

test("MIDI meta events are added and match expected values", () => {
  const track = new MidiTrack("Lead");
  const tempo = track.addTempoEvent(0, 120);
  const timeSignature = track.addTimeSignatureEvent(480, 3, 2);
  const text = track.addTextEvent(MetaType.TrackName, 960, "Lead");

  expect(tempo).toMatchObject({
    type: MetaType.Tempo,
    tick: 0,
    microsecondsPerQuarterNote: 500_000,
  });
  expect(timeSignature).toMatchObject({
    type: MetaType.TimeSignature,
    tick: 480,
    numerator: 3,
    denominator: 2,
  });
  expect(text).toMatchObject({
    type: MetaType.TrackName,
    tick: 960,
    text: "Lead",
  });
  expect("data" in tempo).toBe(false);
  expect("data" in timeSignature).toBe(false);
  expect("data" in text).toBe(false);
});

test("clone preserves MIDI data and isolates mutable event payloads", () => {
  const midi = new Midi();
  const track = new MidiTrack("Lead");
  midi.header.division = 960;
  midi.tracks = [track];
  track.addNote(60, 0, 100, 240);
  track.addTextEvent(1, 480, "section");
  // tick is recomputed from deltaTime by the events setter.
  track.events = [
    ...track.events,
    {
      deltaTime: 0,
      tick: 0,
      status: 0xf0,
      length: 2,
      data: new Uint8Array([1, 2]),
    },
  ];

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

  if (!("text" in clonedMeta) || !("text" in originalMeta)) {
    throw new Error("Expected cloned and original text meta events");
  }
  if (!("data" in clonedSysEx) || !("data" in originalSysEx)) {
    throw new Error("Expected cloned and original SysEx events");
  }

  clonedMeta.text = "changed";
  clonedSysEx.data[0] = 9;
  expect(originalMeta.text).toBe("section");
  expect(originalSysEx.data[0]).toBe(1);
});

test("clone preserves an empty MIDI document", () => {
  const midi = new Midi();

  const cloned = midi.clone();

  expect(cloned.header).toEqual(midi.header);
  expect(cloned.tracks).toEqual([]);
});

test("read file", async () => {
  const { default: testData } = await import("./assets/data.json");

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

  expect(track.getNotes().length).toBe(4);

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
  expect(track.getNotes()[0].pitch).toBe(60);
});

test("insertNote inserts at an absolute tick and indexes the note by event ID", () => {
  const track = new MidiTrack();
  const note = track.insertNote({
    tick: 120,
    pitch: 50,
    velocity: 90,
    duration: 240,
  });
  const eventId = track.getEventId(note.noteOn);

  expect(note).toMatchObject({
    pitch: 50,
    velocity: 90,
    start: 120,
    end: 360,
  });
  expect(track.getNoteByEventId(eventId)).toBe(note);
  expect(track.getEventById(eventId)).toBe(note.noteOn);
});

test("event and note ID indexes survive cloning and are cleared on removal", () => {
  const track = new MidiTrack();
  const note = track.insertNote({ tick: 0, pitch: 50, duration: 240 });
  const eventId = track.getEventId(note.noteOn);
  const cloned = track.clone();
  const clonedTrackNote = cloned.getNotes()[0]!;

  expect(cloned.getEventById(eventId)).toBe(clonedTrackNote.noteOn);
  expect(cloned.getNoteByEventId(eventId)).toBe(clonedTrackNote);

  expect(track.removeNote(note.noteOn, note.noteOff)).toBe(true);
  expect(track.getEventById(eventId)).toBeUndefined();
  expect(track.getNoteByEventId(eventId)).toBeUndefined();

  track.insertEventAt(0, note.noteOn);
  expect(track.getEventById(eventId)).toBe(note.noteOn);
});

test("updateNote applies a move and pitch change in one revision", () => {
  const track = new MidiTrack();
  const note = track.insertNote({
    tick: 120,
    pitch: 50,
    velocity: 90,
    duration: 240,
  });
  const revision = track.getNoteRevision();

  expect(
    track.updateNote(note, {
      start: 240,
      duration: 240,
      pitch: 60,
      velocity: 100,
    }),
  ).toBe(true);

  expect(track.getNoteRevision()).toBe(revision + 1);
  expect(track.getNotes()).toMatchObject([
    { pitch: 60, velocity: 100, start: 240, end: 480 },
  ]);
});

test("updateNote validates the whole patch before changing MIDI events", () => {
  const track = new MidiTrack();
  const note = track.insertNote({
    tick: 120,
    pitch: 50,
    velocity: 90,
    duration: 240,
  });
  const before = track.toBuffer();
  const revision = track.getNoteRevision();

  expect(() => track.updateNote(note, { start: 240, pitch: 128 })).toThrow(
    RangeError,
  );
  expect(track.toBuffer()).toEqual(before);
  expect(track.getNoteRevision()).toBe(revision);
});

test("absolute insertion and atomic updates preserve legacy MIDI byte ordering", () => {
  const source = new MidiTrack("Lead");
  source.addTextEvent(MetaType.Marker, 0, "start");
  source.addTextEvent(MetaType.Marker, 240, "equal tick");
  // tick is recomputed from deltaTime by the events setter.
  source.events = [
    ...source.events,
    {
      deltaTime: 0,
      tick: 0,
      status: 0xff,
      type: MetaType.EndOfTrack,
      length: 0,
    },
  ];

  const legacyTrack = source.clone();
  const absoluteTrack = source.clone();
  const specs = [
    { pitch: 60, tick: 0, velocity: 100, duration: 240 },
    { pitch: 62, tick: 240, velocity: 90, duration: 120 },
    { pitch: 64, tick: 240, velocity: 80, duration: 360 },
  ];

  const legacyNotes = specs.map(({ pitch, tick, velocity, duration }) => {
    const insertAt = legacyTrack.getInsertionIndexAt(tick);
    const { noteOn } = legacyTrack.addNote(
      pitch,
      tick - legacyTrack.getAbsoluteTickAt(insertAt),
      velocity,
      duration,
      insertAt,
    );
    return legacyTrack.getNoteByEventId(legacyTrack.getEventId(noteOn))!;
  });
  const absoluteNotes = specs.map((spec) => absoluteTrack.insertNote(spec));

  legacyTrack.setNoteStart(legacyNotes[0]!, 120);
  legacyTrack.setNotePitch(legacyNotes[0]!, 61);
  legacyTrack.setNoteDuration(legacyNotes[0]!, 300);
  legacyTrack.setNotePitch(legacyNotes[2]!, 65);
  legacyTrack.setNoteStart(legacyNotes[1]!, 360);

  absoluteTrack.updateNote(absoluteNotes[0]!, {
    start: 120,
    pitch: 61,
    duration: 300,
  });
  absoluteTrack.updateNote(absoluteNotes[2]!, { pitch: 65 });
  absoluteTrack.updateNote(absoluteNotes[1]!, { start: 360 });

  expect(absoluteTrack.toBuffer()).toEqual(legacyTrack.toBuffer());
});

test("insertNote validates optional channel and inserts on that channel", () => {
  const track = new MidiTrack();
  const note = track.insertNote({
    tick: 0,
    pitch: 50,
    duration: 120,
    channel: 3,
  });

  expect(note.noteOn.channel).toBe(3);
  expect(() =>
    track.insertNote({ tick: 120, pitch: 50, duration: 120, channel: 16 }),
  ).toThrow(RangeError);
  expect(track.getNotes()).toHaveLength(1);
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
  expect(events).toContainEqual(
    expect.objectContaining({
      tick: 480,
      microsecondsPerQuarterNote: 400_000,
    }),
  );

  expect(midi.removeTempoEventAt(480)).toBe(true);
  expect(midi.getTempoEvents().some((event) => event.tick === 480)).toBe(false);
  expect(midi.removeTempoEventAt(480)).toBe(false);
});

test("addTimeSignatureEvent/removeTimeSignatureEventAt", () => {
  const midi = new Midi();
  midi.tracks = [new MidiTrack()];

  midi.addTimeSignatureEvent(960, 3, 3);

  const events = midi.getTimeSignatureEvents();
  expect(events).toContainEqual(
    expect.objectContaining({
      tick: 960,
      numerator: 3,
      denominator: 3,
    }),
  );

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

/** Asserts every event's tick/order match its deltaTime sum and array index. */
function expectTimingConsistent(track: MidiTrack): void {
  let tick = 0;
  track.events.forEach((event, index) => {
    tick += event.deltaTime;
    expect(event.tick).toBe(tick);
    expect(event.order).toBe(index);
  });
}

test("every event carries its absolute tick and order", () => {
  const track = new MidiTrack();
  track.events = [
    {
      deltaTime: 120,
      tick: 0,
      status: 0x90,
      channel: 0,
      messageType: ChannelMessage.NoteOn,
      data1: 60,
      data2: 100,
    } as MidiChannelEvent,
    {
      deltaTime: 0,
      tick: 0,
      status: 0xb0,
      channel: 0,
      messageType: ChannelMessage.ControlChange,
      data1: 64,
      data2: 127,
    } as MidiChannelEvent,
    {
      deltaTime: 240,
      tick: 0,
      status: 0x80,
      channel: 0,
      messageType: ChannelMessage.NoteOff,
      data1: 60,
      data2: 0,
    } as MidiChannelEvent,
  ];

  expect(track.events.map(({ tick, order }) => [tick, order])).toEqual([
    [120, 0],
    [120, 1],
    [360, 2],
  ]);
});

test("tick and order stay current through insert, move, update and remove", () => {
  const track = new MidiTrack();
  const marker = track.addTextEvent(MetaType.Marker, 480, "m");
  const note = track.insertNote({ tick: 0, pitch: 60, duration: 240 });
  expectTimingConsistent(track);

  expect(track.moveEvent(marker, 960)).toBe(true);
  expect(marker.tick).toBe(960);
  expectTimingConsistent(track);

  expect(track.updateNote(note, { start: 1200 })).toBe(true);
  expect(note.noteOn.tick).toBe(1200);
  expect(note.noteOff.tick).toBe(1440);
  expectTimingConsistent(track);

  expect(track.removeEvent(marker)).toBe(true);
  expectTimingConsistent(track);
  expect(track.events.map((event) => event.tick)).toEqual([1200, 1440]);
});

test("updateEvent moves an event when the patch has a tick", () => {
  const track = new MidiTrack();
  const marker = track.addTextEvent(MetaType.Marker, 0, "m");
  track.insertNote({ tick: 240, pitch: 60, duration: 240 });

  expect(track.updateEvent(marker, { tick: 600, order: 99 })).toBe(true);
  expect(marker.tick).toBe(600);
  expect(track.events.at(-1)).toBe(marker);
  expectTimingConsistent(track);
});

test("EndOfTrack stays last and is bumped past inserted events", () => {
  const track = new MidiTrack();
  track.events = [
    {
      deltaTime: 0,
      tick: 0,
      status: 0xff,
      type: MetaType.EndOfTrack,
      length: 0,
    },
  ];
  track.insertNote({ tick: 480, pitch: 60, duration: 240 });

  const last = track.events.at(-1)!;
  expect(last).toMatchObject({ type: MetaType.EndOfTrack, tick: 720 });
  expectTimingConsistent(track);
});

test("meta getters return events with ticks without manual rebuilds", () => {
  const track = new MidiTrack();
  track.addTempoEvent(480, 120);
  track.addTimeSignatureEvent(960, 3, 2);
  track.addTextEvent(MetaType.Lyric, 240, "la");

  expect(track.getTempoEvents().map((event) => event.tick)).toEqual([480]);
  expect(track.getTimeSignatureEvents().map((event) => event.tick)).toEqual([
    960,
  ]);
  expect(track.getTextEvents().map((event) => event.tick)).toEqual([240]);

  track.addTempoEvent(0, 60);
  expect(track.getTempoEvents().map((event) => event.tick)).toEqual([0, 480]);
});

test("getAbsoluteTickAt and getInsertionIndexAt read cached ticks", () => {
  const track = new MidiTrack();
  track.insertNote({ tick: 0, pitch: 60, duration: 240 });
  track.insertNote({ tick: 480, pitch: 62, duration: 240 });

  expect(track.getAbsoluteTickAt(0)).toBe(0);
  expect(track.getAbsoluteTickAt(2)).toBe(240);
  expect(track.getAbsoluteTickAt(track.events.length)).toBe(720);
  expect(track.getInsertionIndexAt(0)).toBe(1);
  expect(track.getInsertionIndexAt(300)).toBe(2);
  expect(track.getInsertionIndexAt(10_000)).toBe(track.events.length);
});

test("parsed MIDI events carry ticks matching their deltas", async () => {
  const { default: testData } = await import("./assets/data.json");
  const midiPath = new URL(`../${testData.filename}`, import.meta.url);
  const midi = new Midi(fs.readFileSync(midiPath));

  for (const track of midi.tracks) {
    expectTimingConsistent(track);
  }
});

test("INI round trip does not serialize tick or order", () => {
  const midi = new Midi();
  midi.tracks = [new MidiTrack("T")];
  midi.addTempoEvent(480, 500_000);

  expect(midi.toIni()).not.toContain("tick");
  const restored = Midi.fromIni(midi.toIni());
  expect(restored.toBuffer()).toEqual(midi.toBuffer());
  expect(restored.getTempoEvents()[0]).toMatchObject({ tick: 480, order: 0 });
});

test("ticksToMs and msToTicks accept tempo events directly", () => {
  const tempoEvents: TempoEvent[] = [
    {
      deltaTime: 0,
      tick: 0,
      status: 0xff,
      type: MetaType.Tempo,
      length: 3,
      microsecondsPerQuarterNote: 500_000,
    },
    {
      deltaTime: 480,
      tick: 480,
      status: 0xff,
      type: MetaType.Tempo,
      length: 3,
      microsecondsPerQuarterNote: 1_000_000,
    },
  ];

  expect(ticksToMs(960, 480, tempoEvents)).toBe(1_500);
  expect(msToTicks(1_500, 480, tempoEvents)).toBe(960);
});
