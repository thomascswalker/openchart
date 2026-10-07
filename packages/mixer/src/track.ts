import type { Audio } from "./types";
import { Audio as AudioFactory } from "ts-audio";

type TrackId = string;

class Track implements Disposable {
  private audio: Audio;
  private _filename: string;
  private _muted: boolean = false;
  private cachedVolume: number = 1;

  constructor(filename: string) {
    this._filename = filename;
    this.audio = AudioFactory({ file: filename, volume: 100 });
  }

  [Symbol.dispose]() {
    this.audio.destroy();
  }

  public get filename(): string {
    return this._filename;
  }

  public get muted(): boolean {
    return this._muted;
  }
  public set muted(value: boolean) {
    this._muted = value;
    if (value) {
      this.cachedVolume = this.audio.volume;
      this.audio.volume = 0;
    } else {
      this.audio.volume = this.cachedVolume;
    }
  }

  public toggleMute() {
    this.muted = !this.muted;
  }
}
export default Track;
export type { TrackId };
