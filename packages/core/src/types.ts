export enum MidiFormat {
  Single = 0,
  Multi = 1,
  MultiAsync = 2,
}

export enum ChannelMessage {
  NoteOff = 0x80,
  NoteOn = 0x90,
  PolyKeyPressure = 0xa0,
  ControlChange = 0xb0,
  ProgramChange = 0xc0,
  ChannelPressure = 0xd0,
  PitchBend = 0xe0,
}

export enum TrackEventType {
  Meta = 1,
  SysEx = 2,
  ChannelExplicit = 3,
  ChannelRunning = 4,
}

export interface BaseMidiEvent {
  deltaTime: number;
  status: number;
}

export interface MidiChannelEvent extends BaseMidiEvent {
  channel: number;
  messageType: ChannelMessage;
  data1: number;
  data2?: number;
}

export interface TextMetaPayload {
  text: string;
}

export interface TempoMetaPayload {
  microsecondsPerQuarterNote: number;
}

export interface TimeSignatureMetaPayload {
  numerator: number;
  denominator: number;
  clocksPerClick: number;
  thirtySecondNotesPerQuarter: number;
}

export interface KeySignatureMetaPayload {
  key: number;
  scale: number;
}

export interface SMPTEMetaPayload {
  hr: number;
  mn: number;
  se: number;
  fr: number;
  ff: number;
}

export interface SequenceNumberMetaPayload {
  sequenceNumber: number;
}

export interface ChannelOrPortMetaPayload {
  channel?: number;
  port?: number;
}

export interface DefaultMetaPayload {
  bytes: Uint8Array;
}

export type MidiMetaPayload =
  | TextMetaPayload
  | TempoMetaPayload
  | TimeSignatureMetaPayload
  | KeySignatureMetaPayload
  | SMPTEMetaPayload
  | SequenceNumberMetaPayload
  | ChannelOrPortMetaPayload
  | DefaultMetaPayload
  | Record<string, any>;

export enum MetaType {
  SequenceNumber = 0x00,
  TextEvent = 0x01,
  Copyright = 0x02,
  TrackName = 0x03,
  InstrumentName = 0x04,
  Lyric = 0x05,
  Marker = 0x06,
  CuePoint = 0x07,
  ChannelPrefix = 0x20,
  EndOfTrack = 0x2f,
  Tempo = 0x51,
  SMPTEOffset = 0x54,
  TimeSignature = 0x58,
}

export interface MidiMetaEvent extends BaseMidiEvent {
  status: 0xff;
  type: MetaType;
  length: number;
  data: MidiMetaPayload;
}

export interface MidiSysExEvent extends BaseMidiEvent {
  status: 0xf0 | 0xf7;
  length: number;
  data: Uint8Array;
}

export type MidiEvent = MidiChannelEvent | MidiMetaEvent | MidiSysExEvent;

export interface TimedMidiEvent {
  event: MidiEvent;
  tick: number;
  order: number;
}

/** Stable identity for an event within a track. Object identity remains the
 * source of truth; this id is only used by editors and serialized UI state. */
export type MidiEventId = string;

export type TextMetaType =
  | MetaType.TextEvent
  | MetaType.Copyright
  | MetaType.TrackName
  | MetaType.InstrumentName
  | MetaType.Lyric
  | MetaType.Marker
  | MetaType.CuePoint;

export interface TextMidiEvent extends MidiMetaEvent {
  type: TextMetaType;
  data: TextMetaPayload;
}

export interface Marker {
  hovered?: boolean;
  selected?: boolean;
}

export interface TempoChange extends Marker {
  tick: number;
  microsecondsPerQuarterNote: number;
}

export interface TimeSignatureChange extends Marker {
  tick: number;
  numerator: number;
  /** Power-of-two exponent per the MIDI spec (2 == quarter note, 3 == eighth note). */
  denominator: number;
}
