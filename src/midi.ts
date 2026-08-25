// https://midimusic.github.io/tech/midispec.html

import assert from "assert";
import { Parser } from "binary-parser/dist/binary_parser.js";


type TData = Buffer | Uint8Array;
const HEADER_LENGTH = 14;
const TRACK_HEADER_LENGTH = 8;

enum MidiFormat {
    Single = 0,
    Multi = 1,
    MultiAsync = 2,
}

class MidiHeader {
    format: MidiFormat = 0;
    trackCount: number = 0;
    division: number = 480;
}

class MidiTrack {
    format: MidiFormat = 0;
    data: any;
}

class Midi {
    header: MidiHeader;
    tracks: MidiTrack[];

    constructor(data: TData | undefined = undefined) {
        this.header = new MidiHeader();
        this.tracks = [];

        if (data) {
            this.parse(data);
        }
    }

    private parse(data: TData) {
        const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data);
        const headerParser = new Parser()
            .string("magic", { length: 4, encoding: 'ascii' })
            .uint32be("length")
            .uint16be("format")
            .uint16be("trackCount")
            .bit1("isSMPTE")
            .bit15("ppqn"); // Disregard SMPTE

        const trackParser = new Parser()
            .string("magic", { length: 4, encoding: 'ascii' })
            .uint32be("length")
            .buffer('data', { length: function (): number { return this.length as number; } });

        const parser = new Parser()
            .nest('header', { type: headerParser })
            .array("tracks", {
                type: trackParser,
                readUntil: "eof",
            });
        const result = parser.parse(buffer);
        console.log(result);
    }
}

export { Midi };