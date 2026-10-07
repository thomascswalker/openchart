import { vi } from "vitest";

vi.mock("ts-audio", () => ({
  Audio: () => ({
    volume: 1,
    isPlaying: false,
    currentTime: 0,
    play: function () { this.isPlaying = true; },
    pause: function () { this.isPlaying = false; },
    stop: function () { this.isPlaying = false; this.currentTime = 0; },
    destroy: () => { },
  }),
}));
