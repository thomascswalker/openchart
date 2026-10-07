import Track, { type TrackId } from "./track";
import type { AudioEvent, AudioEventCallback } from "./types";

class Mixer {
  private _tracks: Record<TrackId, Track> = {};
  private _masterVolume: number = 1;
  private _eventListeners = new Map<AudioEvent, AudioEventCallback[]>();
  private _trackEventHandlers = new Map<AudioEvent, AudioEventCallback>();

  public addTrack(id: TrackId, filename: string) {
    const track = new Track(filename);
    track.volumeScale = this._masterVolume;
    this._tracks[id] = track;
    for (const eventType of this._eventListeners.keys()) {
      switch (eventType) {
        case "ready":
          track.onReady = this.getTrackEventHandler(eventType);
          break;
        case "state":
          track.onState = this.getTrackEventHandler(eventType);
          break;
        case "start":
          track.onStart = this.getTrackEventHandler(eventType);
          break;
        case "end":
          track.onEnd = this.getTrackEventHandler(eventType);
          break;
      }
    }
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

  public seek(time: number) {
    for (const key in this._tracks) {
      this._tracks[key].seek(time);
    }
  }

  public seekStart() {
    for (const key in this._tracks) {
      this._tracks[key].seek(0);
    }
  }

  public seekEnd() {
    for (const key in this._tracks) {
      this._tracks[key].seek(this._tracks[key].duration);
    }
  }

  public get duration(): number {
    let maxDuration = 0;
    for (const key in this._tracks) {
      if (this._tracks[key].duration > maxDuration) {
        maxDuration = this._tracks[key].duration;
      }
    }
    return maxDuration;
  }

  private on(eventType: AudioEvent, callback: AudioEventCallback) {
    const listeners = this._eventListeners.get(eventType) ?? [];
    listeners.push(callback);
    this._eventListeners.set(eventType, listeners);

    for (const key in this._tracks) {
      const track = this._tracks[key];
      switch (eventType) {
        case "ready":
          track.onReady = this.getTrackEventHandler(eventType);
          break;
        case "state":
          track.onState = this.getTrackEventHandler(eventType);
          break;
        case "start":
          track.onStart = this.getTrackEventHandler(eventType);
          break;
        case "end":
          track.onEnd = this.getTrackEventHandler(eventType);
          break;
      }
    }
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

  private getTrackEventHandler(eventType: AudioEvent): AudioEventCallback {
    let handler = this._trackEventHandlers.get(eventType);
    if (!handler) {
      handler = (event) => {
        for (const callback of this._eventListeners.get(eventType) ?? []) {
          callback(event);
        }
      };
      this._trackEventHandlers.set(eventType, handler);
    }
    return handler;
  }
}

export default Mixer;
