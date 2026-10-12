import Track, { type TrackId } from "./track";
import type { AudioEvent, AudioEventCallback } from "@openchart/audio";

class Mixer {
  #tracks: Record<TrackId, Track> = {};
  #masterVolume: number = 1;
  #eventListeners = new Map<AudioEvent, AudioEventCallback[]>();
  #trackEventHandlers = new Map<AudioEvent, AudioEventCallback>();
  #onChange?: () => void;

  public addTrack(id: TrackId, filename: string) {
    const track = new Track(filename);
    track.volumeScale = this.#masterVolume;
    this.#tracks[id] = track;
    this.#attachTrackEvents(track);
    this.#notifyChange();
  }

  public removeTrack(id: TrackId) {
    if (this.#tracks[id]) {
      this.#tracks[id][Symbol.dispose]();
      delete this.#tracks[id];
      this.#notifyChange();
    }
  }

  public getTrack(id: TrackId): Track | undefined {
    return this.#tracks[id];
  }

  public get tracks(): Record<TrackId, Track> {
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

  public get currentTime(): number {
    for (const key in this.#tracks) {
      return this.#tracks[key].currentTime;
    }
    return 0;
  }

  public seek(time: number) {
    for (const key in this.#tracks) {
      this.#tracks[key].seek(time);
    }
    this.#notifyChange();
  }

  public seekStart() {
    for (const key in this.#tracks) {
      this.#tracks[key].seek(0);
    }
    this.#notifyChange();
  }

  public seekEnd() {
    for (const key in this.#tracks) {
      this.#tracks[key].seek(this.#tracks[key].duration);
    }
    this.#notifyChange();
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

  #attachTrackEvents(track: Track): void {
    track.onLoaded = this.#getTrackEventHandler("loaded");
    track.onPlay = this.#getTrackEventHandler("play");
    track.onPause = this.#getTrackEventHandler("pause");
    track.onStop = this.#getTrackEventHandler("stop");
    track.onEnded = this.#getTrackEventHandler("ended");
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
    for (const key in this.#tracks) {
      if (this.#tracks[key].playing) {
        return true;
      }
    }
    return false;
  }

  public play() {
    for (const key in this.#tracks) {
      this.#tracks[key].play();
    }
    this.#notifyChange();
  }

  public pause() {
    for (const key in this.#tracks) {
      this.#tracks[key].pause();
    }
    this.#notifyChange();
  }

  public stop() {
    for (const key in this.#tracks) {
      this.#tracks[key].stop();
    }
    this.#notifyChange();
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

export default Mixer;
