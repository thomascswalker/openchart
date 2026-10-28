import { z } from "zod";

type MergeShapes<T extends z.ZodObject<any>[] | readonly z.ZodObject<any>[]> =
  T extends [infer First, ...infer Rest]
    ? First extends z.ZodObject<infer S>
      ? Rest extends z.ZodObject<any>[] | readonly z.ZodObject<any>[]
        ? S & MergeShapes<Rest>
        : S
      : object
    : object;

/**
 * Merges multiple Zod object schemas into a single schema.
 */
function merge<T extends z.ZodObject<any>[] | readonly z.ZodObject<any>[]>(
  ...schemas: T
): z.ZodObject<MergeShapes<T>> {
  const mergedShape = schemas.reduce((acc, schema) => {
    return { ...acc, ...schema.shape };
  }, z.object({}));

  return z.object(mergedShape) as any;
}

export enum MidiFormat {
  Single = 0,
  Multi = 1,
  MultiAsync = 2,
}

export enum SysExMessage {
  SysExStart = 0xf0,
  TimeCode = 0xf1,
  SongPosition = 0xf2,
  SongSelect = 0xf3,
  Reserved1 = 0xf4,
  Reserved2 = 0xf5,
  TuneRequest = 0xf6,
  SysExEnd = 0xf7,
}

export enum SysRealtimeMessage {
  TimingClock = 0xf8,
  Start = 0xfa,
  Continue = 0xfb,
  Stop = 0xfc,
  ActiveSensing = 0xfe,
  SystemReset = 0xff,
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

export const MidiMessage = {
  ...ChannelMessage,
  ...SysExMessage,
  ...SysRealtimeMessage,
} as const;

export enum TrackEventType {
  Meta = 1,
  SysEx = 2,
  ChannelExplicit = 3,
  ChannelRunning = 4,
}

export enum MetaType {
  SequenceNumber = 0x00,
  Text = 0x01,
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

const TextMetaTypeValues = {
  Text: MetaType.Text,
  Copyright: MetaType.Copyright,
  TrackName: MetaType.TrackName,
  InstrumentName: MetaType.InstrumentName,
  Lyric: MetaType.Lyric,
  Marker: MetaType.Marker,
  CuePoint: MetaType.CuePoint,
  [MetaType.Text]: "Text",
  [MetaType.Copyright]: "Copyright",
  [MetaType.TrackName]: "TrackName",
  [MetaType.InstrumentName]: "InstrumentName",
  [MetaType.Lyric]: "Lyric",
  [MetaType.Marker]: "Marker",
  [MetaType.CuePoint]: "CuePoint",
} as const;

export const TextMetaType: typeof TextMetaTypeValues & Record<number, string> =
  TextMetaTypeValues;

export type TextMetaType =
  | MetaType.Text
  | MetaType.Copyright
  | MetaType.TrackName
  | MetaType.InstrumentName
  | MetaType.Lyric
  | MetaType.Marker
  | MetaType.CuePoint;

export const isTextEvent = (event: MidiEvent): boolean => {
  return (
    event.status === 0xff &&
    ((event as MidiMetaEvent).type === MetaType.Text ||
      (event as MidiMetaEvent).type === MetaType.Copyright ||
      (event as MidiMetaEvent).type === MetaType.TrackName ||
      (event as MidiMetaEvent).type === MetaType.InstrumentName ||
      (event as MidiMetaEvent).type === MetaType.Lyric ||
      (event as MidiMetaEvent).type === MetaType.Marker ||
      (event as MidiMetaEvent).type === MetaType.CuePoint)
  );
};

export const BaseEventSchema = z.object({
  deltaTime: z.number(),
  status: z.number(),
  /**
   * Absolute tick: sum of this event's `deltaTime` and every preceding
   * event's in its track. Maintained by `MidiTrack`; treat as read-only.
   */
  tick: z.number(),
  /**
   * Index of the event within its track's `events` after the last commit;
   * breaks ties between events on the same tick. Maintained by `MidiTrack`.
   */
  order: z.optional(z.number()),
});

export const ChannelEventSchema = merge(
  BaseEventSchema,
  z.object({
    channel: z.number(),
    messageType: z.enum(ChannelMessage),
    data1: z.number(),
    data2: z.number().optional(),
  }),
);

export const TextMetaPayloadSchema = z.object({
  text: z.string(),
});

export const TempoMetaPayloadSchema = z.object({
  microsecondsPerQuarterNote: z.number(),
});

export const TimeSignatureMetaPayloadSchema = z.object({
  numerator: z.number(),
  denominator: z.number(),
});

export const KeySignatureMetaPayloadSchema = z.object({
  key: z.number(),
  scale: z.number(),
});

export const SMPTEMetaPayloadSchema = z.object({
  hr: z.number(),
  mn: z.number(),
  se: z.number(),
  fr: z.number(),
  ff: z.number(),
});

export const SequenceNumberMetaPayloadSchema = z.object({
  sequenceNumber: z.number(),
});

export const ChannelOrPortMetaPayloadSchema = z.object({
  channel: z.number().optional(),
  port: z.number().optional(),
});

export const DefaultMetaPayloadSchema = z.object({
  bytes: z.custom<Uint8Array>((value) => value instanceof Uint8Array),
});

export const MetaPayloadSchema = z.union([
  TempoMetaPayloadSchema,
  TimeSignatureMetaPayloadSchema,
  KeySignatureMetaPayloadSchema,
  SMPTEMetaPayloadSchema,
  SequenceNumberMetaPayloadSchema,
  ChannelOrPortMetaPayloadSchema,
  DefaultMetaPayloadSchema,
  TextMetaPayloadSchema,
  z.record(z.string(), z.any()),
]);

export const MetaEventSchema = merge(
  BaseEventSchema,
  z.object({
    type: z.enum(MetaType),
    length: z.number(),
  }),
);

export const SysExEventSchema = merge(
  BaseEventSchema,
  z.object({
    length: z.number(),
    data: z.custom<Uint8Array>((value) => value instanceof Uint8Array),
  }),
);

// Specific meta event schemas

export const TextEventSchema = merge(MetaEventSchema, TextMetaPayloadSchema);
export const TempoEventSchema = merge(MetaEventSchema, TempoMetaPayloadSchema);
export const TimeSignatureEventSchema = merge(
  MetaEventSchema,
  TimeSignatureMetaPayloadSchema,
);

export const EventSchema = z.union([
  ChannelEventSchema,
  MetaEventSchema,
  SysExEventSchema,
  TextEventSchema,
  TempoEventSchema,
  TimeSignatureEventSchema,
]);

export type MidiEventId = string;
export type BaseMidiEvent = z.infer<typeof BaseEventSchema>;
export type SequenceNumberMetaPayload = z.infer<
  typeof SequenceNumberMetaPayloadSchema
>;
export type MidiChannelEvent = z.infer<typeof ChannelEventSchema>;
export type ChannelOrPortMetaPayload = z.infer<
  typeof ChannelOrPortMetaPayloadSchema
>;
export type TempoMetaPayload = z.infer<typeof TempoMetaPayloadSchema>;
export type TimeSignatureMetaPayload = z.infer<
  typeof TimeSignatureMetaPayloadSchema
>;
export type KeySignatureMetaPayload = z.infer<
  typeof KeySignatureMetaPayloadSchema
>;
export type SMPTEMetaPayload = z.infer<typeof SMPTEMetaPayloadSchema>;
export type MidiMetaEvent = z.infer<typeof MetaEventSchema>;
export type MidiMetaPayload =
  z.infer<typeof MetaPayloadSchema> | Record<string, any>;
export type DefaultMetaPayload = z.infer<typeof DefaultMetaPayloadSchema>;
export type MidiSysExEvent = z.infer<typeof SysExEventSchema>;
export type MidiEvent = z.infer<typeof EventSchema>;
export type TextMidiEvent = z.infer<typeof TextEventSchema>;
export type TempoEvent = z.infer<typeof TempoEventSchema>;
export type TimeSignatureEvent = z.infer<typeof TimeSignatureEventSchema>;

type TimedFields = Pick<BaseMidiEvent, "tick" | "order">;

/** Orders events by absolute tick, then by `order` within a tick. */
export function sortEvents(a: TimedFields, b: TimedFields): number {
  return a.tick - b.tick || (a.order ?? 0) - (b.order ?? 0);
}

export function extractMetaPayload(event: MidiMetaEvent): MidiMetaPayload {
  const excludedKeys = ["deltaTime", "status", "type", "tick", "order"];
  const payload: Record<string, any> = {};
  for (const [key, value] of Object.entries(event)) {
    if (!excludedKeys.includes(key)) {
      payload[key] = value;
    }
  }
  return payload;
}

export const DefaultTempoEvent: TempoEvent = {
  deltaTime: 0,
  tick: 0,
  order: 0,
  status: 0xff,
  type: MetaType.Tempo,
  length: 3,
  microsecondsPerQuarterNote: 500_000,
};

export const DefaultTimeSignatureEvent: TimeSignatureEvent = {
  deltaTime: 0,
  tick: 0,
  order: 0,
  status: 0xff,
  type: MetaType.TimeSignature,
  length: 4,
  numerator: 4,
  denominator: 2,
};

export interface MidiNote {
  pitch: number;
  velocity: number;
  start: number;
  end: number;
  noteOn: MidiChannelEvent;
  noteOff: MidiChannelEvent;
  previous?: MidiNote;
}

export interface InsertNoteOptions {
  pitch: number;
  tick: number;
  duration: number;
  velocity?: number;
  channel?: number;
}

export interface AddNoteResult {
  noteOn: MidiChannelEvent;
  noteOff: MidiChannelEvent;
}

export interface NotePatchFields {
  start?: number;
  pitch?: number;
  duration?: number;
  velocity?: number;
}

export interface GetNotesOptions {
  pitch?: {
    low: number;
    high: number;
  };
}

export const isChannelEvent = (event: MidiEvent): event is MidiChannelEvent => {
  return event.status < 0xff;
};

export const isNoteEvent = (event: MidiEvent): event is MidiChannelEvent => {
  return (
    isChannelEvent(event) &&
    (event.messageType === ChannelMessage.NoteOn ||
      event.messageType === ChannelMessage.NoteOff)
  );
};

export const isEndOfTrack = (
  event: MidiEvent,
): event is MidiMetaEvent | TextMidiEvent => {
  return (
    event.status === 0xff &&
    "type" in event &&
    event.type === MetaType.EndOfTrack
  );
};

export const isTimeSignatureEvent = (
  event: MidiEvent,
): event is TimeSignatureEvent => {
  return (
    event.status === 0xff &&
    "type" in event &&
    event.type === MetaType.TimeSignature
  );
};

export const isTempoEvent = (event: MidiEvent): event is TempoEvent => {
  return (
    event.status === 0xff && "type" in event && event.type === MetaType.Tempo
  );
};
