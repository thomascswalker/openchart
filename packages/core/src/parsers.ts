import { Parser } from "binary-parser/dist/binary_parser.js";
import { TrackEventType } from "./types.js";
import { decodeText, isTwoByteMessage, formatTrackEvents } from "./util.js";

let currentRunningStatus = 0;

const vlqParser = new Parser().array("bytes", {
  type: "uint8",
  readUntil: (byte: number) => (byte & 0x80) === 0,
  formatter: (bytes: number[]) => {
    if (bytes.length === 0) {
      throw new Error("Empty MIDI variable-length value");
    }

    if (bytes.length > 4) {
      throw new Error("MIDI variable-length value exceeds four bytes");
    }

    let value = 0;

    for (const byte of bytes) {
      value = (value << 7) | (byte & 0x7f);
    }

    return value;
  },
});

// Text payloads are read as raw bytes and decoded as UTF-8 with a Latin-1
// fallback (see decodeText), so lyrics such as "é", CJK or emoji survive a
// load/save round trip. `length` is the byte count from the meta header.
const textEventParser = new Parser().buffer("text", {
  length: function (this: any): number {
    return this.$parent.length;
  },
  formatter: (bytes: Uint8Array) => decodeText(bytes),
});

const tempoEventParser = new Parser().array("microsecondsPerQuarterNote", {
  type: "uint8",
  length: 3,
  formatter: (bytes: [number, number, number]) =>
    (bytes[0] << 16) | (bytes[1] << 8) | bytes[2],
});

const timeSignatureParser = new Parser()
  .uint8("numerator")
  .uint8("denominator")
  .uint8("clocksPerClick")
  .uint8("thirtySecondNotesPerQuarter");

const keySignatureParser = new Parser().int8("key").uint8("scale");

const defaultMetaParser = new Parser().buffer("bytes", {
  length: function (this: any): number {
    return this.$parent.length;
  },
});

const metaEventParsers: Record<number, Parser> = {
  0x00: new Parser().uint16be("sequenceNumber"),
  0x01: textEventParser,
  0x02: textEventParser,
  0x03: textEventParser,
  0x04: textEventParser,
  0x05: textEventParser,
  0x06: textEventParser,
  0x07: textEventParser,
  0x08: textEventParser,
  0x09: textEventParser,
  0x20: new Parser().uint8("channel"),
  0x21: new Parser().uint8("port"),
  0x2f: new Parser(),
  0x51: tempoEventParser,
  0x54: new Parser()
    .uint8("hr")
    .uint8("mn")
    .uint8("se")
    .uint8("fr")
    .uint8("ff"),
  0x58: timeSignatureParser,
  0x59: keySignatureParser,
};

const metaEventParser = new Parser()
  .uint8("type")
  .nest("length", {
    type: vlqParser,
    formatter: (result: any) => result.bytes,
  })
  .choice("data", {
    tag: "type",
    choices: metaEventParsers,
    defaultChoice: defaultMetaParser,
  });

const sysExParser = new Parser()
  .nest("length", {
    type: vlqParser,
    formatter: (result: any) => result.bytes,
  })
  .buffer("data", {
    length: function (this: any): number {
      return this.length;
    },
  });

const explicitChannelParser = new Parser().uint8("data1").choice("", {
  tag: function (this: any): number {
    const status = this.$parent ? this.$parent.status : currentRunningStatus;

    return isTwoByteMessage(status) ? 2 : 1;
  },
  choices: {
    2: new Parser().uint8("data2"),
    1: new Parser(),
  },
});

const runningChannelParser = new Parser().choice("", {
  tag: function (this: any): number {
    const status = this.$parent ? this.$parent.status : currentRunningStatus;

    return isTwoByteMessage(status) ? 2 : 1;
  },
  choices: {
    2: new Parser().uint8("data2"),
    1: new Parser(),
  },
});

const trackEventParser = new Parser()
  .nest("deltaTime", {
    type: vlqParser,
    formatter: (result: any) => result.bytes,
  })
  .uint8("statusByte")
  .choice("event", {
    tag: function (this: any): number {
      if (this.statusByte === 0xff) {
        this.status = 0xff;
        return TrackEventType.Meta;
      }

      if (this.statusByte === 0xf0 || this.statusByte === 0xf7) {
        this.status = this.statusByte;
        return TrackEventType.SysEx;
      }

      if (this.statusByte >= 0x80) {
        currentRunningStatus = this.statusByte;
        this.status = this.statusByte;
        this.channel = this.statusByte & 0x0f;
        this.messageType = this.statusByte & 0xf0;
        return TrackEventType.ChannelExplicit;
      }

      this.status = currentRunningStatus;
      this.channel = currentRunningStatus & 0x0f;
      this.messageType = currentRunningStatus & 0xf0;
      return TrackEventType.ChannelRunning;
    },
    choices: {
      [TrackEventType.Meta]: metaEventParser,
      [TrackEventType.SysEx]: sysExParser,
      [TrackEventType.ChannelExplicit]: explicitChannelParser,
      [TrackEventType.ChannelRunning]: runningChannelParser,
    },
  });

export const trackParser = new Parser()
  .useContextVars()
  .string("magic", {
    length: 4,
    encoding: "ascii",
  })
  .uint32be("length", {
    formatter: (length: number) => {
      currentRunningStatus = 0;
      return length;
    },
  })
  .array("events", {
    type: trackEventParser,
    lengthInBytes: "length",
    formatter: formatTrackEvents,
  });

export const headerParser = new Parser()
  .string("magic", {
    length: 4,
    encoding: "ascii",
  })
  .uint32be("length")
  .uint16be("format")
  .uint16be("trackCount")
  .bit1("isSMPTE")
  .bit15("ppqn");
