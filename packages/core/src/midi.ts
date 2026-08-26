// https://midimusic.github.io/tech/midispec.html

import * as fs from "fs";
import { Parser } from "binary-parser/dist/binary_parser.js";
import { ChannelMessage, MetaType, MidiChannelEvent, MidiEvent, MidiFormat, MidiMetaEvent, TextMetaPayload, TimedMidiEvent } from "./types.js";
import { encodeMidiEvent } from "./util.js";
import { headerParser, trackParser } from "./parsers.js";

class MidiNote {
    on: MidiChannelEvent;
    off: MidiChannelEvent;

    constructor(on: MidiChannelEvent, off: MidiChannelEvent) {
        this.on = on;
        this.off = off;
    }
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

    public constructor(name: string = "") {
        this.name = name;
    }

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

    public getNoteEvents(): MidiChannelEvent[] {
        return this.getChannelEvents().filter(
            (event) => [
                ChannelMessage.NoteOn,
                ChannelMessage.NoteOff,
            ].includes(event.messageType),
        );
    }

    public getNoteEventsInPitchRange(
        low: number,
        high: number,
    ): MidiChannelEvent[] {
        return this.getNoteEvents().filter(
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

        const startTick = this.getAbsoluteTickAt(insertAt) + startDelta;
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
            .filter(({ event }) => !this.isEndOfTrack(event))
            .reduce((maximum, timedEvent) => Math.max(maximum, timedEvent.tick), 0);

        for (const timedEvent of timedEvents) {
            if (this.isEndOfTrack(timedEvent.event)) {
                timedEvent.tick = Math.max(
                    timedEvent.tick,
                    finalTick,
                );
                timedEvent.order = Number.MAX_SAFE_INTEGER;
            }
        }

        timedEvents.sort((a, b) => a.tick - b.tick || a.order - b.order);

        this.replaceTimedEvents(timedEvents);

        return { noteOn, noteOff };
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

export { Midi, MidiFormat, MidiHeader, MidiTrack, MidiNote };
