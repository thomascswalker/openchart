import { describe, expect, it, vi } from "vitest";
import type { FileSystemService } from "../filesystem";
import type { ILoggerService } from "../logger";
import { MixerService } from "../mixer";

vi.mock("@openchart/mixer", () => ({
  default: class MockMixer {
    onChange?: () => void;
    onPlay?: (event: unknown) => void;
    onPause?: (event: unknown) => void;
    onStop?: (event: unknown) => void;

    play(): void {
      this.onChange?.();
    }
  },
}));

describe("MixerService", () => {
  it("publishes a new snapshot when the mixer changes directly", () => {
    const service = new MixerService(
      { info: vi.fn(), error: vi.fn() } as unknown as ILoggerService,
      {} as FileSystemService,
    );
    const listener = vi.fn();
    const initialSnapshot = service.getSnapshot();
    service.subscribe(listener);

    initialSnapshot.mixer.play();

    expect(service.getSnapshot()).not.toBe(initialSnapshot);
    expect(service.getSnapshot().mixer).toBe(initialSnapshot.mixer);
    expect(listener).toHaveBeenCalledOnce();
  });
});
