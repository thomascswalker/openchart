import { vi } from "vitest";

vi.mock("@openchart/audio", async () => {
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
