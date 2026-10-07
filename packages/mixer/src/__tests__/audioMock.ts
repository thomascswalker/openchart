export type MockAudioEvent = { data: unknown };

export type MockAudio = {
  volume: number;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  events: Record<string, (event: MockAudioEvent) => void>;
  play: () => void;
  pause: () => void;
  seek: (time: number) => void;
  stop: () => void;
  destroy: () => void;
  on: (eventType: string, callback: (event: MockAudioEvent) => void) => void;
  emit: (eventType: string, data: unknown) => void;
};

export const audioInstances: MockAudio[] = [];
