import { describe, expect, it } from "vitest";
import type { MidiNote } from "@openchart/core";
import {
  Soundboard,
  midiPitchToFrequency,
  type AudioContext,
  type SoundboardSettings,
} from "../soundboard";

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

function settings(
  overrides: Partial<SoundboardSettings> = {},
): SoundboardSettings {
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

describe("Soundboard", () => {
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
    } as unknown as AudioContext;
    const engine = new Soundboard(() => context);
    engine.configure({
      midi: null,
      ppqn: 480,
      tempoEvents: [{ tick: 0, microsecondsPerQuarterNote: 500_000 }],
      timeSignatureEvents: [{ tick: 0, numerator: 4, denominator: 2 }],
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
    } as unknown as AudioContext;
    const engine = new Soundboard(() => {
      contextCount++;
      return context;
    });
    const midi = null;
    engine.configure({
      midi,
      ppqn: 480,
      tempoEvents: [{ tick: 0, microsecondsPerQuarterNote: 500_000 }],
      timeSignatureEvents: [{ tick: 0, numerator: 4, denominator: 2 }],
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
    const engine = new Soundboard(() => {
      contextCount++;
      throw new Error("audio should remain lazy");
    });
    engine.configure({
      midi: null,
      ppqn: 480,
      tempoEvents: [{ tick: 0, microsecondsPerQuarterNote: 500_000 }],
      timeSignatureEvents: [{ tick: 0, numerator: 4, denominator: 2 }],
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

  it("waits for a pending context resume before closing audio", async () => {
    let finishResume!: () => void;
    let resumeCount = 0;
    let closeCount = 0;
    const context = {
      currentTime: 0,
      state: "suspended",
      destination: {},
      resume: () => {
        resumeCount++;
        return new Promise<void>((resolve) => {
          finishResume = resolve;
        });
      },
      close: async () => {
        closeCount++;
      },
      createOscillator: () => new FakeOscillator(),
      createGain: () => new FakeGain(),
    } as unknown as AudioContext;
    const engine = new Soundboard(() => context);

    const firstStart = engine.ensureStarted();
    const secondStart = engine.ensureStarted();
    engine.dispose();

    expect(resumeCount).toBe(1);
    expect(closeCount).toBe(0);

    finishResume();
    await Promise.all([firstStart, secondStart]);
    await Promise.resolve();
    expect(closeCount).toBe(1);
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
    } as unknown as AudioContext;
    const engine = new Soundboard(() => context);
    engine.configure({
      midi: null,
      ppqn: 480,
      tempoEvents: [{ tick: 0, microsecondsPerQuarterNote: 500_000 }],
      timeSignatureEvents: [{ tick: 0, numerator: 4, denominator: 2 }],
      settings: settings(),
      clapEnabled: true,
      highwayActive: true,
      highwayNotes: [note(10_000), note(10_000), note(10_000), note(10_500)],
      highwayKey: "highway:expert",
    });
    engine.start(0);
    await Promise.resolve();
    engine.updateTick(480);
    expect(oscillators).toHaveLength(0);
    engine.updateTick(10_000);
    expect(oscillators).toHaveLength(1);
    engine.updateTick(10_500);
    expect(oscillators).toHaveLength(2);
    engine.stop();
  });
});
