// https://midimusic.github.io/tech/midispec.html
class MidiHeader {
    magic = "MThd";
    length = 6;
    format = 0;
    trackCount = 0;
    division = 480;
}
class MidiTrack {
    magic = "MTrk";
}
class Midi {
    header;
    tracks;
    constructor() {
        this.header = new MidiHeader();
        this.tracks = [];
    }
}
export { Midi };
//# sourceMappingURL=index.js.map