import { describe, expect, it, vi } from "vitest";
import type { LoggerService } from "../logger";
import { MixerService } from "../mixer";

vi.mock("@openchart/mixer", () => ({
  default: class MockMixer {
    tracks: Record<string, { filename: string }> = {};
    onChange?: () => void;
    onPlay?: (event: unknown) => void;
    onPause?: (event: unknown) => void;
    onStop?: (event: unknown) => void;

    addTrack(id: string, filename: string): void {
      this.tracks[id] = { filename };
      this.onChange?.();
    }

    play(): void {
      this.onChange?.();
    }
  },
}));

describe("MixerService", () => {
  it("publishes a new snapshot when the mixer changes directly", () => {
    const service = new MixerService({
      info: vi.fn(),
      error: vi.fn(),
    } as unknown as LoggerService);
    const listener = vi.fn();
    const initialSnapshot = service.getSnapshot();
    service.subscribe(listener);

    initialSnapshot.mixer.play();

    expect(service.getSnapshot()).not.toBe(initialSnapshot);
    expect(service.getSnapshot().mixer).toBe(initialSnapshot.mixer);
    expect(listener).toHaveBeenCalledOnce();
  });

  it("adds a track from a URL and publishes the updated snapshot", () => {
    const service = new MixerService({
      info: vi.fn(),
      error: vi.fn(),
    } as unknown as LoggerService);
    const listener = vi.fn();
    service.subscribe(listener);

    service.addTrackFromUrl("sample.wav", "/assets/sample.wav");

    expect(service.getTracks()["sample.wav"]?.filename).toBe(
      "/assets/sample.wav",
    );
    expect(listener).toHaveBeenCalledOnce();
  });
});
