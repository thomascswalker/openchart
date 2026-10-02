import { describe, expect, it, vi } from "vitest";
import { AudioService, type AudioPlayer } from "../audio";
import { snapToPreviousTimelineBoundary, TimelineService } from "../timeline";

describe("timeline snap pause", () => {
  it("snaps to the previous boundary when enabled", () => {
    expect(snapToPreviousTimelineBoundary(950, 480, 4, true)).toBe(480);
    expect(snapToPreviousTimelineBoundary(480, 480, 4, true)).toBe(480);
  });

  it("preserves the exact tick when snap is disabled", () => {
    expect(snapToPreviousTimelineBoundary(950, 480, 4, false)).toBe(950);
  });
});

describe("TimelineService", () => {
  it("supports MIDI-only playback and seeks the audio and feedback engines", () => {
    const audio = new AudioService();
    const player: AudioPlayer = {
      duration: 0,
      currentTime: 0,
      play: vi.fn(),
      pause: vi.fn(),
      seek: vi.fn(),
      destroy: vi.fn(),
    };
    const feedback = {
      start: vi.fn(),
      stop: vi.fn(),
      seek: vi.fn(),
      updateTick: vi.fn(),
      isMetronomeEnabled: false,
      isClapEnabled: false,
      toggleMetronome: vi.fn(),
      toggleClap: vi.fn(),
      setActiveView: vi.fn(),
      previewTrack: vi.fn(),
      previewNotes: vi.fn(),
      stopPreview: vi.fn(),
    };
    const timeline = new TimelineService(audio);
    const midi = {
      header: { division: 480 },
      getTempoChanges: () => [{ tick: 0, microsecondsPerQuarterNote: 500_000 }],
      tracks: [{ getNotes: () => [{ end: 960 }] }],
    } as unknown as import("@midiedit/core").Midi;
    timeline.configure({
      midiData: midi,
      feedback,
      snapEnabled: false,
      snapDenominator: 4,
    });

    expect(timeline.getSnapshot().canPlay).toBe(true);
    expect(timeline.getSnapshot().totalTimelineTicks).toBe(960);
    timeline.setPlaybackTick(240);
    expect(feedback.seek).toHaveBeenCalledWith(240);
    expect(player.seek).not.toHaveBeenCalled();
    timeline.dispose();
    audio.dispose();
  });

  it("pauses with grid snapping and notifies subscribers", () => {
    const audio = new AudioService();
    const timeline = new TimelineService(audio);
    const feedback = {
      start: vi.fn(),
      stop: vi.fn(),
      seek: vi.fn(),
      updateTick: vi.fn(),
      isMetronomeEnabled: false,
      isClapEnabled: false,
      toggleMetronome: vi.fn(),
      toggleClap: vi.fn(),
      setActiveView: vi.fn(),
      previewTrack: vi.fn(),
      previewNotes: vi.fn(),
      stopPreview: vi.fn(),
    };
    const midi = {
      header: { division: 480 },
      getTempoChanges: () => [{ tick: 0, microsecondsPerQuarterNote: 500_000 }],
      tracks: [{ getNotes: () => [{ end: 1_920 }] }],
    } as unknown as import("@midiedit/core").Midi;
    const frame = vi.fn(() => 1);
    vi.stubGlobal("requestAnimationFrame", frame);
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    const listener = vi.fn();
    timeline.subscribe(listener);
    timeline.configure({
      midiData: midi,
      feedback,
      snapEnabled: true,
      snapDenominator: 4,
    });
    timeline.setPlaybackTick(950);
    timeline.play();
    timeline.pause();

    expect(timeline.getSnapshot().isPlaying).toBe(false);
    expect(timeline.getSnapshot().playbackTick).toBe(480);
    expect(listener).toHaveBeenCalled();
    timeline.dispose();
    audio.dispose();
    vi.unstubAllGlobals();
  });
});
