import { Audio as AudioFactory } from 'ts-audio'

type Audio = ReturnType<typeof AudioFactory>;

class Track implements Disposable {
    private audio: Audio;

    constructor() {
        this.audio = AudioFactory();
    }

    [Symbol.dispose]() {
        this.audio.destroy();
    }
}

class Mixer implements Disposable {
    private tracks: Track[] = [];

    public addTrack() {
        const track = new Track();
        this.tracks.push(track);
    }

    public removeTrack(track: Track) {
        const index = this.tracks.indexOf(track);
        if (index !== -1) {
            this.tracks.splice(index, 1);
        }
    }
}

export default Mixer;
