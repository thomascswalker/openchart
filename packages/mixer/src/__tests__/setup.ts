import { vi } from "vitest";
import { audioInstances, type MockAudio } from "./audioMock.js";

vi.mock("ts-audio", () => ({
  Audio: () => {
    const audio: MockAudio = {
      volume: 1,
      isPlaying: false,
      currentTime: 0,
      duration: 0,
      events: {},
      play() {
        this.isPlaying = true;
      },
      pause() {
        this.isPlaying = false;
      },
      seek(time) {
        this.currentTime = time;
      },
      stop() {
        this.isPlaying = false;
        this.currentTime = 0;
      },
      destroy() { },
      on(eventType, callback) {
        this.events[eventType] = callback;
      },
      emit(eventType, data) {
        this.events[eventType]?.({ data });
      },
    };
    audioInstances.push(audio);
    return audio;
  },
}));
