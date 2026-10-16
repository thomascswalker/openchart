/**
 * Seconds between "now" and the moment a newly scheduled start takes effect.
 * Scheduling a little ahead lets every stem of a mixer share one start time
 * (sample-aligned) instead of each starting whenever its call happens to run.
 */
export const START_LEAD_SECONDS = 0.03;

/** Length of the fade applied to the start of every playback voice. */
export const FADE_IN_SECONDS = 0.006;

/** Time constant of the exponential fade applied when a voice is stopped. */
export const FADE_OUT_TIME_CONSTANT = 0.004;

/** A fading voice is hard-stopped after this long (about 7 time constants). */
export const FADE_OUT_STOP_AFTER = 0.03;

/** Time constant for smoothing gain changes (volume, mute, solo). */
const PARAM_TIME_CONSTANT = 0.01;

/** Signals below this level pass through the safety stage unchanged. */
const SOFT_CLIP_KNEE = 0.89;

export interface AudioEngineOptions {
  /**
   * Playback does not need interactive latency, so the default favours
   * stability over latency to avoid buffer underruns (crackles) under load.
   */
  latencyHint?: AudioContextLatencyCategory | number;
  /** Defaults to the output device rate, avoiding a second resample. */
  sampleRate?: number;
  /** Route the master bus through a soft clipper. Defaults to true. */
  softClip?: boolean;
}

/**
 * Soft-clip transfer function: identity up to the knee, then a smooth curve
 * that approaches (but never exceeds) 1. Summed stems that go over full scale
 * saturate gently instead of hard-clipping at the output.
 */
export function softClip(x: number, knee: number = SOFT_CLIP_KNEE): number {
  const magnitude = Math.abs(x);
  if (magnitude <= knee) {
    return x;
  }
  const range = 1 - knee;
  const shaped = knee + range * Math.tanh((magnitude - knee) / range);
  return x < 0 ? -shaped : shaped;
}

/**
 * Builds a WaveShaper curve. The shaper sits between a 0.5 gain and a 2 gain,
 * so its [-1, 1] domain covers input up to +/-2 (6 dB of overshoot) while the
 * net response below the knee stays exactly 1:1.
 */
export function createSoftClipCurve(length: number = 4096): Float32Array {
  const curve = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    const shaperInput = (i / (length - 1)) * 2 - 1;
    curve[i] = softClip(shaperInput * 2) / 2;
  }
  return curve;
}

/**
 * Owns the single AudioContext shared by every stem, plus the master bus:
 *
 *   sources -> (per-stem gain) -> input -> [soft clip] -> destination
 *
 * One context means one clock: all stems are scheduled against the same
 * `currentTime`, so they stay sample-aligned and there is one place to
 * resume, suspend, and measure output latency.
 */
export class AudioEngine {
  readonly #options: AudioEngineOptions;
  #context: AudioContext | null = null;
  #input: GainNode | null = null;
  #disposed = false;

  constructor(options: AudioEngineOptions = {}) {
    this.#options = options;
  }

  /** The shared context, created on first use. */
  get context(): AudioContext {
    if (this.#disposed) {
      throw new Error("AudioEngine has been disposed");
    }
    if (this.#context === null) {
      const contextOptions: AudioContextOptions = {
        latencyHint: this.#options.latencyHint ?? "playback",
      };
      if (this.#options.sampleRate !== undefined) {
        contextOptions.sampleRate = this.#options.sampleRate;
      }
      this.#context = new AudioContext(contextOptions);
    }
    return this.#context;
  }

  get disposed(): boolean {
    return this.#disposed;
  }

  /** The node every stem connects to. */
  get input(): AudioNode {
    if (this.#input === null) {
      this.#input = this.#buildMasterBus(this.context);
    }
    return this.#input;
  }

  /** Context time in seconds, the single clock all playback is scheduled on. */
  get now(): number {
    return this.context.currentTime;
  }

  /** "closed" when no context exists, so callers never create one by asking. */
  get state(): AudioContextState {
    return this.#context?.state ?? "closed";
  }

  /**
   * Seconds between audio being rendered and being heard. Subtracting it from
   * clock-derived positions keeps visuals aligned with what is audible.
   */
  get outputLatency(): number {
    const context = this.#context;
    if (!context) {
      return 0;
    }
    const latency = context.outputLatency || context.baseLatency || 0;
    return Number.isFinite(latency) && latency > 0 ? latency : 0;
  }

  /** Starts (or resumes) the context. Call from a user gesture when possible. */
  async resume(): Promise<void> {
    const context = this.context;
    if (context.state === "suspended") {
      await context.resume();
    }
  }

  async decode(data: ArrayBuffer): Promise<AudioBuffer> {
    return this.context.decodeAudioData(data);
  }

  /**
   * Moves a parameter to `value` without a discontinuity. Assigning
   * `param.value` directly is an instantaneous step, which is audible as a
   * click (or as "zipper" noise while a slider is dragged).
   */
  smooth(param: AudioParam, value: number): void {
    const context = this.#context;
    if (!context) {
      param.value = value;
      return;
    }
    try {
      const now = context.currentTime;
      param.cancelScheduledValues(now);
      param.setValueAtTime(param.value, now);
      param.setTargetAtTime(value, now, PARAM_TIME_CONSTANT);
    } catch {
      param.value = value;
    }
  }

  dispose(): void {
    if (this.#disposed) {
      return;
    }
    this.#disposed = true;
    const context = this.#context;
    this.#context = null;
    this.#input = null;
    if (context && context.state !== "closed") {
      void context.close().catch((error: unknown) => {
        console.error("Error closing audio context", error);
      });
    }
  }

  #buildMasterBus(context: AudioContext): GainNode {
    const input = context.createGain();
    if (
      this.#options.softClip === false ||
      typeof context.createWaveShaper !== "function"
    ) {
      input.connect(context.destination);
      return input;
    }

    const pre = context.createGain();
    pre.gain.value = 0.5;
    const shaper = context.createWaveShaper();
    if (typeof shaper.connect !== "function") {
      input.connect(context.destination);
      return input;
    }
    // The curve is typed for ArrayBuffer-backed arrays; ours always is.
    shaper.curve = createSoftClipCurve() as Float32Array<ArrayBuffer>;
    // Oversampling would add filter ripple to the otherwise transparent path.
    shaper.oversample = "none";
    const post = context.createGain();
    post.gain.value = 2;

    input.connect(pre);
    pre.connect(shaper);
    shaper.connect(post);
    post.connect(context.destination);
    return input;
  }
}
