// https://midimusic.github.io/tech/midispec.html

import { Parser } from "binary-parser/dist/binary_parser.js";

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
}

class Midi {
    header: MidiHeader;
    tracks: MidiTrack[];

    constructor(data: string | undefined = undefined) {
        this.header = new MidiHeader();
        this.tracks = [];

        if (data) {
            this.parse(data);
        }
    }

    private parse(data: string) {
        const ppqnParser = new Parser().bit15('ticksPerQuarterNote');
        const smpteParser = new Parser()
            .bit7('rawFrames', { formatter: function (val) { return 256 - val; } })
            .uint8('ticksPerFrame');
        const parser = new Parser()
            .endianness("big")
            .string("magic", { length: 4, assert: "MThd", })
            .uint32("length")
            .uint8("format")
            .uint8("trackCount")
            .bit1('isSMPTE')
            .choice('division', {
                tag: 'isSMPTE',
                choices: { 0: ppqnParser, 1: smpteParser }
            });
        const result = parser.parse(Buffer.from(data));
        console.log(result);
    }
}

export { Midi };