import type { AudioSampleOptions } from "@openchart/audio";

export type MockAudioEvent = { data: unknown };

export type MockAudio = {
  volume: number;
  playing: boolean;
  currentTime: number;
  duration: number;
  options: AudioSampleOptions;
  play: (offset?: number) => boolean;
  pause: () => boolean;
  seek: (time: number) => boolean;
  stop: () => boolean;
  dispose: () => void;
  emit: (eventType: string, data: unknown) => void;
};

export const audioInstances: MockAudio[] = [];

export function createMockAudio(options: AudioSampleOptions): MockAudio {
  const audio: MockAudio = {
    volume: options.initialVolume ?? 1,
    playing: false,
    currentTime: 0,
    duration: 0,
    options,
    play(offset) {
      if (this.playing) {
        return false;
      }
      this.currentTime = offset ?? this.currentTime;
      this.playing = true;
      this.options.onPlay?.({ data: null });
      return true;
    },
    pause() {
      if (!this.playing) {
        return false;
      }
      this.playing = false;
      this.options.onPause?.({ data: null });
      return true;
    },
    seek(time) {
      this.currentTime = time;
      return true;
    },
    stop() {
      this.playing = false;
      this.currentTime = 0;
      this.options.onStop?.({ data: null });
      return true;
    },
    dispose() {
      this.playing = false;
    },
    emit(eventType, data) {
      switch (eventType) {
        case "loaded":
          this.options.onLoaded?.({ data });
          break;
        case "play":
          this.options.onPlay?.({ data });
          break;
        case "pause":
          this.options.onPause?.({ data });
          break;
        case "stop":
          this.options.onStop?.({ data });
          break;
        case "ended":
          this.options.onEnded?.({ data });
          break;
      }
    },
  };
  audioInstances.push(audio);
  return audio;
}
