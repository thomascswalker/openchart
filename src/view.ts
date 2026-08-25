import { Midi } from "./midi.js";

enum Instrument {
    Lead,
    Groove,
    Drums,
    Vocals
}

class SongView {
    midi: Midi;

    constructor(midi: Midi) {
        this.midi = midi;
    }
}

export { SongView };