import { vi } from "vitest";

vi.mock("@openchart/audio", async () => {
  const { createMockAudio } = await import("./audioMock.js");
  // A stand-in engine whose clock the tests can set directly.
  class MockAudioEngine {
    now = 0;
    state = "running";
    outputLatency = 0;
    disposed = false;
    dispose() {
      this.disposed = true;
    }
  }
  return {
    default: {
      load: (
        filename: string,
        options: Parameters<typeof createMockAudio>[0],
      ) => {
        void filename;
        return createMockAudio(options);
      },
    },
    AudioEngine: MockAudioEngine,
    START_LEAD_SECONDS: 0.03,
  };
});
