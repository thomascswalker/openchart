import AudioSample from "@openchart/audio";
import type {
  AudioEngine,
  AudioEvent,
  AudioEventCallback,
  AudioEventData,
} from "@openchart/audio";

type TrackId = string;

class Track implements Disposable {
  #id: string;
  #audio: AudioSample;
  #filename: string;
  #muted: boolean = false;
  #soloed: boolean = false;
  #soloSuppressed: boolean = false;
  #volume: number;
  #volumeScale: number = 1;
  #eventListeners = new Map<AudioEvent, AudioEventCallback>();

  constructor(id: string, filename: string, engine?: AudioEngine) {
    this.#id = id;
    this.#filename = filename;
    this.#audio = AudioSample.load(filename, {
      engine,
      onLoaded: (event) => this.#emit("loaded", event),
      onPlay: (event) => this.#emit("play", event),
      onPause: (event) => this.#emit("pause", event),
      onStop: (event) => this.#emit("stop", event),
      onEnded: (event) => this.#emit("ended", event),
    });
    this.#volume = 1;
    // Nothing awaits `ready`, so surface load failures instead of leaving an
    // unhandled rejection.
    void Promise.resolve(this.#audio.ready).catch((error: unknown) => {
      console.error(`Failed to load audio track "${filename}"`, error);
    });
  }

  [Symbol.dispose]() {
    this.#audio.dispose();
  }

  public get id(): string {
    return this.#id;
  }

  public get filename(): string {
    return this.#filename;
  }

  public get volume(): number {
    return this.#volume;
  }

  public get effectiveVolume(): number {
    return this.#isSilent ? 0 : this.#volume * this.#volumeScale;
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

  public get soloed(): boolean {
    return this.#soloed;
  }

  public toggleMute() {
    this.muted = !this.muted;
  }

  public setSoloState(soloed: boolean, soloSuppressed: boolean): void {
    this.#soloed = soloed;
    this.#soloSuppressed = soloSuppressed;
    this.#updateVolume();
  }

  /** `when` is an engine context time; share it across tracks to align them. */
  public play(offset?: number, when?: number): boolean {
    return this.#audio.play(offset, when);
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

  public seek(time: number, when?: number): boolean {
    // A stem shorter than the mixer is parked at its own end.
    const duration = this.duration;
    return this.#audio.seek(
      duration > 0 ? Math.min(time, duration) : time,
      when,
    );
  }

  public get duration(): number {
    return this.#audio.duration;
  }

  public pause() {
    return this.#audio.pause();
  }

  public stop() {
    return this.#audio.stop();
  }

  #updateVolume() {
    this.#audio.volume = this.effectiveVolume;
  }

  get #isSilent(): boolean {
    return this.#soloSuppressed || (this.#muted && !this.#soloed);
  }
}
export default Track;
export type { TrackId };
