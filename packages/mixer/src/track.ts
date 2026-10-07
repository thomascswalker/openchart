import type { Audio, AudioEvent, AudioEventCallback } from "./types";
import { Audio as AudioFactory } from "ts-audio";

type TrackId = string;

class Track implements Disposable {
  private _audio: Audio;
  private _filename: string;
  private _muted: boolean = false;
  private _volume: number;
  private _volumeScale: number = 1;

  constructor(filename: string) {
    this._filename = filename;
    this._audio = AudioFactory({ file: filename, volume: 100 });
    this._volume = this._audio.volume;
  }

  [Symbol.dispose]() {
    this._audio.destroy();
  }

  public get filename(): string {
    return this._filename;
  }

  public get volume(): number {
    return this._audio.volume;
  }

  public set volume(value: number) {
    this._volume = value;
    this.updateVolume();
  }

  public set volumeScale(value: number) {
    this._volumeScale = value;
    this.updateVolume();
  }

  public get muted(): boolean {
    return this._muted;
  }
  public set muted(value: boolean) {
    this._muted = value;
    this.updateVolume();
  }

  public toggleMute() {
    this.muted = !this.muted;
  }

  public play() {
    this._audio.play();
  }

  private on(eventType: AudioEvent, callback: AudioEventCallback) {
    this._audio.on(eventType, callback);
  }

  public set onReady(callback: AudioEventCallback) {
    this.on("ready", callback);
  }

  public set onState(callback: AudioEventCallback) {
    this.on("state", callback);
  }

  public set onStart(callback: AudioEventCallback) {
    this.on("start", callback);
  }

  public set onEnd(callback: AudioEventCallback) {
    this.on("end", callback);
  }

  public get playing(): boolean {
    return this._audio.isPlaying;
  }

  public get currentTime(): number {
    return this._audio.currentTime;
  }

  public seek(time: number) {
    this._audio.seek(time);
  }

  public get duration(): number {
    return this._audio.duration;
  }

  public pause() {
    this._audio.pause();
  }

  public stop() {
    this._audio.stop();
  }

  private updateVolume() {
    this._audio.volume = this._muted ? 0 : this._volume * this._volumeScale;
  }
}
export default Track;
export type { TrackId };
