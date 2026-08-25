import { Midi, MidiTrack } from "./midi.js";

enum Instrument {
    Lead = "LEAD GUITAR",
    Groove = "RHYTHM GUITAR",
    Drums = "DRUMS",
    Vocals = "VOCALS"
}

class TrackView {
    track: MidiTrack | undefined;
    validator: (track: MidiTrack) => boolean;

    constructor(
        track: MidiTrack | undefined,
        validator: ((track: MidiTrack) => boolean) = (track: MidiTrack) => { return true }
    ) {
        this.track = track;
        this.validator = validator;
    }

    public isValid(): boolean {
        if (typeof this.track === "undefined") {
            return false;
        }
        return this.validator(this.track);
    }
}

class SongView {
    private midi: Midi;

    private leadView: TrackView;
    private grooveView: TrackView;
    private drumsView: TrackView;
    private vocalsView: TrackView;

    constructor(midi: Midi) {
        this.midi = midi;
        this.leadView = new TrackView(this.midi.getTrack(Instrument.Lead));
        this.grooveView = new TrackView(this.midi.getTrack(Instrument.Groove));
        this.drumsView = new TrackView(this.midi.getTrack(Instrument.Drums));
        this.vocalsView = new TrackView(this.midi.getTrack(Instrument.Vocals));
    }

    public sync(): void {
        this.leadView = new TrackView(this.midi.getTrack(Instrument.Lead));
        this.grooveView = new TrackView(this.midi.getTrack(Instrument.Groove));
        this.drumsView = new TrackView(this.midi.getTrack(Instrument.Drums));
        this.vocalsView = new TrackView(this.midi.getTrack(Instrument.Vocals));
    }

    public getInstrumentView(instrument: Instrument): TrackView | undefined {
        switch (instrument) {
            case Instrument.Lead: return this.leadView;
            case Instrument.Groove: return this.grooveView;
            case Instrument.Drums: return this.drumsView;
            case Instrument.Vocals: return this.vocalsView;
        }
    }
}

export { SongView, Instrument };