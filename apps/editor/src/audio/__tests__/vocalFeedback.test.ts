import { describe, expect, it } from "vitest";
import { MetaType, type MidiNote } from "@openchart/midi";
import {
  Soundboard,
  midiPitchToFrequency,
  type AudioContext,
  type SoundboardConfigurationInput,
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
  public startTimes: number[] = [];
  /** `null` records an immediate stop() (cancellation). */
  public stopTimes: Array<number | null> = [];
  public onended: (() => void) | null = null;
  public connect(): void {}
  public start(time = 0): void {
    this.startTimes.push(time);
  }
  public stop(time?: number): void {
    this.stopTimes.push(time ?? null);
  }
}

function fakeContext(oscillators: FakeOscillator[]): AudioContext {
  return {
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
    createGain: () => ({ gain: new FakeParam(), connect() {} }),
  } as unknown as AudioContext;
}

function vocal(pitch: number, start: number, end: number): MidiNote {
  return {
    pitch: pitch,
    velocity: 100,
    start,
    end,
    noteOn: { data1: pitch } as MidiNote["noteOn"],
    noteOff: { data1: pitch } as MidiNote["noteOff"],
  };
}

const TEMPO_EVENTS = [
  {
    deltaTime: 0,
    status: 0xff,
    type: MetaType.Tempo,
    length: 3,
    tick: 0,
    microsecondsPerQuarterNote: 500_000,
  },
];
const TIME_SIGNATURE_EVENTS = [
  {
    deltaTime: 0,
    status: 0xff,
    type: MetaType.TimeSignature,
    length: 4,
    tick: 0,
    numerator: 4,
    denominator: 2,
  },
];

function configuration(
  overrides: Partial<SoundboardConfigurationInput> = {},
): SoundboardConfigurationInput {
  return {
    midi: null,
    ppqn: 480,
    tempoEvents: TEMPO_EVENTS,
    timeSignatureEvents: TIME_SIGNATURE_EVENTS,
    settings: {
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
    },
    clapEnabled: false,
    highwayActive: false,
    highwayNotes: [],
    highwayKey: "piano-roll",
    vocalFeedbackEnabled: true,
    vocalNotes: [vocal(60, 0, 480), vocal(62, 240, 720), vocal(64, 2000, 2400)],
    ...overrides,
  };
}

/** Lets the context resume and at least one 25 ms scheduler pass run. */
const tick = (ms = 40) => new Promise((resolve) => setTimeout(resolve, ms));

describe("vocal pitch feedback", () => {
  it("schedules onsets in the look-ahead window at each note's pitch", async () => {
    const oscillators: FakeOscillator[] = [];
    const engine = new Soundboard(() => fakeContext(oscillators));
    engine.configure(configuration());
    engine.start(0);
    await tick();

    // Only the note at tick 0 falls inside the 120 ms window.
    expect(oscillators).toHaveLength(1);
    expect(oscillators[0].frequency.value).toBeCloseTo(
      midiPitchToFrequency(60),
    );
    expect(oscillators[0].startTimes).toEqual([0]);
    // Lasts the note's duration: 480 ticks at 120 BPM = 0.5 s.
    expect(oscillators[0].stopTimes[0]).toBeCloseTo(0.505, 5);

    engine.updateTick(200);
    await tick();
    expect(oscillators).toHaveLength(2);
    expect(oscillators[1].frequency.value).toBeCloseTo(
      midiPitchToFrequency(62),
    );
    engine.stop();
  });

  it("is monophonic and legato: a new onset ends the previous voice", async () => {
    const oscillators: FakeOscillator[] = [];
    const engine = new Soundboard(() => fakeContext(oscillators));
    engine.configure(configuration());
    engine.start(0);
    await tick();
    engine.updateTick(200);
    await tick();

    // The second onset is 40 ticks (~41.7 ms) ahead; the first voice is cut
    // there instead of running to its own end at 0.5 s.
    const secondStart = oscillators[1].startTimes[0];
    expect(secondStart).toBeCloseTo(40 / 960, 5);
    const firstStops = oscillators[0].stopTimes;
    expect(firstStops.at(-1)!).toBeLessThan(0.1);
    expect(firstStops.at(-1)!).toBeGreaterThanOrEqual(secondStart);
    engine.stop();
  });

  it("starts a note already sounding at the playhead and cancels on seek", async () => {
    const oscillators: FakeOscillator[] = [];
    const engine = new Soundboard(() => fakeContext(oscillators));
    engine.configure(configuration());
    engine.start(300);
    await tick();
    expect(oscillators).toHaveLength(1);
    expect(oscillators[0].frequency.value).toBeCloseTo(
      midiPitchToFrequency(62),
    );
    expect(oscillators[0].startTimes).toEqual([0]);

    engine.seek(0);
    expect(oscillators[0].stopTimes.at(-1)).toBeNull();
    await tick();
    // After the seek the scheduler starts over from tick 0.
    expect(
      oscillators.some(
        (oscillator) =>
          Math.abs(oscillator.frequency.value - midiPitchToFrequency(60)) <
          1e-6,
      ),
    ).toBe(true);
    engine.stop();
    const live = oscillators.filter((o) => o.stopTimes.at(-1) !== null);
    expect(live).toHaveLength(0);
  });

  it("stays silent and lazy when the toggle is off", async () => {
    let contexts = 0;
    const engine = new Soundboard(() => {
      contexts++;
      throw new Error("audio should remain lazy");
    });
    engine.configure(configuration({ vocalFeedbackEnabled: false }));
    engine.start(0);
    await tick();
    engine.updateTick(480);
    engine.stop();
    expect(contexts).toBe(0);
  });

  it("starts feedback when toggled on mid-playback", async () => {
    const oscillators: FakeOscillator[] = [];
    const engine = new Soundboard(() => fakeContext(oscillators));
    engine.configure(configuration({ vocalFeedbackEnabled: false }));
    engine.start(1950);
    await tick();
    expect(oscillators).toHaveLength(0);
    engine.configure(configuration());
    await tick();
    expect(oscillators).toHaveLength(1);
    expect(oscillators[0].frequency.value).toBeCloseTo(
      midiPitchToFrequency(64),
    );
    engine.stop();
  });
});
