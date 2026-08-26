// https://midimusic.github.io/tech/midispec.html

import { Parser } from "binary-parser/dist/binary_parser.js";
import * as fs from "fs";

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
    data: Buffer | Uint8Array;
}

export type MidiEvent =
    | MidiChannelEvent
    | MidiMetaEvent
    | MidiSysExEvent;

interface TimedMidiEvent {
    event: MidiEvent;
    tick: number;
    order: number;
}

const vlqParser = new Parser()
    .array("bytes", {
        type: "uint8",
        readUntil: (byte: number) => (byte & 0x80) === 0,
        formatter: (bytes: number[]) => {
            if (bytes.length === 0) {
                throw new Error("Empty MIDI variable-length value");
            }

            if (bytes.length > 4) {
                throw new Error(
                    "MIDI variable-length value exceeds four bytes",
                );
            }

            let value = 0;

            for (const byte of bytes) {
                value = (value << 7) | (byte & 0x7f);
            }

            return value;
        },
    });

const textEventParser = new Parser().string("text", {
    length: function (this: any): number {
        return this.$parent.length;
    },
    encoding: "ascii",
});

const tempoEventParser = new Parser().array(
    "microsecondsPerQuarterNote",
    {
        type: "uint8",
        length: 3,
        formatter: (
            bytes: [number, number, number],
        ) => (bytes[0] << 16) | (bytes[1] << 8) | bytes[2],
    },
);

const timeSignatureParser = new Parser()
    .uint8("numerator")
    .uint8("denominator")
    .uint8("clocksPerClick")
    .uint8("thirtySecondNotesPerQuarter");

const keySignatureParser = new Parser()
    .int8("key")
    .uint8("scale");

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

function isTwoByteMessage(status: number): boolean {
    const type = status & 0xf0;
    return type !== 0xc0 && type !== 0xd0;
}

let currentRunningStatus = 0;

const explicitChannelParser = new Parser()
    .uint8("data1")
    .choice("", {
        tag: function (this: any): number {
            const status = this.$parent
                ? this.$parent.status
                : currentRunningStatus;

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
            const status = this.$parent
                ? this.$parent.status
                : currentRunningStatus;

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

            if (
                this.statusByte === 0xf0 ||
                this.statusByte === 0xf7
            ) {
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

            if (
                record.event &&
                record.event.data2 !== undefined
            ) {
                result.data2 = record.event.data2;
            }
        } else if (
            record.status >= 0x80 &&
            record.status < 0xf0
        ) {
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

const headerParser = new Parser()
    .string("magic", {
        length: 4,
        encoding: "ascii",
    })
    .uint32be("length")
    .uint16be("format")
    .uint16be("trackCount")
    .bit1("isSMPTE")
    .bit15("ppqn");

const MAX_VARIABLE_LENGTH_VALUE = 0x0fffffff;

function encodeVariableLengthValue(value: number): Buffer {
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

    return Buffer.from(bytes);
}

function requireByte(value: number, field: string): number {
    if (
        !Number.isInteger(value) ||
        value < 0 ||
        value > 0xff
    ) {
        throw new RangeError(`${field} must be an unsigned byte`);
    }

    return value;
}

function requireSignedByte(value: number, field: string): number {
    if (
        !Number.isInteger(value) ||
        value < -0x80 ||
        value > 0x7f
    ) {
        throw new RangeError(`${field} must fit in a signed byte`);
    }

    return value < 0 ? value + 0x100 : value;
}

function encodeMetaPayload(
    type: number,
    data: MidiMetaPayload,
): Buffer {
    if (Buffer.isBuffer(data) || data instanceof Uint8Array) {
        return Buffer.from(data);
    }

    if (
        data &&
        typeof data === "object" &&
        "bytes" in data
    ) {
        return Buffer.from(
            (data as DefaultMetaPayload).bytes,
        );
    }

    const payload = (data ?? {}) as Record<string, any>;

    switch (type) {
        case MetaType.SequenceNumber: {
            const result = Buffer.alloc(2);
            result.writeUInt16BE(payload.sequenceNumber, 0);
            return result;
        }

        case MetaType.TextEvent:
        case MetaType.Copyright:
        case MetaType.TrackName:
        case MetaType.InstrumentName:
        case MetaType.Lyric:
        case MetaType.Marker:
        case MetaType.CuePoint:
            return Buffer.from(payload.text ?? "", "ascii");

        case 0x20:
            return Buffer.from([
                requireByte(
                    payload.channel,
                    "MIDI channel prefix",
                ),
            ]);

        case 0x21:
            return Buffer.from([
                requireByte(payload.port, "MIDI port"),
            ]);

        case MetaType.EndOfTrack:
            return Buffer.alloc(0);

        case MetaType.Tempo: {
            const result = Buffer.alloc(3);
            result.writeUIntBE(
                payload.microsecondsPerQuarterNote,
                0,
                3,
            );
            return result;
        }

        case MetaType.SMPTEOffset:
            return Buffer.from([
                requireByte(payload.hr, "SMPTE hour"),
                requireByte(payload.mn, "SMPTE minute"),
                requireByte(payload.se, "SMPTE second"),
                requireByte(payload.fr, "SMPTE frame"),
                requireByte(
                    payload.ff,
                    "SMPTE fractional frame",
                ),
            ]);

        case MetaType.TimeSignature:
            return Buffer.from([
                requireByte(
                    payload.numerator,
                    "time-signature numerator",
                ),
                requireByte(
                    payload.denominator,
                    "time-signature denominator",
                ),
                requireByte(
                    payload.clocksPerClick,
                    "time-signature clocks-per-click",
                ),
                requireByte(
                    payload.thirtySecondNotesPerQuarter,
                    "time-signature thirty-second notes",
                ),
            ]);

        case 0x59:
            return Buffer.from([
                requireSignedByte(
                    payload.key,
                    "key signature key",
                ),
                requireByte(
                    payload.scale,
                    "key-signature scale",
                ),
            ]);

        default:
            throw new Error(
                `Cannot serialize unsupported MIDI meta-event type 0x${type.toString(16)}`,
            );
    }
}

function encodeMidiEvent(event: MidiEvent): Buffer {
    const deltaTime = encodeVariableLengthValue(
        event.deltaTime,
    );

    if (event.status === 0xff && "type" in event) {
        const payload = encodeMetaPayload(
            event.type,
            event.data,
        );

        return Buffer.concat([
            deltaTime,
            Buffer.from([0xff, event.type]),
            encodeVariableLengthValue(payload.length),
            payload,
        ]);
    }

    if (
        event.status === 0xf0 ||
        event.status === 0xf7
    ) {
        const payload = Buffer.from((event as MidiSysExEvent).data);

        return Buffer.concat([
            deltaTime,
            Buffer.from([event.status]),
            encodeVariableLengthValue(payload.length),
            payload,
        ]);
    }

    if (!("messageType" in event)) {
        throw new Error(
            "Cannot serialize an unsupported MIDI event",
        );
    }

    const status =
        event.status >= 0x80 && event.status < 0xf0
            ? event.status
            : event.messageType | (event.channel & 0x0f);

    const messageType = status & 0xf0;
    const data1 = requireByte(
        event.data1,
        "MIDI event data1",
    ) & 0x7f;

    const bytes = [status, data1];

    if (isTwoByteMessage(messageType)) {
        bytes.push(
            requireByte(
                event.data2 ?? 0,
                "MIDI event data2",
            ) & 0x7f,
        );
    }

    return Buffer.concat([
        deltaTime,
        Buffer.from(bytes),
    ]);
}

class MidiHeader {
    format: MidiFormat = 0;
    trackCount: number = 0;
    division: number = 480;
    isSMPTE: boolean = false;
}

class MidiTrack {
    format: MidiFormat = 0;
    name: string = "";
    events: MidiEvent[] = [];

    public getChannelEvents(): MidiChannelEvent[] {
        return this.events.filter(
            (event) => event.status < 0xff,
        ) as MidiChannelEvent[];
    }

    public getMetaEvents(): MidiMetaEvent[] {
        return this.events.filter(
            (event) => event.status === 0xff,
        ) as MidiMetaEvent[];
    }

    public getNotes(): MidiChannelEvent[] {
        return this.getChannelEvents().filter(
            (event) => [
                ChannelMessage.NoteOn,
                ChannelMessage.NoteOff,
            ].includes(event.messageType),
        );
    }

    public getNotesInPitchRange(
        low: number,
        high: number,
    ): MidiChannelEvent[] {
        return this.getNotes().filter(
            (event) => low <= event.data1 && event.data1 < high,
        );
    }

    private getTimedEvents(): TimedMidiEvent[] {
        let tick = 0;

        return this.events.map((event, order) => {
            tick += event.deltaTime;
            return {
                event,
                tick,
                order,
            };
        });
    }

    private isEndOfTrack(event: MidiEvent): event is MidiMetaEvent {
        return (
            event.status === 0xff &&
            "type" in event &&
            event.type === MetaType.EndOfTrack
        );
    }

    private replaceTimedEvents(
        timedEvents: TimedMidiEvent[],
    ): void {
        let previousTick = 0;

        for (const timedEvent of timedEvents) {
            if (timedEvent.tick < previousTick) {
                throw new Error(
                    "MIDI events must be ordered by absolute tick",
                );
            }

            timedEvent.event.deltaTime =
                timedEvent.tick - previousTick;

            previousTick = timedEvent.tick;
        }

        this.events.splice(
            0,
            this.events.length,
            ...timedEvents.map(
                ({ event }) => event,
            ),
        );
    }

    public getAbsoluteTickAt(eventIndex: number): number {
        if (
            !Number.isInteger(eventIndex) ||
            eventIndex < 0 ||
            eventIndex > this.events.length
        ) {
            throw new RangeError(
                "eventIndex is outside the MIDI track",
            );
        }

        let tick = 0;

        for (
            let index = 0;
            index < eventIndex;
            index++
        ) {
            tick += this.events.at(index)?.deltaTime || 0;
        }

        return tick;
    }

    public getInsertionIndexAt(
        absoluteTick: number,
    ): number {
        if (
            !Number.isInteger(absoluteTick) ||
            absoluteTick < 0
        ) {
            throw new RangeError(
                "absoluteTick must be a non-negative integer",
            );
        }

        let tick = 0;
        const endOfTrackIndex = this.events.findIndex(
            (event) => this.isEndOfTrack(event),
        );

        const eventLimit =
            endOfTrackIndex < 0
                ? this.events.length
                : endOfTrackIndex;

        for (let index = 0; index < eventLimit; index++) {
            tick += this.events.at(index)?.deltaTime || 0;

            if (tick > absoluteTick) {
                return index;
            }
        }

        return eventLimit;
    }

    public addNote(
        note: number,
        startDelta: number,
        velocity: number = 100,
        endDelta: number = 240,
        insertAt: number = this.events.length,
    ): {
        noteOn: MidiChannelEvent;
        noteOff: MidiChannelEvent;
    } {
        if (
            !Number.isInteger(note) ||
            note < 0 ||
            note > 127
        ) {
            throw new RangeError(
                "MIDI note must be between 0 and 127",
            );
        }

        if (
            !Number.isInteger(startDelta) ||
            startDelta < 0
        ) {
            throw new RangeError(
                "startDelta must be a non-negative integer",
            );
        }

        if (
            !Number.isInteger(endDelta) ||
            endDelta < 0
        ) {
            throw new RangeError(
                "endDelta must be a non-negative integer",
            );
        }

        if (
            !Number.isInteger(velocity) ||
            velocity < 1 ||
            velocity > 127
        ) {
            throw new RangeError(
                "NoteOn velocity must be between 1 and 127",
            );
        }

        if (
            !Number.isInteger(insertAt) ||
            insertAt < 0 ||
            insertAt > this.events.length
        ) {
            throw new RangeError(
                "insertAt is outside the MIDI track",
            );
        }

        const startTick =
            this.getAbsoluteTickAt(insertAt) + startDelta;
        const endTick = startTick + endDelta;
        const channel = 0;

        const noteOn: MidiChannelEvent = {
            deltaTime: 0,
            status: 0x90 | channel,
            channel,
            messageType: ChannelMessage.NoteOn,
            data1: note,
            data2: velocity,
        };

        const noteOff: MidiChannelEvent = {
            deltaTime: 0,
            status: 0x80 | channel,
            channel,
            messageType: ChannelMessage.NoteOff,
            data1: note,
            data2: 0,
        };

        const timedEvents = this.getTimedEvents();
        const firstNewOrder = timedEvents.length;

        timedEvents.push(
            {
                event: noteOn,
                tick: startTick,
                order: firstNewOrder,
            },
            {
                event: noteOff,
                tick: endTick,
                order: firstNewOrder + 1,
            },
        );

        const finalTick = timedEvents
            .filter(
                ({ event }) => !this.isEndOfTrack(event),
            )
            .reduce(
                (maximum, timedEvent) =>
                    Math.max(maximum, timedEvent.tick),
                0,
            );

        for (const timedEvent of timedEvents) {
            if (this.isEndOfTrack(timedEvent.event)) {
                timedEvent.tick = Math.max(
                    timedEvent.tick,
                    finalTick,
                );
                timedEvent.order = Number.MAX_SAFE_INTEGER;
            }
        }

        timedEvents.sort(
            (a, b) => a.tick - b.tick || a.order - b.order,
        );

        this.replaceTimedEvents(timedEvents);

        return {
            noteOn,
            noteOff,
        };
    }

    public removeNote(
        noteOn: MidiChannelEvent,
        noteOff: MidiChannelEvent,
    ): boolean {
        if (
            noteOn === noteOff ||
            noteOn.data1 !== noteOff.data1
        ) {
            return false;
        }

        if (
            this.events.indexOf(noteOn) < 0 ||
            this.events.indexOf(noteOff) < 0
        ) {
            return false;
        }

        const isNoteOn =
            noteOn.messageType === ChannelMessage.NoteOn &&
            (noteOn.data2 ?? 0) > 0;

        const isNoteOff =
            noteOff.messageType === ChannelMessage.NoteOff ||
            (
                noteOff.messageType === ChannelMessage.NoteOn &&
                (noteOff.data2 ?? 0) === 0
            );

        if (!isNoteOn || !isNoteOff) {
            return false;
        }

        const removed = new Set<MidiEvent>([
            noteOn,
            noteOff,
        ]);

        const remaining = this.getTimedEvents()
            .filter(({ event }) => !removed.has(event));

        this.replaceTimedEvents(remaining);
        return true;
    }

    public toBuffer(): Buffer {
        const endOfTrackIndices = this.events
            .map((event, index) =>
                this.isEndOfTrack(event) ? index : -1,
            )
            .filter((index) => index >= 0);

        if (
            endOfTrackIndices.length > 1 ||
            (
                endOfTrackIndices.length === 1 &&
                endOfTrackIndices[0] !== this.events.length - 1
            )
        ) {
            throw new Error(
                "EndOfTrack must be the final event in a MIDI track",
            );
        }

        const eventBytes = this.events.map(encodeMidiEvent);

        if (endOfTrackIndices.length === 0) {
            eventBytes.push(
                Buffer.from([0x00, 0xff, 0x2f, 0x00]),
            );
        }

        const body = Buffer.concat(eventBytes);
        const chunk = Buffer.alloc(8);

        chunk.write("MTrk", 0, 4, "ascii");
        chunk.writeUInt32BE(body.length, 4);

        return Buffer.concat([chunk, body]);
    }
}

class Midi {
    header: MidiHeader;
    tracks: MidiTrack[];

    constructor(
        data: Buffer | Uint8Array | undefined = undefined,
    ) {
        this.header = new MidiHeader();
        this.tracks = [];

        if (data) {
            this.parse(data);
        }
    }

    static fromFile(filename: string): Midi {
        const data = fs.readFileSync(filename);
        return new Midi(data);
    }

    private parse(data: Buffer | Uint8Array): void {
        const buffer = Buffer.isBuffer(data)
            ? data
            : Buffer.from(data);

        const midiParser = new Parser()
            .useContextVars()
            .nest("header", {
                type: headerParser,
            })
            .array("tracks", {
                type: trackParser,
                length: function (this: any) {
                    return this.header.trackCount;
                },
            });

        const result = midiParser.parse(buffer);

        this.header.format = result.header.format;
        this.header.trackCount = result.header.trackCount;
        this.header.division = result.header.ppqn;
        this.header.isSMPTE = Boolean(
            result.header.isSMPTE,
        );

        this.tracks = result.tracks.map(
            (parsedTrack: any) => {
                const track = new MidiTrack();

                track.format = result.header.format;
                track.events = parsedTrack.events as MidiEvent[];

                const trackNameEvent = track
                    .getMetaEvents()
                    .find(
                        (event) =>
                            event.type === MetaType.TrackName,
                    );

                if (trackNameEvent) {
                    track.name = (
                        trackNameEvent.data as TextMetaPayload
                    ).text;
                }

                return track;
            },
        );
    }

    public getTrack(name: string): MidiTrack | undefined {
        return this.tracks.find(
            (track) => track.name === name,
        );
    }

    public toBuffer(): Buffer {
        const trackCount = this.tracks.length;

        if (
            !Number.isInteger(this.header.format) ||
            this.header.format < 0 ||
            this.header.format > 2
        ) {
            throw new RangeError(
                "MIDI format must be 0, 1, or 2",
            );
        }

        if (
            this.header.format === MidiFormat.Single &&
            trackCount !== 1
        ) {
            throw new Error(
                "Format 0 MIDI files must contain exactly one track",
            );
        }

        if (trackCount === 0) {
            throw new Error(
                "A MIDI file must contain at least one track",
            );
        }

        if (
            !Number.isInteger(this.header.division) ||
            this.header.division < 0 ||
            this.header.division > 0x7fff
        ) {
            throw new RangeError(
                "MIDI division must fit in the lower 15 bits",
            );
        }

        const division = this.header.isSMPTE
            ? 0x8000 | this.header.division
            : this.header.division;

        const header = Buffer.alloc(14);

        header.write("MThd", 0, 4, "ascii");
        header.writeUInt32BE(6, 4);
        header.writeUInt16BE(this.header.format, 8);
        header.writeUInt16BE(trackCount, 10);
        header.writeUInt16BE(division, 12);

        this.header.trackCount = trackCount;

        return Buffer.concat([
            header,
            ...this.tracks.map((track) => track.toBuffer()),
        ]);
    }

    public write(filename: string): void {
        fs.writeFileSync(filename, this.toBuffer());
    }
}

export {
    Midi,
    MidiHeader,
    MidiTrack,
    MidiFormat,
    ChannelMessage,
};