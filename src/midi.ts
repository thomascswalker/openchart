// https://midimusic.github.io/tech/midispec.html

import { Parser } from "binary-parser/dist/binary_parser.js";
import path from "path";
import * as fs from 'fs';

enum MidiFormat {
    Single = 0,
    Multi = 1,
    MultiAsync = 2,
}

enum ChannelMessage {
    NoteOff = 0x80,
    NoteOn = 0x90,
    PolyKeyPressure = 0xa0,
    ControlChange = 0xb0,
    ProgramChange = 0xc0,
    ChannelPressure = 0xd0,
    PitchBend = 0xe0,
}

enum TrackEventType {
    Meta = 1,
    SysEx = 2,
    ChannelExplicit = 3,
    ChannelRunning = 4,
}

// Event Data Typings
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
    bytes: Buffer | Uint8Array;
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


enum MetaType {
    SequenceNumber = 0x0,
    TextEvent = 0x1,
    Copyright = 0x2,
    TrackName = 0x3,
    InstrumentName = 0x4,
    Lyric = 0x5,
    Marker = 0x6,
    CuePoint = 0x7,
    ChannelPrefix = 0x20,
    EndOfTrack = 0x2F,
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
    data: Buffer | Uint8Array;
}

export type MidiEvent = MidiChannelEvent | MidiMetaEvent | MidiSysExEvent;

// Variable Length Quantity (VLQ) parser for Delta Times and Meta/SysEx lengths
const vlqParser = new Parser()
    .array("bytes", {
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

// Meta Event Parsers
const textEventParser = new Parser().string("text", {
    length: function (this: any): number {
        // This parser is nested below the meta-event's `data` choice. With
        // binary-parser context variables enabled, the length is on the
        // enclosing meta event rather than on this payload object.
        return this.$parent.length;
    },
    encoding: "ascii",
});

const tempoEventParser = new Parser().array("microsecondsPerQuarterNote", {
    type: "uint8",
    length: 3,
    formatter: (bytes: [number, number, number]) => (bytes[0] << 16) | (bytes[1] << 8) | bytes[2],
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
    0x01: textEventParser, // Text
    0x02: textEventParser, // Copyright
    0x03: textEventParser, // Track Name
    0x04: textEventParser, // Instrument Name
    0x05: textEventParser, // Lyric
    0x06: textEventParser, // Marker
    0x07: textEventParser, // Cue Point
    0x08: textEventParser, // Program Name
    0x09: textEventParser, // Device Name
    0x20: new Parser().uint8("channel"), // Channel Prefix
    0x21: new Parser().uint8("port"), // MIDI Port
    0x2f: new Parser(), // End of Track
    0x51: tempoEventParser, // Set Tempo
    0x54: new Parser().uint8("hr").uint8("mn").uint8("se").uint8("fr").uint8("ff"), // SMPTE
    0x58: timeSignatureParser,
    0x59: keySignatureParser,
};

const metaEventParser = new Parser()
    .uint8("type")
    .nest("length", {
        type: vlqParser,
        formatter: (res: any) => res.bytes,
    })
    .choice("data", {
        tag: "type",
        choices: metaEventParsers,
        defaultChoice: defaultMetaParser,
    });

// System Exclusive Parser
const sysExParser = new Parser()
    .nest("length", {
        type: vlqParser,
        formatter: (res: any) => res.bytes,
    })
    .buffer("data", {
        length: function (this: any): number {
            return this.length;
        },
    });

function isTwoByteMessage(status: number): boolean {
    const type = status & 0xf0;
    return type !== 0xc0 && type !== 0xd0;
}

let currentRunningStatus = 0;

const explicitChannelParser = new Parser()
    .uint8("data1")
    .choice("", {
        tag: function (this: any): number {
            const status = this.$parent ? this.$parent.status : currentRunningStatus;
            return isTwoByteMessage(status) ? 2 : 1;
        },
        choices: {
            2: new Parser().uint8("data2"),
            1: new Parser(),
        },
    });

const runningChannelParser = new Parser()
    .choice("", {
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
        formatter: (res: any) => res.bytes,
    })
    .uint8("statusByte")
    .choice("event", {
        tag: function (this: any): number {
            if (this.statusByte === 0xff) {
                this.status = 0xff;
                return TrackEventType.Meta;
            } else if (this.statusByte === 0xf0 || this.statusByte === 0xf7) {
                this.status = this.statusByte;
                return TrackEventType.SysEx;
            } else if (this.statusByte >= 0x80) {
                currentRunningStatus = this.statusByte;
                this.status = this.statusByte;
                this.channel = this.statusByte & 0x0f;
                this.messageType = this.statusByte & 0xf0;
                return TrackEventType.ChannelExplicit;
            } else {
                this.status = currentRunningStatus;
                this.channel = currentRunningStatus & 0x0f;
                this.messageType = currentRunningStatus & 0xf0;
                return TrackEventType.ChannelRunning;
            }
        },
        choices: {
            [TrackEventType.Meta]: metaEventParser,
            [TrackEventType.SysEx]: sysExParser,
            [TrackEventType.ChannelExplicit]: explicitChannelParser,
            [TrackEventType.ChannelRunning]: runningChannelParser,
        },
    });

function formatTrackEvents(rawEvents: any[]): MidiEvent[] {
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

const trackParser = new Parser()
    .string("magic", { length: 4, encoding: "ascii" })
    .uint32be("length", {
        formatter: (len: number) => {
            currentRunningStatus = 0; // Reset running status at start of each track
            return len;
        },
    })
    .array("events", {
        type: trackEventParser,
        lengthInBytes: "length",
        formatter: formatTrackEvents,
    });

const headerParser = new Parser()
    .string("magic", { length: 4, encoding: "ascii" })
    .uint32be("length")
    .uint16be("format")
    .uint16be("trackCount")
    .bit1("isSMPTE")
    .bit15("ppqn");

class MidiHeader {
    format: MidiFormat = 0;
    trackCount: number = 0;
    division: number = 480;
}

class MidiTrack {
    format: MidiFormat = 0;
    name: string = "";
    events: MidiEvent[] = [];

    public getChannelEvents(): MidiChannelEvent[] {
        return this.events.filter((e) => e.status < 0xff) as MidiChannelEvent[];
    }

    public getMetaEvents(): MidiMetaEvent[] {
        return this.events.filter((e) => e.status === 0xff) as MidiMetaEvent[];
    }

    public getNotes() {
        return this.getChannelEvents().filter((e) => [ChannelMessage.NoteOn, ChannelMessage.NoteOff].includes(e.messageType));
    }

    public getNotesInPitchRange(low: number, high: number) {
        return this.getNotes().filter((e) => low <= e.data1 && e.data1 < high);
    }

    public addNote(note: number, start: number, velocity: number = 0, end: number = 240) {
        this.events.push({
            deltaTime: start,
            status: 0,
            channel: 0,
            messageType: ChannelMessage.NoteOn,
            data1: note,
            data2: velocity

        }
        );
        this.events.push({
            deltaTime: end,
            status: 0,
            channel: 0,
            messageType: ChannelMessage.NoteOff,
            data1: note,
            data2: velocity
        }
        );
    }
}

class Midi {
    header: MidiHeader;
    tracks: MidiTrack[];

    constructor(data: Buffer | Uint8Array | undefined = undefined) {
        this.header = new MidiHeader();
        this.tracks = [];

        if (data) {
            this.parse(data);
        }
    }

    static fromFile(filename: string): Midi {
        let data = fs.readFileSync(filename);
        return new Midi(data);
    }

    private parse(data: Buffer | Uint8Array) {
        const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data);
        const midiParser = new Parser()
            .useContextVars()
            .nest("header", { type: headerParser })
            .array("tracks", {
                type: trackParser,
                length: function (this: any) {
                    return this.header.trackCount;
                },
            });

        const result = midiParser.parse(buffer);

        // Populate header object
        this.header.format = result.header.format;
        this.header.trackCount = result.header.trackCount;
        this.header.division = result.header.ppqn;

        // Populate track objects
        this.tracks = result.tracks.map((parsedTrack: any) => {
            const track = new MidiTrack();
            track.format = result.header.format;
            track.events = parsedTrack.events as MidiEvent[];

            // Extract track name from the first track name event that's found
            const trackNameEvent = track.getMetaEvents().find((e) => e.type === MetaType.TrackName);
            if (trackNameEvent) {
                track.name = (trackNameEvent.data as TextMetaPayload).text;
            }
            return track;
        });
    }

    public getTrack(name: string): MidiTrack | undefined {
        return this.tracks.find((t) => t.name === name);
    }
}

export { Midi, MidiHeader, MidiTrack, MidiFormat, ChannelMessage };