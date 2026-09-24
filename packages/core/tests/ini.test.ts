import { expect, test } from "vitest";
import { Midi, MidiTrack } from "../src/midi.js";
import {
  ChannelMessage,
  MetaType,
  MidiChannelEvent,
  MidiMetaEvent,
  MidiSysExEvent,
} from "../src/types.js";

function createMidi(): Midi {
  const midi = new Midi();
  const controlTrack = new MidiTrack("Control Track");
  const notesTrack = new MidiTrack("Notes");

  controlTrack.events = [
    {
      deltaTime: 0,
      status: 0xff,
      type: MetaType.TrackName,
      length: 19,
      data: { text: 'Text with "quotes"\n' },
    } as MidiMetaEvent,
    {
      deltaTime: 0,
      status: 0xff,
      type: MetaType.Tempo,
      length: 3,
      data: { microsecondsPerQuarterNote: 500_000 },
    } as MidiMetaEvent,
    {
      deltaTime: 0,
      status: 0xff,
      type: MetaType.TimeSignature,
      length: 4,
      data: {
        numerator: 3,
        denominator: 3,
        clocksPerClick: 24,
        thirtySecondNotesPerQuarter: 8,
      },
    } as MidiMetaEvent,
    {
      deltaTime: 120,
      status: 0xf0,
      length: 3,
      data: new Uint8Array([0, 127, 1]),
    } as MidiSysExEvent,
  ];

  notesTrack.events = [
    {
      deltaTime: 0,
      status: 0x95,
      channel: 5,
      messageType: ChannelMessage.NoteOn,
      data1: 60,
      data2: 100,
    } as MidiChannelEvent,
    {
      deltaTime: 120,
      status: 0x85,
      channel: 5,
      messageType: ChannelMessage.NoteOff,
      data1: 60,
      data2: 0,
    } as MidiChannelEvent,
    {
      deltaTime: 0,
      status: 0xc7,
      channel: 7,
      messageType: ChannelMessage.ProgramChange,
      data1: 12,
    } as MidiChannelEvent,
  ];

  midi.tracks = [controlTrack, notesTrack];
  return midi;
}

const expectedIni = `[header]
format=1
trackCount=2
division=480
isSMPTE=false

[tracks.0]
name=Control Track
e[]=0 255 3 VGV4dCB3aXRoICJxdW90ZXMiCg
e[]=0 255 81 B6Eg
e[]=0 255 88 AwMYCA
e[]=120 240 AH8B

[tracks.1]
name=Notes
e[]=0 149 60 100
e[]=120 133 60 0
e[]=0 199 12
`;

test("fromIni reconstructs typed events from compact plaintext", () => {
  const midi = Midi.fromIni(expectedIni);

  expect(midi.header).toMatchObject({
    format: 1,
    trackCount: 2,
    division: 480,
    isSMPTE: false,
  });
  expect(midi.tracks.map((track) => track.name)).toEqual([
    "Control Track",
    "Notes",
  ]);
  expect(midi.tracks[0].events).toEqual(createMidi().tracks[0].events);
  expect(midi.tracks[1].events).toEqual(createMidi().tracks[1].events);
});

test("INI conversion is canonical and preserves MIDI bytes", () => {
  const midi = createMidi();
  const restored = Midi.fromIni(midi.toIni());

  expect(restored.toIni()).toBe(midi.toIni());
  expect(restored.toBuffer()).toEqual(midi.toBuffer());
});
