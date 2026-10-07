import { describe, expect, it, vi } from "vitest";
import { AudioService, type AudioPlayer } from "../audio";

const createAudio = vi.hoisted(() => vi.fn());
vi.mock("ts-audio", () => ({ Audio: createAudio }));

function createPlayer() {
  const events = new Map<string, () => void>();
  const player = {
    duration: 4,
    currentTime: 0,
    volume: 1,
    isPlaying: false,
    play: vi.fn(),
    pause: vi.fn(),
    seek: vi.fn(),
    destroy: vi.fn(),
    on: (event: string, callback: () => void) => events.set(event, callback),
    off: (event: string) => events.delete(event),
  } as unknown as AudioPlayer;
  return { player, events };
}

describe("AudioService", () => {
  it("publishes playback state and applies source controls", () => {
    const service = new AudioService();
    const { player, events } = createPlayer();
    const listener = vi.fn();
    service.subscribe(listener);
    service.setAudioSource(
      {
        role: "single",
        fileName: "song.wav",
        url: "https://example.test/song.wav",
        enabled: true,
        volume: 0.8,
      },
      player,
    );

    expect(service.getSnapshot().audio).toBe(player);
    expect(service.getSnapshot().duration).toBe(4_000);
    expect(service.getSnapshot().fileName).toBe("song.wav");
    expect(listener).toHaveBeenCalledOnce();

    service.setSourceVolume("single", 0.25);
    expect(player.volume).toBe(0.25);
    service.setSourceEnabled("single", false);
    expect(player.volume).toBe(0);
    service.play();
    service.pause();
    service.seek(2);
    expect(player.play).not.toHaveBeenCalled();
    expect(player.pause).toHaveBeenCalledOnce();
    expect(player.seek).toHaveBeenCalledWith(2);

    events.get("end")?.();
    expect(service.getSnapshot().endCount).toBe(1);
    service.dispose();
  });

  it("destroys replaced players and clears service resources on disposal", () => {
    const service = new AudioService();
    const first = createPlayer();
    const second = createPlayer();
    const source = {
      role: "lead" as const,
      fileName: "lead.wav",
      url: "https://example.test/lead.wav",
      enabled: true,
      volume: 1,
    };

    service.setAudioSource(source, first.player);
    service.setAudioSource(source, second.player);
    expect(first.player.destroy).toHaveBeenCalledOnce();

    service.dispose();
    expect(second.player.destroy).toHaveBeenCalledOnce();
    expect(service.getSnapshot().players.size).toBe(0);
  });

  it("recreates a decoded paused player with its pending seek before playback", async () => {
    const service = new AudioService();
    const first = createPlayer();
    const second = createPlayer();
    createAudio
      .mockReturnValueOnce(first.player)
      .mockReturnValueOnce(second.player);
    service.setAudioSource({
      role: "lead",
      fileName: "lead.wav",
      url: "https://example.test/lead.wav",
      enabled: true,
      volume: 1,
    });

    await vi.waitFor(() => {
      expect(service.getSnapshot().players.get("lead")).toBe(first.player);
    });
    service.seek(2);

    expect(first.player.seek).not.toHaveBeenCalled();
    service.play();

    expect(first.player.destroy).toHaveBeenCalledOnce();
    expect(second.player.seek).toHaveBeenCalledWith(2);
    expect(second.player.play).toHaveBeenCalledOnce();
    expect(service.getSnapshot().duration).toBe(4_000);
    service.dispose();
  });
});
