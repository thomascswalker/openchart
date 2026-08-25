// https://midimusic.github.io/tech/midispec.html

class MidiHeader {
    readonly magic: string = "MThd";
    readonly length: number = 6;
    format: number = 0;
    trackCount: number = 0;
    division: number = 480;
}

class MidiTrack {
    readonly magic: string = "MTrk";
}

class Midi {
    header: MidiHeader;
    tracks: MidiTrack[];

    constructor() {
        this.header = new MidiHeader();
        this.tracks = [];
    }
}

export {Midi};