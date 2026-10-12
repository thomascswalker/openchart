import AudioSample from "@openchart/audio";
import type {
  AudioEvent,
  AudioEventCallback,
  AudioEventData,
} from "@openchart/audio";

type TrackId = string;

class Track implements Disposable {
  #audio: AudioSample;
  #filename: string;
  #muted: boolean = false;
  #volume: number;
  #volumeScale: number = 1;
  #eventListeners = new Map<AudioEvent, AudioEventCallback>();

  constructor(filename: string) {
    this.#filename = filename;
    this.#audio = AudioSample.load(filename, {
      onLoaded: (event) => this.#emit("loaded", event),
      onPlay: (event) => this.#emit("play", event),
      onPause: (event) => this.#emit("pause", event),
      onStop: (event) => this.#emit("stop", event),
      onEnded: (event) => this.#emit("ended", event),
    });
    this.#volume = 1;
  }

  [Symbol.dispose]() {
    this.#audio.dispose();
  }

  public get filename(): string {
    return this.#filename;
  }

  public get volume(): number {
    return this.#muted ? 0 : this.#volume * this.#volumeScale;
  }

  public set volume(value: number) {
    this.#volume = value;
    this.#updateVolume();
  }

  public set volumeScale(value: number) {
    this.#volumeScale = value;
    this.#updateVolume();
  }

  public get muted(): boolean {
    return this.#muted;
  }
  public set muted(value: boolean) {
    this.#muted = value;
    this.#updateVolume();
  }

  public toggleMute() {
    this.muted = !this.muted;
  }

  public play() {
    this.#audio.play();
  }

  #on(eventType: AudioEvent, callback: AudioEventCallback) {
    this.#eventListeners.set(eventType, callback);
  }

  #emit(eventType: AudioEvent, event: AudioEventData): void {
    this.#eventListeners.get(eventType)?.(event);
  }

  public set onLoaded(callback: AudioEventCallback) {
    this.#on("loaded", callback);
  }

  public set onPlay(callback: AudioEventCallback) {
    this.#on("play", callback);
  }

  public set onPause(callback: AudioEventCallback) {
    this.#on("pause", callback);
  }

  public set onStop(callback: AudioEventCallback) {
    this.#on("stop", callback);
  }

  public set onEnded(callback: AudioEventCallback) {
    this.#on("ended", callback);
  }

  public get playing(): boolean {
    return this.#audio.playing;
  }

  public get currentTime(): number {
    return this.#audio.currentTime;
  }

  public seek(time: number) {
    this.#audio.seek(time);
  }

  public get duration(): number {
    return this.#audio.duration;
  }

  public pause() {
    this.#audio.pause();
  }

  public stop() {
    this.#audio.stop();
  }

  #updateVolume() {
    this.#audio.volume = this.#muted ? 0 : this.#volume * this.#volumeScale;
  }
}
export default Track;
export type { TrackId };
