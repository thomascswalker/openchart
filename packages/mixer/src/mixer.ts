import TrackClass, { type TrackId } from "./track";
import { AudioEngine, START_LEAD_SECONDS } from "@openchart/audio";
import type {
  AudioEngineOptions,
  AudioEvent,
  AudioEventCallback,
} from "@openchart/audio";

export interface MixerOptions {
  /** Share an existing engine; otherwise the mixer creates (and owns) one. */
  engine?: AudioEngine;
  engineOptions?: AudioEngineOptions;
}

/**
 * Mixes stems on one shared audio clock. The mixer is the transport: it
 * schedules every stem against the same context time, and its `currentTime`
 * is derived from that clock, so it is the single source of truth for the
 * playback position.
 */
class Mixer {
  readonly #engine: AudioEngine;
  readonly #ownsEngine: boolean;
  #tracks: Record<TrackId, TrackClass> = {};
  /* Transport state: `#offset` is the position (seconds) at context time `#startedAt` */
  #playing: boolean = false;
  #offset: number = 0;
  #startedAt: number = 0;
  #masterVolume: number = 1;
  #eventListeners = new Map<AudioEvent, AudioEventCallback[]>();
  #trackEventHandlers = new Map<AudioEvent, AudioEventCallback>();
  #onChange?: () => void;

  constructor(options: MixerOptions = {}) {
    this.#engine = options.engine ?? new AudioEngine(options.engineOptions);
    this.#ownsEngine = options.engine === undefined;
  }

  /** The shared engine (context, master bus) every track plays through. */
  public get engine(): AudioEngine {
    return this.#engine;
  }

  public addTrack(id: TrackId, filename: string) {
    this.#tracks[id]?.[Symbol.dispose]();
    const track = new TrackClass(filename, this.#engine);
    track.volumeScale = this.#masterVolume;
    this.#tracks[id] = track;
    this.#attachTrackEvents(track);
    this.#notifyChange();
  }

  /** Releases every track and, if the mixer created it, the audio engine. */
  public dispose(): void {
    for (const key in this.#tracks) {
      this.#tracks[key][Symbol.dispose]();
    }
    this.#tracks = {};
    this.#playing = false;
    if (this.#ownsEngine) {
      this.#engine.dispose();
    }
  }

  public removeTrack(id: TrackId) {
    if (this.#tracks[id]) {
      this.#tracks[id][Symbol.dispose]();
      delete this.#tracks[id];
      this.#settleTransport();
      this.#notifyChange();
    }
  }

  public getTrack(id: TrackId): TrackClass | undefined {
    return this.#tracks[id];
  }

  public get tracks(): Record<TrackId, TrackClass> {
    return this.#tracks;
  }

  public listTracks(): string[] {
    return Object.keys(this.#tracks);
  }

  public get masterVolume(): number {
    return this.#masterVolume;
  }
  public set masterVolume(value: number) {
    this.#masterVolume = value;
    for (const key in this.#tracks) {
      this.#tracks[key].volumeScale = value;
    }
    this.#notifyChange();
  }

  public solo(id: TrackId) {
    for (const key in this.#tracks) {
      this.#tracks[key].muted = key !== id;
    }
    this.#notifyChange();
  }

  public mute(id: TrackId) {
    if (this.#tracks[id]) {
      this.#tracks[id].muted = true;
      this.#notifyChange();
    }
  }

  /**
   * Playback position in seconds, derived from the audio clock. While playing
   * it trails the clock by the output latency, so it matches what is audible.
   */
  public get currentTime(): number {
    if (!this.#playing) {
      return this.#offset;
    }
    const elapsed =
      this.#engine.now - this.#startedAt - this.#engine.outputLatency;
    const position = this.#offset + Math.max(0, elapsed);
    const duration = this.duration;
    return duration > 0 ? Math.min(position, duration) : position;
  }

  /**
   * The playback position, only while the audio clock is actually running
   * (playing, context not suspended). `null` means callers must not treat the
   * audio as the time source, e.g. before the context is allowed to start.
   */
  public get clockTime(): number | null {
    return this.#playing && this.#engine.state === "running"
      ? this.currentTime
      : null;
  }

  public seek(time: number) {
    const target = this.#clampTime(time);
    if (this.#playing) {
      const when = this.#engine.now + START_LEAD_SECONDS;
      for (const key in this.#tracks) {
        this.#tracks[key].seek(target, when);
      }
      this.#offset = target;
      this.#startedAt = when;
    } else {
      for (const key in this.#tracks) {
        this.#tracks[key].seek(target);
      }
      this.#offset = target;
    }
    this.#notifyChange();
  }

  public seekStart() {
    this.seek(0);
  }

  public seekEnd() {
    this.seek(this.duration);
  }

  public get duration(): number {
    let maxDuration = 0;
    for (const key in this.#tracks) {
      if (this.#tracks[key].duration > maxDuration) {
        maxDuration = this.#tracks[key].duration;
      }
    }
    return maxDuration;
  }

  #on(eventType: AudioEvent, callback: AudioEventCallback) {
    const listeners = this.#eventListeners.get(eventType) ?? [];
    listeners.push(callback);
    this.#eventListeners.set(eventType, listeners);
  }

  #attachTrackEvents(track: TrackClass): void {
    const onLoaded = this.#getTrackEventHandler("loaded");
    track.onLoaded = (event) => {
      this.#joinTransport(track);
      onLoaded(event);
    };
    track.onPlay = this.#getTrackEventHandler("play");
    track.onPause = this.#getTrackEventHandler("pause");
    track.onStop = this.#getTrackEventHandler("stop");
    const onEnded = this.#getTrackEventHandler("ended");
    track.onEnded = (event) => {
      this.#settleTransport();
      onEnded(event);
    };
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

  public set onChange(callback: () => void) {
    this.#onChange = callback;
  }

  public get playing(): boolean {
    return this.#playing;
  }

  public play() {
    if (this.#playing) {
      return;
    }
    const duration = this.duration;
    const offset = duration > 0 && this.#offset >= duration ? 0 : this.#offset;
    const when = this.#engine.now + START_LEAD_SECONDS;
    let started = false;
    for (const key in this.#tracks) {
      started = this.#tracks[key].play(offset, when) || started;
    }
    if (started) {
      this.#playing = true;
      this.#offset = offset;
      this.#startedAt = when;
    }
    this.#notifyChange();
  }

  public pause() {
    if (this.#playing) {
      this.#offset = this.currentTime;
      this.#playing = false;
    }
    for (const key in this.#tracks) {
      this.#tracks[key].pause();
    }
    this.#notifyChange();
  }

  public stop() {
    for (const key in this.#tracks) {
      this.#tracks[key].stop();
    }
    this.#playing = false;
    this.#offset = 0;
    this.#notifyChange();
  }

  #clampTime(time: number): number {
    const duration = this.duration;
    const lower = Math.max(0, time);
    return duration > 0 ? Math.min(lower, duration) : lower;
  }

  /** A stem that finishes loading mid-playback joins at the current position. */
  #joinTransport(track: TrackClass): void {
    if (!this.#playing) {
      return;
    }
    // Raw clock position (no latency offset): the voice is scheduled on the
    // audio clock, so it must be placed where the other stems are on it.
    const when = Math.max(
      this.#engine.now + START_LEAD_SECONDS,
      this.#startedAt,
    );
    const position = this.#offset + (when - this.#startedAt);
    if (position <= track.duration) {
      track.play(position, when);
    }
  }

  /** The transport ends once every stem has finished. */
  #settleTransport(): void {
    if (!this.#playing) {
      return;
    }
    for (const key in this.#tracks) {
      if (this.#tracks[key].playing) {
        return;
      }
    }
    this.#offset = this.duration;
    this.#playing = false;
  }

  #getTrackEventHandler(eventType: AudioEvent): AudioEventCallback {
    let handler = this.#trackEventHandlers.get(eventType);
    if (!handler) {
      handler = (event) => {
        for (const callback of this.#eventListeners.get(eventType) ?? []) {
          callback(event);
        }
        this.#notifyChange();
      };
      this.#trackEventHandlers.set(eventType, handler);
    }
    return handler;
  }

  #notifyChange(): void {
    this.#onChange?.();
  }
}

namespace Mixer {
  export type Track = TrackClass;
  export const Track = TrackClass;
}

export default Mixer;
