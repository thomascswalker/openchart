declare class MidiHeader {
    readonly magic: string;
    readonly length: number;
    format: number;
    trackCount: number;
    division: number;
}
declare class MidiTrack {
    readonly magic: string;
}
declare class Midi {
    header: MidiHeader;
    tracks: MidiTrack[];
    constructor();
}
export { Midi };
//# sourceMappingURL=index.d.ts.map