import { beforeEach, describe, expect, it, vi } from "vitest";
import { Difficulty } from "@openchart/views";
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

vi.mock("../../audio/soundboard", () => ({
  Soundboard: vi.fn(function () {
    return engine;
  }),
}));

vi.mock("@openchart/views", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@openchart/views")>()),
  SongView: vi.fn(function () {
    return { getInstrumentTrackView: () => undefined };
  }),
}));

type MidiData = import("@openchart/core").Midi;

function settings(metronomeEnabled = false): ApplicationSettings {
  return { feedback: { metronomeEnabled } } as unknown as ApplicationSettings;
}

function midi(
  tracks: object[] = [
    { getNotes: () => [{ end: 960 }], getTimedEvents: () => [] },
  ],
  timeSignatures: {
    tick: number;
    numerator: number;
    denominator: number;
  }[] = [],
  tempoChanges = [{ tick: 0, microsecondsPerQuarterNote: 500_000 }],
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
    getTempoChanges: () => tempoChanges,
    getTimeSignatureChanges: () => timeSignatures,
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
    const service = new PlaybackService();
    configure(service);

    expect(service.getSnapshot().canPlay).toBe(true);
    expect(service.getSnapshot().totalTimelineTicks).toBe(4_800);
    service.setPlaybackTick(240);
    expect(engine.seek).toHaveBeenCalledWith(240);
    service.dispose();
  });

  it("requires MIDI events and advances on the tempo-aware MIDI clock", () => {
    const service = new PlaybackService();
    configure(service, { midiData: midi([]) });
    expect(service.getSnapshot().canPlay).toBe(false);

    configure(service, {
      midiData: midi(
        [{ getNotes: () => [{ end: 960 }], getTimedEvents: () => [] }],
        [],
        [
          { tick: 0, microsecondsPerQuarterNote: 500_000 },
          { tick: 480, microsecondsPerQuarterNote: 1_000_000 },
        ],
      ),
    });
    let frame: FrameRequestCallback | undefined;
    vi.stubGlobal(
      "requestAnimationFrame",
      vi.fn((callback: FrameRequestCallback) => {
        frame = callback;
        return 1;
      }),
    );
    vi.stubGlobal("cancelAnimationFrame", vi.fn());

    service.play();
    frame?.(0);
    frame?.(750);

    expect(service.getSnapshot().playbackTick).toBe(600);
    expect(engine.updateTick).toHaveBeenLastCalledWith(600);
    service.dispose();
    vi.unstubAllGlobals();
  });

  it("pauses with grid snapping and notifies subscribers", () => {
    const service = new PlaybackService();
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
    vi.unstubAllGlobals();
  });

  it("plays two measures past the last MIDI event, even past the last note", () => {
    const service = new PlaybackService();
    configure(service, {
      midiData: midi([
        {
          getNotes: () => [{ end: 960 }],
          getTimedEvents: () => [{ tick: 960 }, { tick: 1_440 }],
        },
        { getNotes: () => [], getTimedEvents: () => [{ tick: 2_000 }] },
      ]),
    });

    expect(service.getSnapshot().totalTimelineTicks).toBe(5_840);
    service.seekEnd();
    expect(service.getSnapshot().playbackTick).toBe(2_000);
    service.dispose();
  });

  it("uses the active time signature to extend MIDI playback", () => {
    const service = new PlaybackService();
    configure(service, {
      midiData: midi(
        [{ getNotes: () => [], getTimedEvents: () => [{ tick: 2_000 }] }],
        [{ tick: 0, numerator: 3, denominator: 2 }],
      ),
    });

    expect(service.getSnapshot().totalTimelineTicks).toBe(4_880);
    service.dispose();
  });

  it("refreshes the timeline from the current document data", () => {
    const service = new PlaybackService();
    const currentTrack = {
      events: [{ deltaTime: 961 }],
      getNotes: () => [{ end: 961 }],
    };
    const currentMidi = midi([currentTrack]);
    configure(service, { midiData: currentMidi });
    currentTrack.events = [{ deltaTime: 3_840 }];

    service.refresh(currentMidi);
    expect(service.getSnapshot().totalTimelineTicks).toBe(7_680);
    service.seekEnd();
    expect(service.getSnapshot().playbackTick).toBe(3_840);

    service.dispose();
  });

  it("follows document edits without an explicit refresh", () => {
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
    const service = new PlaybackService(documentService as never);
    configure(service, { midiData: currentMidi });
    expect(service.getSnapshot().totalTimelineTicks).toBe(4_801);

    track.events = [{ deltaTime: 4_320 }, { deltaTime: 1 }];
    listener();
    expect(service.getSnapshot().totalTimelineTicks).toBe(8_161);
    service.seekEnd();
    expect(service.getSnapshot().playbackTick).toBe(4_321);

    service.dispose();
  });

  it("preserves the playback tick when undo or redo provides a MIDI clone", () => {
    const service = new PlaybackService();
    const originalMidi = midi();
    configure(service, { midiData: originalMidi, documentId: 1 });
    service.setPlaybackTick(240);

    configure(service, { midiData: midi(), documentId: 1 });
    expect(service.getSnapshot().playbackTick).toBe(240);
    expect(engine.stop).not.toHaveBeenCalled();

    configure(service, { midiData: midi(), documentId: 2 });
    expect(service.getSnapshot().playbackTick).toBe(0);
    expect(engine.stop).toHaveBeenCalled();
    service.dispose();
  });

  it("toggles metronome and clap, starting the engine in the gesture", () => {
    const service = new PlaybackService();
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
  });

  it("toggles vocal pitch feedback, starting the engine in the gesture", () => {
    const service = new PlaybackService();
    configure(service);
    expect(service.getSnapshot().isVocalPitchFeedbackEnabled).toBe(false);
    expect(engine.configure).toHaveBeenLastCalledWith(
      expect.objectContaining({ vocalFeedbackEnabled: false, vocalNotes: [] }),
    );

    service.toggleVocalPitchFeedback();
    expect(service.getSnapshot().isVocalPitchFeedbackEnabled).toBe(true);
    expect(engine.ensureStarted).toHaveBeenCalledTimes(1);
    expect(engine.configure).toHaveBeenLastCalledWith(
      expect.objectContaining({ vocalFeedbackEnabled: true }),
    );

    service.toggleVocalPitchFeedback();
    expect(service.getSnapshot().isVocalPitchFeedbackEnabled).toBe(false);
    expect(engine.ensureStarted).toHaveBeenCalledTimes(1);
    service.dispose();
  });

  it("gates highway feedback on the active view and previews notes", () => {
    const service = new PlaybackService();
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
  });
});
