import { beforeEach, describe, expect, it, vi } from "vitest";
import { Difficulty } from "@midiedit/views";
import { AudioService } from "../audio";
import { PlaybackService, snapToPreviousTimelineBoundary } from "../playback";
import type { ApplicationSettings } from "../settings";

const engine = vi.hoisted(() => ({
  configure: vi.fn(),
  start: vi.fn(),
  stop: vi.fn(),
  seek: vi.fn(),
  updateTick: vi.fn(),
  previewTrack: vi.fn(),
  stopPreview: vi.fn(),
  ensureStarted: vi.fn(() => Promise.resolve()),
  dispose: vi.fn(),
}));

vi.mock("../../audio/PlaybackFeedbackEngine", () => ({
  PlaybackFeedbackEngine: vi.fn(function () {
    return engine;
  }),
}));

vi.mock("@midiedit/views", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@midiedit/views")>()),
  SongView: vi.fn(function () {
    return { getInstrumentTrackView: () => undefined };
  }),
}));

type MidiData = import("@midiedit/core").Midi;

function settings(metronomeEnabled = false): ApplicationSettings {
  return { feedback: { metronomeEnabled } } as unknown as ApplicationSettings;
}

function midi(
  tracks: object[] = [
    { getNotes: () => [{ end: 960 }], getTimedEvents: () => [] },
  ],
): MidiData {
  const normalizedTracks = tracks.map((track) => {
    const source = track as {
      events?: { deltaTime: number }[];
      getNotes?: () => { end: number }[];
      getTimedEvents?: () => { tick: number }[];
    };
    if (source.events) return track;
    const timedTicks = source.getTimedEvents?.().map(({ tick }) => tick);
    const ticks = timedTicks?.length
      ? timedTicks
      : (source.getNotes?.().map(({ end }) => end) ?? []);
    let previousTick = 0;
    const events = ticks.map((tick) => {
      const deltaTime = tick - previousTick;
      previousTick = tick;
      return { deltaTime };
    });
    return { ...source, events };
  });
  return {
    header: { division: 480 },
    getTempoChanges: () => [{ tick: 0, microsecondsPerQuarterNote: 500_000 }],
    getTimeSignatureChanges: () => [],
    tracks: normalizedTracks,
  } as unknown as MidiData;
}

function configure(
  service: PlaybackService,
  overrides: Partial<Parameters<PlaybackService["configure"]>[0]> = {},
) {
  service.configure({
    midiData: midi(),
    settings: settings(),
    snapEnabled: false,
    snapDenominator: 4,
    selectedInstrument: "LEAD GUITAR",
    selectedDifficulty: Difficulty.Expert,
    selectedTrackIndex: 0,
    ...overrides,
  });
}

describe("timeline snap pause", () => {
  it("snaps to the previous boundary when enabled", () => {
    expect(snapToPreviousTimelineBoundary(950, 480, 4, true)).toBe(480);
    expect(snapToPreviousTimelineBoundary(480, 480, 4, true)).toBe(480);
  });

  it("preserves the exact tick when snap is disabled", () => {
    expect(snapToPreviousTimelineBoundary(950, 480, 4, false)).toBe(950);
  });
});

describe("PlaybackService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("supports MIDI-only playback and seeks the feedback engine", () => {
    const audio = new AudioService();
    const service = new PlaybackService(audio);
    configure(service);

    expect(service.getSnapshot().canPlay).toBe(true);
    expect(service.getSnapshot().totalTimelineTicks).toBe(960);
    service.setPlaybackTick(240);
    expect(engine.seek).toHaveBeenCalledWith(240);
    service.dispose();
    audio.dispose();
  });

  it("pauses with grid snapping and notifies subscribers", () => {
    const audio = new AudioService();
    const service = new PlaybackService(audio);
    vi.stubGlobal(
      "requestAnimationFrame",
      vi.fn(() => 1),
    );
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    const listener = vi.fn();
    service.subscribe(listener);
    configure(service, {
      midiData: midi([
        { getNotes: () => [{ end: 1_920 }], getTimedEvents: () => [] },
      ]),
      snapEnabled: true,
    });
    service.setPlaybackTick(950);
    service.play();
    expect(engine.start).toHaveBeenCalledWith(950);
    service.pause();

    expect(service.getSnapshot().isPlaying).toBe(false);
    expect(service.getSnapshot().playbackTick).toBe(480);
    expect(engine.stop).toHaveBeenCalled();
    expect(listener).toHaveBeenCalled();
    service.dispose();
    audio.dispose();
    vi.unstubAllGlobals();
  });

  it("plays until the last MIDI event, even past the last note", () => {
    const audio = new AudioService();
    const service = new PlaybackService(audio);
    configure(service, {
      midiData: midi([
        {
          getNotes: () => [{ end: 960 }],
          getTimedEvents: () => [{ tick: 960 }, { tick: 1_440 }],
        },
        { getNotes: () => [], getTimedEvents: () => [{ tick: 2_000 }] },
      ]),
    });

    expect(service.getSnapshot().totalTimelineTicks).toBe(2_000);
    service.seekEnd();
    expect(service.getSnapshot().playbackTick).toBe(2_000);
    service.dispose();
    audio.dispose();
  });

  it("refreshes the timeline from the current document data", () => {
    const audio = new AudioService();
    const service = new PlaybackService(audio);
    const currentTrack = {
      events: [{ deltaTime: 961 }],
      getNotes: () => [{ end: 961 }],
    };
    const currentMidi = midi([currentTrack]);
    configure(service, { midiData: currentMidi });
    currentTrack.events = [{ deltaTime: 3_840 }];

    service.refresh(currentMidi);
    expect(service.getSnapshot().totalTimelineTicks).toBe(3_840);
    service.seekEnd();
    expect(service.getSnapshot().playbackTick).toBe(3_840);

    service.dispose();
    audio.dispose();
  });

  it("follows document edits without an explicit refresh", () => {
    const audio = new AudioService();
    let listener = () => {};
    const track = { events: [{ deltaTime: 961 }] };
    const currentMidi = midi([track]);
    const documentService = {
      subscribe: (next: () => void) => {
        listener = next;
        return () => {};
      },
      getData: () => currentMidi,
    };
    const service = new PlaybackService(audio, documentService as never);
    configure(service, { midiData: currentMidi });
    expect(service.getSnapshot().totalTimelineTicks).toBe(961);

    track.events = [{ deltaTime: 4_320 }, { deltaTime: 1 }];
    listener();
    expect(service.getSnapshot().totalTimelineTicks).toBe(4_321);
    service.seekEnd();
    expect(service.getSnapshot().playbackTick).toBe(4_321);

    service.dispose();
    audio.dispose();
  });

  it("toggles metronome and clap, starting the engine in the gesture", () => {
    const audio = new AudioService();
    const service = new PlaybackService(audio);
    configure(service, { settings: settings(true) });
    expect(service.getSnapshot().isMetronomeEnabled).toBe(true);

    service.toggleMetronome();
    expect(service.getSnapshot().isMetronomeEnabled).toBe(false);
    expect(engine.ensureStarted).not.toHaveBeenCalled();

    service.toggleClap();
    expect(service.getSnapshot().isClapEnabled).toBe(true);
    expect(engine.ensureStarted).toHaveBeenCalledTimes(1);
    expect(engine.configure).toHaveBeenLastCalledWith(
      expect.objectContaining({ clapEnabled: true }),
    );
    service.dispose();
    audio.dispose();
  });

  it("gates highway feedback on the active view and previews notes", () => {
    const audio = new AudioService();
    const service = new PlaybackService(audio);
    configure(service);
    service.setActiveView("highway");
    expect(engine.configure).toHaveBeenLastCalledWith(
      expect.objectContaining({ highwayActive: true }),
    );
    service.setActiveView("piano-roll");
    expect(engine.configure).toHaveBeenLastCalledWith(
      expect.objectContaining({ highwayActive: false }),
    );

    const notes = [{ pitch: 40, startTick: 0, endTick: 10, velocity: 100 }];
    service.previewNotes(notes);
    expect(engine.previewTrack).toHaveBeenCalledWith(notes, undefined);
    service.stopPreview();
    expect(engine.stopPreview).toHaveBeenCalled();
    service.dispose();
    expect(engine.dispose).toHaveBeenCalled();
    audio.dispose();
  });
});
