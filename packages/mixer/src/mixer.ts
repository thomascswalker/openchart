import Track, { type TrackId } from "./track";

class Mixer {
  private _tracks: Record<TrackId, Track> = {};
  private _masterVolume: number = 1;

  public addTrack(id: TrackId, filename: string) {
    const track = new Track(filename);
    track.volumeScale = this._masterVolume;
    this._tracks[id] = track;
  }

  public removeTrack(id: TrackId) {
    if (this._tracks[id]) {
      delete this._tracks[id];
    }
  }

  public getTrack(id: TrackId): Track | undefined {
    return this._tracks[id];
  }

  public get tracks(): Record<TrackId, Track> {
    return this._tracks;
  }

  public listTracks(): string[] {
    return Object.keys(this._tracks);
  }

  public get masterVolume(): number {
    return this._masterVolume;
  }
  public set masterVolume(value: number) {
    this._masterVolume = value;
    for (const key in this._tracks) {
      this._tracks[key].volumeScale = value;
    }
  }

  public solo(id: TrackId) {
    for (const key in this._tracks) {
      this._tracks[key].muted = key !== id;
    }
  }

  public mute(id: TrackId) {
    if (this._tracks[id]) {
      this._tracks[id].muted = true;
    }
  }

  public get currentTime(): number {
    for (const key in this._tracks) {
      return this._tracks[key].currentTime;
    }
    return 0;
  }

  public get playing(): boolean {
    for (const key in this._tracks) {
      if (this._tracks[key].playing) {
        return true;
      }
    }
    return false;
  }

  public play() {
    for (const key in this._tracks) {
      this._tracks[key].play();
    }
  }

  public pause() {
    for (const key in this._tracks) {
      this._tracks[key].pause();
    }
  }

  public stop() {
    for (const key in this._tracks) {
      this._tracks[key].stop();
    }
  }
}

export default Mixer;
