import {
  AudioEngine,
  FADE_IN_SECONDS,
  FADE_OUT_STOP_AFTER,
  FADE_OUT_TIME_CONSTANT,
  START_LEAD_SECONDS,
} from "./engine.js";
import type { AudioEventCallback } from "./events.js";

export interface AudioSampleOptions {
  initialVolume?: number;
  /**
   * Shared engine to play through. Samples that share an engine share one
   * AudioContext and clock. When omitted, the sample owns a private engine.
   */
  engine?: AudioEngine;
  onLoaded?: AudioEventCallback;
  onPlay?: AudioEventCallback;
  onPause?: AudioEventCallback;
  onStop?: AudioEventCallback;
  onEnded?: AudioEventCallback;
}

const defaultAudioSampleOptions: Required<Omit<AudioSampleOptions, "engine">> =
  {
    initialVolume: 1,
    onLoaded: () => {},
    onPlay: () => {},
    onPause: () => {},
    onStop: () => {},
    onEnded: () => {},
  };

/* One scheduled playback of the buffer, with its own fade envelope */
interface Voice {
  source: AudioBufferSourceNode;
  envelope: GainNode;
}

function disconnectVoice(voice: Voice): void {
  try {
    voice.source.disconnect();
    voice.envelope.disconnect();
  } catch {
    // Already disconnected.
  }
}

class AudioSample {
  /* Indicates whether the audio sample has been loaded */
  #loaded: boolean = false;
  /* The filename of the audio sample */
  #filename: string;
  /* The volume level for playback */
  #volume: number = 1;

  /* The engine (shared context, master bus) this sample plays through */
  readonly #engine: AudioEngine;
  /* Whether this sample created the engine and must dispose it */
  readonly #ownsEngine: boolean;
  /* The raw audio data */
  #data: AudioBuffer | null = null;
  /* Per-sample volume control, feeding the engine's master bus */
  #gain: GainNode | null = null;
  /* The voice currently playing (a source node is one-shot, so each start makes one) */
  #voice: Voice | null = null;
  /* Context time at which the current voice's offset applies */
  #startContextTime: number = 0;
  /* Buffer position (seconds) at #startContextTime */
  #startOffset: number = 0;
  /* The playback position when no voice is currently playing */
  #playbackOffset: number = 0;
  #isPlaying: boolean = false;
  #disposed: boolean = false;

  /* Called when the audio sample has finished loading */
  readonly #onLoaded: AudioEventCallback;
  /* Called when the audio sample starts playing */
  readonly #onPlay: AudioEventCallback;
  /* Called when the audio sample is paused */
  readonly #onPause: AudioEventCallback;
  /* Called when the audio sample stops playing */
  readonly #onStop: AudioEventCallback;
  /* Called when the audio sample finishes playing */
  readonly #onEnded: AudioEventCallback;

  /* Promise that resolves when the audio sample is fully loaded */
  readonly ready: Promise<void>;

  private constructor(filename: string, options?: AudioSampleOptions) {
    // Merge the default options with the provided options to ensure all required fields are set
    const combinedOptions = { ...defaultAudioSampleOptions, ...options };
    this.#engine = options?.engine ?? new AudioEngine();
    this.#ownsEngine = options?.engine === undefined;
    this.#volume = combinedOptions.initialVolume;
    this.#onLoaded = combinedOptions.onLoaded;
    this.#onPlay = combinedOptions.onPlay;
    this.#onPause = combinedOptions.onPause;
    this.#onStop = combinedOptions.onStop;
    this.#onEnded = combinedOptions.onEnded;

    // Set the filename and start loading the audio file
    this.#filename = filename;
    this.ready = this.#loadFile().then(() => {
      this.#loaded = true;
      if (!this.#disposed) {
        this.#onLoaded({ data: null });
      }
    });
  }

  /* Synchronously loads an audio sample without waiting for it to be fully ready */
  static load(filename: string, options?: AudioSampleOptions): AudioSample {
    const sample = new AudioSample(filename, options);
    return sample;
  }

  /* Asynchronously loads an audio sample and waits for it to be fully ready */
  static async loadAsync(
    filename: string,
    options?: AudioSampleOptions,
  ): Promise<AudioSample> {
    const sample = new AudioSample(filename, options);
    await sample.ready;
    return sample;
  }

  async #loadFile(): Promise<void> {
    if (this.#disposed) {
      return;
    }
    const buffer =
      typeof window !== "undefined"
        ? await this.#readFromBrowser()
        : await this.#readFromNode();
    if (this.#disposed) {
      return;
    }
    try {
      this.#data = await this.#engine.decode(buffer);
    } catch (error) {
      if (!this.#disposed) {
        throw error;
      }
    }
  }

  async #readFromBrowser(): Promise<ArrayBuffer> {
    const response = await fetch(this.#filename);
    if (!response.ok) {
      throw new Error(
        `Failed to load audio sample "${this.#filename}": ${response.status} ${response.statusText}`,
      );
    }
    return response.arrayBuffer();
  }

  async #readFromNode(): Promise<ArrayBuffer> {
    const { readFile } = await import("node:fs/promises");
    const file = await readFile(this.#filename);
    return Uint8Array.from(file).buffer;
  }

  get isValid(): boolean {
    return !this.#disposed && this.#data !== null && this.#loaded;
  }

  get filename(): string {
    return this.#filename;
  }

  set filename(value: string) {
    this.#filename = value;
  }

  get context(): AudioContext | null {
    return this.#disposed || this.#engine.disposed
      ? null
      : this.#engine.context;
  }

  /** The engine this sample plays through. */
  get engine(): AudioEngine {
    return this.#engine;
  }

  /**
   * Position in the buffer, derived from the audio clock rather than any
   * timer, so it is exactly where the sound is.
   */
  get currentTime(): number {
    if (this.#isPlaying && !this.#engine.disposed) {
      const elapsed = Math.max(0, this.#engine.now - this.#startContextTime);
      return Math.min(
        this.#startOffset + elapsed,
        this.#data?.duration ?? this.#startOffset,
      );
    }
    return this.#playbackOffset;
  }

  get duration(): number {
    return this.#data?.duration ?? 0;
  }

  get playing(): boolean {
    return this.#isPlaying;
  }

  get volume(): number {
    return this.#volume;
  }

  set volume(value: number) {
    this.#volume = value;
    if (this.#gain) {
      this.#engine.smooth(this.#gain.gain, value);
    }
  }

  #ensureGain(): GainNode {
    if (this.#gain === null) {
      const context = this.#engine.context;
      this.#gain = context.createGain();
      this.#gain.gain.value = this.#volume;
      this.#gain.connect(this.#engine.input);
    }
    return this.#gain;
  }

  /**
   * Starts a new voice at context time `when`, `offset` seconds into the
   * buffer. The voice fades in so a start at an arbitrary offset cannot click.
   */
  #startVoice(offset: number, when: number): void {
    if (!this.#data || this.#engine.disposed) {
      return;
    }
    const context = this.#engine.context;
    const gain = this.#ensureGain();

    const source = context.createBufferSource();
    source.buffer = this.#data;
    const envelope = context.createGain();
    try {
      envelope.gain.value = 0;
      envelope.gain.setValueAtTime(0, when);
      envelope.gain.linearRampToValueAtTime(1, when + FADE_IN_SECONDS);
    } catch {
      // If the fade cannot be scheduled, play at full gain rather than silent.
      envelope.gain.value = 1;
    }
    source.connect(envelope);
    envelope.connect(gain);

    const voice: Voice = { source, envelope };
    source.onended = () => {
      disconnectVoice(voice);
      if (this.#voice !== voice) {
        return;
      }
      this.#voice = null;
      this.#isPlaying = false;
      this.#playbackOffset = this.duration;
      this.#onEnded({ data: null });
      this.#onStop({ data: null });
    };

    this.#voice = voice;
    this.#startOffset = offset;
    this.#startContextTime = when;
    this.#playbackOffset = offset;
    this.#isPlaying = true;
    source.start(when, offset);
    void this.#engine.resume().catch((error: unknown) => {
      console.error("Error resuming audio context", error);
    });
  }

  /** Fades the current voice out instead of cutting it mid-waveform. */
  #stopVoice(): void {
    const voice = this.#voice;
    this.#voice = null;
    this.#isPlaying = false;
    if (!voice) {
      return;
    }
    voice.source.onended = () => disconnectVoice(voice);
    try {
      const now = this.#engine.now;
      voice.envelope.gain.cancelScheduledValues(now);
      voice.envelope.gain.setTargetAtTime(0, now, FADE_OUT_TIME_CONSTANT);
      voice.source.stop(now + FADE_OUT_STOP_AFTER);
    } catch {
      try {
        voice.source.stop();
      } catch {
        // Never started or already stopped.
      }
      disconnectVoice(voice);
    }
  }

  public reload() {
    void this.#loadFile().catch((error: unknown) => {
      console.error("Error reloading audio sample", error);
    });
  }

  public async reloadAsync() {
    return this.#loadFile();
  }

  /**
   * Starts playback. `when` is a context time (see `engine.now`); passing the
   * same value to several samples starts them sample-aligned.
   */
  public play(offset?: number, when?: number): boolean {
    if (!this.isValid) {
      return false;
    }
    if (this.#isPlaying) {
      return false;
    }
    const startOffset =
      offset ??
      (this.#playbackOffset >= this.duration ? 0 : this.#playbackOffset);
    if (
      !Number.isFinite(startOffset) ||
      startOffset < 0 ||
      startOffset > this.duration
    ) {
      return false;
    }
    this.#startVoice(
      startOffset,
      when ?? this.#engine.now + START_LEAD_SECONDS,
    );
    this.#onPlay({ data: null });
    return true;
  }

  public pause(): boolean {
    if (!this.isValid || !this.#isPlaying) {
      return false;
    }
    this.#playbackOffset = this.currentTime;
    this.#stopVoice();
    this.#onPause({ data: null });
    return true;
  }

  public stop(): boolean {
    if (!this.isValid) {
      return false;
    }
    this.#stopVoice();
    this.#playbackOffset = 0;
    this.#onStop({ data: null });
    return true;
  }

  public dispose(): void {
    if (this.#disposed) {
      return;
    }
    this.#disposed = true;
    this.#stopVoice();
    try {
      this.#gain?.disconnect();
    } catch {
      // Already disconnected.
    }
    this.#gain = null;
    if (this.#ownsEngine) {
      this.#engine.dispose();
    }
  }

  /** Jumps to `time`. While playing, the new position starts at `when`. */
  public seek(time: number, when?: number): boolean {
    if (
      this.#disposed ||
      !this.isValid ||
      !Number.isFinite(time) ||
      time < 0 ||
      time > this.duration
    ) {
      return false;
    }
    const wasPlaying = this.#isPlaying;
    this.#stopVoice();
    this.#playbackOffset = time;
    if (wasPlaying) {
      this.#startVoice(time, when ?? this.#engine.now + START_LEAD_SECONDS);
    }
    return true;
  }
}

export default AudioSample;
