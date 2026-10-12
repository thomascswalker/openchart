import type {
  Midi,
  MidiNote,
  TempoChange,
  TimeSignatureChange,
} from "@midiedit/core";
import { ticksToMs } from "@midiedit/core";
import {
  beatCrossings,
  tickWindowForLookAhead,
  ticksPerBeat,
} from "./musicalTime";
import { NoteCrossingTracker } from "./noteCrossing";

const LOOK_AHEAD_MS = 120;
const SCHEDULER_INTERVAL_MS = 25;
const CLAP_SPACING_SECONDS = 0.025;
const CLAP_VOLUME = 0.35;
const HIGHWAY_VISIBLE_BEFORE_QUARTER_NOTES = 1;
const HIGHWAY_VISIBLE_AFTER_QUARTER_NOTES = 16;

export interface SoundboardSettings {
  metronomeEnabled: boolean;
  metronomeVolume: number;
  metronomeDownbeatSound: OscillatorType;
  metronomeBeatSound: OscillatorType;
  previewVolume: number;
  previewAttackMs: number;
  previewReleaseMs: number;
  previewMaxVoices: number;
  previewLowPitch: number;
  previewHighPitch: number;
}

export interface PreviewNote {
  pitch: number;
  startTick: number;
  endTick: number;
  velocity?: number;
}

export interface PitchRange {
  low: number;
  high: number;
}

export interface AudioContext {
  currentTime: number;
  state: AudioContextState;
  destination: AudioNode;
  resume(): Promise<void>;
  close(): Promise<void>;
  createOscillator(): OscillatorNode;
  createGain(): GainNode;
}

export interface SoundboardConfigurationInput {
  midi: Midi | null | undefined;
  ppqn: number;
  tempoChanges: TempoChange[];
  timeSignatureChanges: TimeSignatureChange[];
  settings: SoundboardSettings;
  clapEnabled: boolean;
  highwayActive: boolean;
  highwayNotes: readonly MidiNote[];
  highwayKey: string;
}

interface ActiveVoice {
  oscillator: OscillatorNode;
  gain: GainNode;
}

function createSoundboardContext(): AudioContext {
  const AudioContextConstructor =
    window.AudioContext ??
    (
      window as Window &
        typeof globalThis & { webkitAudioContext?: typeof AudioContext }
    ).webkitAudioContext;
  if (!AudioContextConstructor) {
    throw new Error("This browser does not support audio feedback.");
  }
  return new AudioContextConstructor();
}

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function midiPitchToFrequency(pitch: number): number {
  if (!Number.isInteger(pitch) || pitch < 0 || pitch > 127) {
    throw new RangeError("MIDI pitch must be an integer from 0 through 127.");
  }
  return 440 * 2 ** ((pitch - 69) / 12);
}

export function validatePitchRange(range: PitchRange): PitchRange {
  if (
    !Number.isInteger(range.low) ||
    !Number.isInteger(range.high) ||
    range.low < 0 ||
    range.high > 127 ||
    range.low > range.high
  ) {
    throw new RangeError(
      "Pitch ranges must be inclusive MIDI pitches from 0 through 127.",
    );
  }
  return range;
}

export class Soundboard {
  private context: AudioContext | null = null;
  private configuration: SoundboardConfigurationInput | null = null;
  private playing = false;
  private currentTick = 0;
  private metronomeCursorTick = 0;
  private schedulerHandle: ReturnType<typeof setTimeout> | null = null;
  private lastClapTime = 0;
  private resumePromise: Promise<void> | null = null;
  private readonly pendingSounds = new Set<OscillatorNode>();
  private previewVoices: ActiveVoice[] = [];
  private previewRequest = 0;
  private readonly crossingTracker = new NoteCrossingTracker();
  private readonly contextFactory: (() => AudioContext | null) | null;

  constructor(contextFactory?: (() => AudioContext | null) | null) {
    this.contextFactory = contextFactory ?? null;
  }

  public configure(configuration: SoundboardConfigurationInput): void {
    const previousKey = this.configuration?.highwayKey;
    const previousMidi = this.configuration?.midi;
    const previousSettings = this.configuration?.settings;
    const previousClapEnabled = this.configuration?.clapEnabled;
    this.configuration = configuration;
    if (
      previousKey !== configuration.highwayKey ||
      previousMidi !== configuration.midi ||
      previousSettings !== configuration.settings ||
      previousClapEnabled !== configuration.clapEnabled
    ) {
      this.stopPreview();
      this.cancelPendingSounds();
      this.metronomeCursorTick = this.currentTick - 1e-6;
      this.crossingTracker.reset(previousKey);
      this.crossingTracker.begin(configuration.highwayKey, this.currentTick);
    }
    if (this.playing) {
      if (configuration.settings.metronomeEnabled) {
        this.stopScheduler();
        void this.ensureStarted().then(() => this.scheduleLoop());
      } else {
        this.stopScheduler();
        this.cancelPendingSounds();
      }
      if (configuration.clapEnabled && configuration.highwayActive) {
        // A menu toggle may enable clap after playback has already started.
        // Create/resume the context before the next playhead update crosses a note.
        void this.ensureStarted();
      }
    }
  }

  public async ensureStarted(): Promise<void> {
    if (!this.context) {
      this.context = this.contextFactory?.() ?? createSoundboardContext();
    }
    if (this.context.state === "suspended") {
      if (this.resumePromise === null) {
        let pendingResume: Promise<void>;
        pendingResume = this.context.resume().finally(() => {
          if (this.resumePromise === pendingResume) {
            this.resumePromise = null;
          }
        });
        this.resumePromise = pendingResume;
      }
      await this.resumePromise;
    }
  }

  public start(tick: number): void {
    this.currentTick = Math.max(0, tick);
    this.playing = true;
    this.stopScheduler();
    this.metronomeCursorTick = this.currentTick - 1e-6;
    const configuration = this.configuration!;
    if (configuration?.settings.metronomeEnabled || configuration.clapEnabled) {
      void this.ensureStarted().then(() => {
        if (configuration.settings.metronomeEnabled) this.scheduleLoop();
      });
    }
    if (configuration) {
      this.crossingTracker.reset(configuration.highwayKey);
      this.crossingTracker.begin(configuration.highwayKey, this.currentTick);
    }
  }

  public stop(): void {
    this.playing = false;
    this.stopScheduler();
    this.cancelPendingSounds();
    this.crossingTracker.reset();
    this.lastClapTime = 0;
    this.stopPreview();
  }

  public seek(tick: number): void {
    this.currentTick = Math.max(0, tick);
    this.metronomeCursorTick = this.currentTick - 1e-6;
    const configuration = this.configuration;
    this.cancelPendingSounds();
    this.stopPreview();
    if (configuration) {
      this.crossingTracker.reset(configuration.highwayKey);
      this.crossingTracker.begin(configuration.highwayKey, this.currentTick);
    }
  }

  public updateTick(tick: number): void {
    const nextTick = Math.max(0, tick);
    this.currentTick = nextTick;
    if (!this.playing) return;

    const configuration = this.configuration;
    if (!configuration) return;

    if (configuration.clapEnabled && configuration.highwayActive) {
      const visibleBefore =
        configuration.ppqn * HIGHWAY_VISIBLE_BEFORE_QUARTER_NOTES;
      const visibleAfter =
        configuration.ppqn * HIGHWAY_VISIBLE_AFTER_QUARTER_NOTES;
      const visibleNotes = configuration.highwayNotes.filter(
        (note) =>
          note.end >= nextTick - visibleBefore &&
          note.start <= nextTick + visibleAfter,
      );
      const crossings = this.crossingTracker.advance(
        configuration.highwayKey,
        nextTick,
        visibleNotes,
      );
      const onsetCount = new Set(crossings.map((note) => note.start)).size;
      if (onsetCount > 0) this.queueClaps(onsetCount);
    } else {
      this.crossingTracker.begin(configuration.highwayKey, nextTick);
    }
  }

  public previewTrack(notes: readonly PreviewNote[], range?: PitchRange): void {
    const configuration = this.configuration;
    if (!configuration || notes.length === 0) return;
    const effectiveRange = validatePitchRange(
      range ?? {
        low: configuration.settings.previewLowPitch,
        high: configuration.settings.previewHighPitch,
      },
    );
    const filtered = notes.filter(
      (note) =>
        note.pitch >= effectiveRange.low &&
        note.pitch <= effectiveRange.high &&
        note.endTick > note.startTick,
    );
    if (filtered.length === 0) return;
    const request = ++this.previewRequest;

    void this.ensureStarted().then(() => {
      if (request !== this.previewRequest) return;
      this.stopPreview();
      const startTick = Math.min(...filtered.map((note) => note.startTick));
      const now = this.context?.currentTime ?? 0;
      const maxVoices = Math.max(
        1,
        Math.floor(configuration.settings.previewMaxVoices),
      );
      const activeUntil: number[] = [];
      for (const note of [...filtered].sort(
        (a, b) => a.startTick - b.startTick,
      )) {
        const startMs =
          this.tickToMs(note.startTick) - this.tickToMs(startTick);
        const endMs = this.tickToMs(note.endTick) - this.tickToMs(startTick);
        const startTime = now + Math.max(0, startMs) / 1_000;
        const endTime = now + Math.max(startMs, endMs) / 1_000;
        const occupied = activeUntil.filter((time) => time > startTime).length;
        if (occupied >= maxVoices) continue;
        activeUntil.push(endTime);
        this.schedulePreviewVoice(note, startTime, endTime);
      }
    });
  }

  public stopPreview(): void {
    this.previewRequest++;
    for (const voice of this.previewVoices) {
      try {
        voice.gain.gain.cancelScheduledValues(0);
        voice.oscillator.stop();
      } catch {
        // Voices may already have ended.
      }
    }
    this.previewVoices = [];
  }

  public dispose(): void {
    this.stop();
    const context = this.context;
    this.context = null;
    if (!context) return;

    const closeContext = (): void => {
      void context.close();
    };
    if (this.resumePromise) {
      void this.resumePromise.then(closeContext, closeContext);
    } else {
      closeContext();
    }
  }

  private tickToMs(tick: number): number {
    const configuration = this.configuration;
    if (!configuration) return 0;
    return ticksToMs(tick, configuration.ppqn, configuration.tempoChanges);
  }

  private scheduleLoop = (): void => {
    if (!this.playing || !this.configuration) return;
    this.scheduleMetronome();
    this.stopScheduler();
    this.schedulerHandle = setTimeout(this.scheduleLoop, SCHEDULER_INTERVAL_MS);
  };

  private stopScheduler(): void {
    if (this.schedulerHandle !== null) {
      clearTimeout(this.schedulerHandle);
      this.schedulerHandle = null;
    }
  }

  private scheduleMetronome(): void {
    const configuration = this.configuration;
    const context = this.context;
    if (!configuration || !context || !configuration.settings.metronomeEnabled)
      return;

    const endTick = tickWindowForLookAhead(
      this.currentTick,
      LOOK_AHEAD_MS,
      configuration.ppqn,
      configuration.tempoChanges,
    );
    const crossings = beatCrossings(
      this.metronomeCursorTick,
      endTick,
      configuration.ppqn,
      configuration.timeSignatureChanges,
    );
    for (const beat of crossings) {
      if (beat.tick < this.currentTick - 1e-5) {
        this.metronomeCursorTick = Math.max(
          this.metronomeCursorTick,
          beat.tick,
        );
        continue;
      }
      const deltaSeconds =
        Math.max(
          0,
          this.tickToMs(beat.tick) - this.tickToMs(this.currentTick),
        ) / 1_000;
      this.scheduleClick(
        context.currentTime + deltaSeconds,
        beat.isDownbeat,
        configuration.settings,
      );
      this.metronomeCursorTick = Math.max(this.metronomeCursorTick, beat.tick);
    }
  }

  private scheduleClick(
    time: number,
    downbeat: boolean,
    settings: SoundboardSettings,
  ): void {
    const context = this.context;
    if (!context) return;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = downbeat
      ? settings.metronomeDownbeatSound
      : settings.metronomeBeatSound;
    oscillator.frequency.setValueAtTime(downbeat ? 1_200 : 850, time);
    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(
      clamp(settings.metronomeVolume),
      time + 0.002,
    );
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.055);
    oscillator.connect(gain);
    gain.connect(context.destination);
    this.pendingSounds.add(oscillator);
    oscillator.onended = () => this.pendingSounds.delete(oscillator);
    oscillator.start(time);
    oscillator.stop(time + 0.06);
  }

  private queueClaps(count: number): void {
    const configuration = this.configuration;
    const context = this.context;
    if (!configuration || !context) return;
    const firstTime = Math.max(
      context.currentTime + 0.001,
      this.lastClapTime + CLAP_SPACING_SECONDS,
    );
    const limitedCount = Math.min(count, 16);
    for (let index = 0; index < limitedCount; index++) {
      this.scheduleClap(firstTime + index * CLAP_SPACING_SECONDS, CLAP_VOLUME);
    }
    this.lastClapTime =
      firstTime + Math.max(0, limitedCount - 1) * CLAP_SPACING_SECONDS;
  }

  private scheduleClap(time: number, volume: number): void {
    const context = this.context;
    if (!context) return;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "triangle";
    oscillator.frequency.setValueAtTime(1_650, time);
    gain.gain.setValueAtTime(clamp(volume), time);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.045);
    oscillator.connect(gain);
    gain.connect(context.destination);
    this.pendingSounds.add(oscillator);
    oscillator.onended = () => this.pendingSounds.delete(oscillator);
    oscillator.start(time);
    oscillator.stop(time + 0.05);
  }

  private schedulePreviewVoice(
    note: PreviewNote,
    startTime: number,
    endTime: number,
  ): void {
    const configuration = this.configuration;
    const context = this.context;
    if (!configuration || !context) return;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const attack = Math.max(
      0.001,
      configuration.settings.previewAttackMs / 1_000,
    );
    const release = Math.max(
      0.001,
      configuration.settings.previewReleaseMs / 1_000,
    );
    const velocity = clamp((note.velocity ?? 100) / 127);
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(
      midiPitchToFrequency(note.pitch),
      startTime,
    );
    gain.gain.setValueAtTime(0, startTime);
    gain.gain.linearRampToValueAtTime(
      clamp(configuration.settings.previewVolume) * velocity,
      startTime + attack,
    );
    gain.gain.setValueAtTime(
      clamp(configuration.settings.previewVolume) * velocity,
      Math.max(startTime + attack, endTime - release),
    );
    gain.gain.linearRampToValueAtTime(0, endTime);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(startTime);
    oscillator.stop(endTime + 0.005);
    this.previewVoices.push({ oscillator, gain });
  }

  private cancelPendingSounds(): void {
    for (const oscillator of this.pendingSounds) {
      try {
        oscillator.stop();
      } catch {
        // The oscillator may already have ended.
      }
    }
    this.pendingSounds.clear();
  }

  public getBeatLength(ppqn: number, signature: TimeSignatureChange): number {
    return ticksPerBeat(ppqn, signature);
  }
}
