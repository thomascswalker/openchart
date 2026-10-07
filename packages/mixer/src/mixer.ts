import Track, { type TrackId } from "./track";

class Mixer {
  private _tracks: Record<TrackId, Track> = {};

  public addTrack(id: TrackId, filename: string) {
    const track = new Track(filename);
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
}

export default Mixer;
