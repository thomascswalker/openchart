import { MAX_VARIABLE_LENGTH_VALUE } from "./constants.js";
import {
  MidiEvent,
  MidiMetaPayload,
  DefaultMetaPayload,
  MetaType,
  MidiSysExEvent,
  TempoEvent,
} from "./types.js";

export function isTwoByteMessage(status: number): boolean {
  const type = status & 0xf0;
  return type !== 0xc0 && type !== 0xd0;
}

export function formatTrackEvents(rawEvents: any[]): MidiEvent[] {
  return rawEvents.map((record) => {
    const result: any = {
      deltaTime: record.deltaTime,
      status: record.status,
    };

    if (record.channel !== undefined) {
      result.channel = record.channel;
    }

    if (record.messageType !== undefined) {
      result.messageType = record.messageType;
    }

    if (record.statusByte < 0x80) {
      result.data1 = record.statusByte;

      if (record.event && record.event.data2 !== undefined) {
        result.data2 = record.event.data2;
      }
    } else if (record.status >= 0x80 && record.status < 0xf0) {
      if (record.event) {
        if (record.event.data1 !== undefined) {
          result.data1 = record.event.data1;
        }

        if (record.event.data2 !== undefined) {
          result.data2 = record.event.data2;
        }
      }
    } else {
      if (record.event) {
        if (record.event.type !== undefined) {
          result.type = record.event.type;
        }

        if (record.event.length !== undefined) {
          result.length = record.event.length;
        }

        if (record.event.data !== undefined) {
          result.data = record.event.data;
        } else {
          result.data = record.event;
        }
      }
    }

    return result as MidiEvent;
  });
}

export function concatBytes(chunks: Uint8Array[]): Uint8Array {
  const result = new Uint8Array(
    chunks.reduce((n, chunk) => n + chunk.length, 0),
  );
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

export function writeAscii(
  target: Uint8Array,
  offset: number,
  value: string,
): void {
  for (let index = 0; index < value.length; index++) {
    target[offset + index] = value.charCodeAt(index) & 0x7f;
  }
}

export function writeUInt16BE(
  target: Uint8Array,
  offset: number,
  value: number,
): void {
  target[offset] = (value >>> 8) & 0xff;
  target[offset + 1] = value & 0xff;
}

export function writeUInt32BE(
  target: Uint8Array,
  offset: number,
  value: number,
): void {
  target[offset] = (value >>> 24) & 0xff;
  target[offset + 1] = (value >>> 16) & 0xff;
  target[offset + 2] = (value >>> 8) & 0xff;
  target[offset + 3] = value & 0xff;
}

const utf8Encoder = new TextEncoder();
const strictUtf8Decoder = new TextDecoder("utf-8", { fatal: true });

/** Encodes text-meta payloads (lyrics, markers, track names) as UTF-8. ASCII
 * is a strict subset, so existing ASCII charts serialize byte-for-byte. */
export function encodeText(value: string): Uint8Array {
  return utf8Encoder.encode(value);
}

/** Byte length of a text-meta payload once encoded. MIDI meta `length`
 * fields count bytes, not UTF-16 code units. */
export function textByteLength(value: string): number {
  return encodeText(value).length;
}

/**
 * Decodes a text-meta payload. Valid UTF-8 (including plain ASCII) decodes
 * as UTF-8; anything else falls back to Latin-1 so legacy charts written by
 * single-byte tools keep their accented characters instead of turning into
 * replacement characters.
 */
export function decodeText(bytes: Uint8Array): string {
  try {
    return strictUtf8Decoder.decode(bytes);
  } catch {
    let text = "";
    for (const byte of bytes) text += String.fromCharCode(byte);
    return text;
  }
}

export function encodeVariableLengthValue(value: number): Uint8Array {
  if (
    !Number.isInteger(value) ||
    value < 0 ||
    value > MAX_VARIABLE_LENGTH_VALUE
  ) {
    throw new RangeError(
      "MIDI variable-length values must be between 0 and 0x0fffffff",
    );
  }

  const bytes = [value & 0x7f];
  value >>>= 7;

  while (value > 0) {
    bytes.unshift((value & 0x7f) | 0x80);
    value >>>= 7;
  }

  return new Uint8Array(bytes);
}

export function requireByte(value: number, field: string): number {
  if (!Number.isInteger(value) || value < 0 || value > 0xff) {
    throw new RangeError(`${field} must be an unsigned byte`);
  }

  return value;
}

export function requireSignedByte(value: number, field: string): number {
  if (!Number.isInteger(value) || value < -0x80 || value > 0x7f) {
    throw new RangeError(`${field} must fit in a signed byte`);
  }

  return value < 0 ? value + 0x100 : value;
}

export function encodeMetaPayload(
  type: number,
  data: MidiMetaPayload,
): Uint8Array {
  if (data instanceof Uint8Array) {
    return new Uint8Array(data);
  }

  if (data && typeof data === "object" && "bytes" in data) {
    return new Uint8Array((data as DefaultMetaPayload).bytes);
  }

  const payload = (data ?? {}) as Record<string, any>;

  switch (type) {
    case MetaType.SequenceNumber: {
      const result = new Uint8Array(2);
      writeUInt16BE(result, 0, payload.sequenceNumber);
      return result;
    }

    case MetaType.TextEvent:
    case MetaType.Copyright:
    case MetaType.TrackName:
    case MetaType.InstrumentName:
    case MetaType.Lyric:
    case MetaType.Marker:
    case MetaType.CuePoint:
    case 0x08:
    case 0x09:
      return encodeText(payload.text ?? "");

    case 0x20:
      return new Uint8Array([
        requireByte(payload.channel, "MIDI channel prefix"),
      ]);

    case 0x21:
      return new Uint8Array([requireByte(payload.port, "MIDI port")]);

    case MetaType.EndOfTrack:
      return new Uint8Array(0);

    case MetaType.Tempo: {
      const result = new Uint8Array(3);
      const value = payload.microsecondsPerQuarterNote;
      result[0] = (value >>> 16) & 0xff;
      result[1] = (value >>> 8) & 0xff;
      result[2] = value & 0xff;
      return result;
    }

    case MetaType.SMPTEOffset:
      return new Uint8Array([
        requireByte(payload.hr, "SMPTE hour"),
        requireByte(payload.mn, "SMPTE minute"),
        requireByte(payload.se, "SMPTE second"),
        requireByte(payload.fr, "SMPTE frame"),
        requireByte(payload.ff, "SMPTE fractional frame"),
      ]);

    case MetaType.TimeSignature:
      return new Uint8Array([
        requireByte(payload.numerator, "time-signature numerator"),
        requireByte(payload.denominator, "time-signature denominator"),
        requireByte(payload.clocksPerClick, "time-signature clocks-per-click"),
        requireByte(
          payload.thirtySecondNotesPerQuarter,
          "time-signature thirty-second notes",
        ),
      ]);

    case 0x59:
      return new Uint8Array([
        requireSignedByte(payload.key, "key signature key"),
        requireByte(payload.scale, "key-signature scale"),
      ]);

    default:
      throw new Error(
        `Cannot serialize unsupported MIDI meta-event type 0x${type.toString(16)}`,
      );
  }
}

/** Decodes raw MIDI meta-event bytes into the payload shape used by this library. */
export function decodeMetaPayload(
  type: number,
  bytes: Uint8Array,
): MidiMetaPayload {
  const requireLength = (expected: number): void => {
    if (bytes.length !== expected) {
      throw new Error(
        `MIDI meta-event type 0x${type.toString(16)} requires ${expected} data bytes`,
      );
    }
  };

  switch (type) {
    case MetaType.SequenceNumber:
      requireLength(2);
      return { sequenceNumber: (bytes[0] << 8) | bytes[1] };

    case MetaType.TextEvent:
    case MetaType.Copyright:
    case MetaType.TrackName:
    case MetaType.InstrumentName:
    case MetaType.Lyric:
    case MetaType.Marker:
    case MetaType.CuePoint:
    case 0x08:
    case 0x09:
      return { text: decodeText(bytes) };

    case 0x20:
      requireLength(1);
      return { channel: bytes[0] };

    case 0x21:
      requireLength(1);
      return { port: bytes[0] };

    case MetaType.EndOfTrack:
      requireLength(0);
      return {};

    case MetaType.Tempo:
      requireLength(3);
      return {
        microsecondsPerQuarterNote:
          (bytes[0] << 16) | (bytes[1] << 8) | bytes[2],
      };

    case MetaType.SMPTEOffset:
      requireLength(5);
      return {
        hr: bytes[0],
        mn: bytes[1],
        se: bytes[2],
        fr: bytes[3],
        ff: bytes[4],
      };

    case MetaType.TimeSignature:
      requireLength(4);
      return {
        numerator: bytes[0],
        denominator: bytes[1],
        clocksPerClick: bytes[2],
        thirtySecondNotesPerQuarter: bytes[3],
      };

    case 0x59:
      requireLength(2);
      return {
        key: bytes[0] > 0x7f ? bytes[0] - 0x100 : bytes[0],
        scale: bytes[1],
      };

    default:
      return { bytes: new Uint8Array(bytes) };
  }
}

export function encodeMidiEvent(event: MidiEvent): Uint8Array {
  const deltaTime = encodeVariableLengthValue(event.deltaTime);

  if (event.status === 0xff && "type" in event) {
    const payload = encodeMetaPayload(
      event.type,
      "text" in event ? { text: event.text } : event.data,
    );

    return concatBytes([
      deltaTime,
      new Uint8Array([0xff, event.type]),
      encodeVariableLengthValue(payload.length),
      payload,
    ]);
  }

  if (event.status === 0xf0 || event.status === 0xf7) {
    const payload = new Uint8Array((event as MidiSysExEvent).data);

    return concatBytes([
      deltaTime,
      new Uint8Array([event.status]),
      encodeVariableLengthValue(payload.length),
      payload,
    ]);
  }

  if (!("messageType" in event)) {
    throw new Error("Cannot serialize an unsupported MIDI event");
  }

  const status =
    event.status >= 0x80 && event.status < 0xf0
      ? event.status
      : event.messageType | (event.channel & 0x0f);

  const messageType = status & 0xf0;
  const data1 = requireByte(event.data1, "MIDI event data1") & 0x7f;

  const bytes = [status, data1];

  if (isTwoByteMessage(messageType)) {
    bytes.push(requireByte(event.data2 ?? 0, "MIDI event data2") & 0x7f);
  }

  return concatBytes([deltaTime, new Uint8Array(bytes)]);
}

/** Converts an absolute MIDI tick to milliseconds, honoring tempo events along the way. */
export function ticksToMs(
  tick: number,
  ppqn: number,
  tempoEvents: TempoEvent[],
): number {
  let ms = 0;
  let previousTick = 0;
  let microsecondsPerQuarterNote = 500_000;

  for (const event of tempoEvents) {
    if (event.tick >= tick) {
      break;
    }

    ms +=
      ((event.tick - previousTick) * microsecondsPerQuarterNote) / ppqn / 1000;
    previousTick = event.tick;
    microsecondsPerQuarterNote = event.microsecondsPerQuarterNote;
  }

  ms += ((tick - previousTick) * microsecondsPerQuarterNote) / ppqn / 1000;

  return ms;
}

/** Converts milliseconds to an absolute MIDI tick, honoring tempo events along the way. */
export function msToTicks(
  ms: number,
  ppqn: number,
  tempoEvents: TempoEvent[],
): number {
  let remainingMs = ms;
  let previousTick = 0;
  let microsecondsPerQuarterNote = 500_000;

  for (const event of tempoEvents) {
    const segmentMs =
      ((event.tick - previousTick) * microsecondsPerQuarterNote) / ppqn / 1000;

    if (segmentMs >= remainingMs) {
      break;
    }

    remainingMs -= segmentMs;
    previousTick = event.tick;
    microsecondsPerQuarterNote = event.microsecondsPerQuarterNote;
  }

  const ticks =
    previousTick + (remainingMs * 1000 * ppqn) / microsecondsPerQuarterNote;

  return Math.max(0, ticks);
}
