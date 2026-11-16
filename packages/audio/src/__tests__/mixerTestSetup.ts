export async function createSampleMock() {
  const { createMockAudio } = await import('./audioMock.js');
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
}

export function createEngineMock() {
  class MockAudioEngine {
    now = 0;
    state = 'running';
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
}
