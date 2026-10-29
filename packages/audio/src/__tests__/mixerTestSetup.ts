import { vi } from "vitest";

vi.mock("../sample.js", async () => {
  const { createMockAudio } = await import("./audioMock.js");
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
  };
});

vi.mock("../engine.js", () => {
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
    AudioEngine: MockAudioEngine,
    START_LEAD_SECONDS: 0.03,
  };
});
