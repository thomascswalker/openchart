import { describe, expect, it } from "vitest";
import type { MidiNote } from "@midiedit/core";
import {
  PlaybackFeedbackEngine,
  midiPitchToFrequency,
  type FeedbackAudioContext,
  type FeedbackSettings,
} from "../PlaybackFeedbackEngine";

class FakeParam {
  public value = 0;
  public setValueAtTime(value: number): void {
    this.value = value;
  }
  public linearRampToValueAtTime(value: number): void {
    this.value = value;
  }
  public exponentialRampToValueAtTime(value: number): void {
    this.value = value;
  }
  public cancelScheduledValues(): void {}
}

class FakeOscillator {
  public type: OscillatorType = "sine";
  public frequency = new FakeParam();
  public startCount = 0;
  public stopCount = 0;
  public connect(): void {}
  public start(): void {
    this.startCount++;
  }
  public stop(): void {
    this.stopCount++;
  }
}

class FakeGain {
  public gain = new FakeParam();
  public connect(): void {}
}

function settings(overrides: Partial<FeedbackSettings> = {}): FeedbackSettings {
  return {
    metronomeEnabled: false,
    metronomeVolume: 0.4,
    metronomeDownbeatSound: "square",
    metronomeBeatSound: "sine",
    previewVolume: 0.3,
    previewAttackMs: 5,
    previewReleaseMs: 25,
    previewMaxVoices: 4,
    previewLowPitch: 36,
    previewHighPitch: 60,
    ...overrides,
  };
}

function note(start: number): MidiNote {
  return {
    note: 60,
    velocity: 100,
    start,
    end: start + 120,
    noteOn: { data1: 60 } as MidiNote["noteOn"],
    noteOff: { data1: 60 } as MidiNote["noteOff"],
  };
}

describe("PlaybackFeedbackEngine", () => {
  it("maps MIDI pitches and cleans up preview voices", async () => {
    expect(midiPitchToFrequency(69)).toBe(440);
    expect(() => midiPitchToFrequency(128)).toThrow(RangeError);

    const oscillators: FakeOscillator[] = [];
    const context = {
      currentTime: 0,
      state: "running",
      destination: {},
      resume: async () => {},
      close: async () => {},
      createOscillator: () => {
        const oscillator = new FakeOscillator();
        oscillators.push(oscillator);
        return oscillator;
      },
      createGain: () => new FakeGain(),
    } as unknown as FeedbackAudioContext;
    const engine = new PlaybackFeedbackEngine(() => context);
    engine.configure({
      midi: null,
      ppqn: 480,
      tempoChanges: [{ tick: 0, microsecondsPerQuarterNote: 500_000 }],
      timeSignatureChanges: [{ tick: 0, numerator: 4, denominator: 2 }],
      settings: settings(),
      clapEnabled: false,
      highwayActive: false,
      highwayNotes: [],
      highwayKey: "highway:expert",
    });
    engine.previewTrack([{ pitch: 60, startTick: 0, endTick: 480 }]);
    await Promise.resolve();
    expect(oscillators).toHaveLength(1);
    engine.stopPreview();
    expect(oscillators[0].stopCount).toBeGreaterThanOrEqual(1);
  });

  it("creates audio lazily and resets metronome/clap state on stop and seek", async () => {
    let contextCount = 0;
    const oscillators: FakeOscillator[] = [];
    const context = {
      currentTime: 0,
      state: "running",
      destination: {},
      resume: async () => {},
      close: async () => {},
      createOscillator: () => {
        const oscillator = new FakeOscillator();
        oscillators.push(oscillator);
        return oscillator;
      },
      createGain: () => new FakeGain(),
    } as unknown as FeedbackAudioContext;
    const engine = new PlaybackFeedbackEngine(() => {
      contextCount++;
      return context;
    });
    const midi = null;
    engine.configure({
      midi,
      ppqn: 480,
      tempoChanges: [{ tick: 0, microsecondsPerQuarterNote: 500_000 }],
      timeSignatureChanges: [{ tick: 0, numerator: 4, denominator: 2 }],
      settings: settings({ metronomeEnabled: true }),
      clapEnabled: true,
      highwayActive: true,
      highwayNotes: [note(480)],
      highwayKey: "highway:expert",
    });

    expect(contextCount).toBe(0);
    engine.start(0);
    await Promise.resolve();
    expect(contextCount).toBe(1);
    engine.updateTick(480);
    expect(oscillators.length).toBeGreaterThan(0);
    engine.stop();
    engine.seek(0);
    engine.start(0);
    await Promise.resolve();
    engine.updateTick(480);
    expect(contextCount).toBe(1);
    engine.stop();
  });

  it("does not create audio when feedback is disabled", () => {
    let contextCount = 0;
    const engine = new PlaybackFeedbackEngine(() => {
      contextCount++;
      throw new Error("audio should remain lazy");
    });
    engine.configure({
      midi: null,
      ppqn: 480,
      tempoChanges: [{ tick: 0, microsecondsPerQuarterNote: 500_000 }],
      timeSignatureChanges: [{ tick: 0, numerator: 4, denominator: 2 }],
      settings: settings(),
      clapEnabled: false,
      highwayActive: false,
      highwayNotes: [],
      highwayKey: "highway:expert",
    });
    engine.start(0);
    engine.updateTick(480);
    engine.stop();
    expect(contextCount).toBe(0);
  });

  it("claps only for notes visible on the active highway chart", async () => {
    const oscillators: FakeOscillator[] = [];
    const context = {
      currentTime: 0,
      state: "running",
      destination: {},
      resume: async () => {},
      close: async () => {},
      createOscillator: () => {
        const oscillator = new FakeOscillator();
        oscillators.push(oscillator);
        return oscillator;
      },
      createGain: () => new FakeGain(),
    } as unknown as FeedbackAudioContext;
    const engine = new PlaybackFeedbackEngine(() => context);
    engine.configure({
      midi: null,
      ppqn: 480,
      tempoChanges: [{ tick: 0, microsecondsPerQuarterNote: 500_000 }],
      timeSignatureChanges: [{ tick: 0, numerator: 4, denominator: 2 }],
      settings: settings(),
      clapEnabled: true,
      highwayActive: true,
      highwayNotes: [note(10_000)],
      highwayKey: "highway:expert",
    });
    engine.start(0);
    await Promise.resolve();
    engine.updateTick(480);
    expect(oscillators).toHaveLength(0);
    engine.updateTick(10_000);
    expect(oscillators).toHaveLength(1);
    engine.stop();
  });
});
