import { readFile } from "node:fs/promises";

export interface AudioSampleOptions {
  initialVolume?: number;
  onLoaded?: () => void;
  onPlay?: () => void;
  onPause?: () => void;
  onStop?: () => void;
}

const defaultAudioSampleOptions: Required<AudioSampleOptions> = {
  initialVolume: 1,
  onLoaded: () => {},
  onPlay: () => {},
  onPause: () => {},
  onStop: () => {},
};

class AudioSample {
  /* Indicates whether the audio sample has been loaded */
  #loaded: boolean = false;
  /* The filename of the audio sample */
  #filename: string;
  /* The volume level for playback */
  #volume: number = 1;

  /* The audio context for playback */
  #context: AudioContext | null = null;
  /* The raw audio data */
  #data: AudioBuffer | null = null;
  /* The source node for audio playback */
  #sourceNode: AudioBufferSourceNode | null = null;
  /* The gain node for controlling volume */
  #gain: GainNode | null = null;
  /* The time at which the current source started in the audio context */
  #startContextTime: number = 0;
  /* The playback position when no source is currently playing */
  #playbackOffset: number = 0;
  #isPlaying: boolean = false;

  /* Events */

  /* Called when the audio sample has finished loading */
  readonly #onLoaded: () => void;
  readonly #onPlay: () => void;
  readonly #onPause: () => void;
  readonly #onStop: () => void;

  /* Promise that resolves when the audio sample is fully loaded */
  readonly ready: Promise<void>;

  private constructor(filename: string, options?: AudioSampleOptions) {
    // Merge the default options with the provided options to ensure all required fields are set
    const combinedOptions = { ...defaultAudioSampleOptions, ...options };
    this.#volume = combinedOptions.initialVolume;
    this.#onLoaded = combinedOptions.onLoaded;
    this.#onPlay = combinedOptions.onPlay;
    this.#onPause = combinedOptions.onPause;
    this.#onStop = combinedOptions.onStop;

    // Set the filename and start loading the audio file
    this.#filename = filename;
    this.ready = this.#loadFile().then(() => {
      this.#loaded = true;
      this.#onLoaded();
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
    this.#ensureContext();
    const file = await readFile(this.#filename);
    const buffer = Uint8Array.from(file).buffer;
    if (!this.#context) {
      throw new Error("Audio context was not initialized");
    }
    this.#data = await this.#context.decodeAudioData(buffer);
  }

  get isValid(): boolean {
    return this.#data !== null && this.#loaded;
  }

  get filename(): string {
    return this.#filename;
  }

  set filename(value: string) {
    this.#filename = value;
  }

  get context(): AudioContext | null {
    return this.#context;
  }

  get currentTime(): number {
    if (this.#isPlaying && this.#context) {
      return Math.min(
        this.#playbackOffset +
          this.#context.currentTime -
          this.#startContextTime,
        this.#data?.duration ?? this.#playbackOffset,
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
      this.#gain.gain.value = value;
    }
  }

  #ensureContext(): void {
    if (this.#context === null) {
      this.#context = new AudioContext();
    }

    if (this.#gain === null) {
      this.#gain = this.#context.createGain();
      this.#gain.gain.value = this.#volume;
      this.#gain.connect(this.#context.destination);
    }
  }

  #startSource(offset: number): void {
    this.#ensureContext();
    if (!this.#context || !this.#data || !this.#gain) {
      return;
    }

    const source = this.#context.createBufferSource();
    source.buffer = this.#data;
    source.connect(this.#gain);
    source.onended = () => {
      if (this.#sourceNode !== source) {
        return;
      }
      this.#sourceNode = null;
      this.#isPlaying = false;
      this.#playbackOffset = this.duration;
      this.#onStop();
    };

    this.#sourceNode = source;
    this.#playbackOffset = offset;
    this.#startContextTime = this.#context.currentTime;
    this.#isPlaying = true;
    source.start(0, offset);
    void this.#context.resume().catch((error: unknown) => {
      console.error("Error resuming audio context", error);
    });
  }

  #stopSource(): void {
    const source = this.#sourceNode;
    this.#sourceNode = null;
    this.#isPlaying = false;
    if (source) {
      source.onended = null;
      source.stop();
    }
  }

  public reload() {
    this.#loadFile();
  }

  public async reloadAsync() {
    return this.#loadFile();
  }

  public play(offset?: number): boolean {
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
    this.#startSource(startOffset);
    this.#onPlay();
    return true;
  }

  public pause(): boolean {
    if (!this.isValid || !this.#isPlaying) {
      return false;
    }
    this.#playbackOffset = this.currentTime;
    this.#stopSource();
    this.#onPause();
    return true;
  }

  public stop(): boolean {
    if (!this.isValid) {
      return false;
    }
    this.#stopSource();
    this.#playbackOffset = 0;
    this.#onStop();
    return true;
  }

  public seek(time: number): boolean {
    if (
      !this.isValid ||
      !Number.isFinite(time) ||
      time < 0 ||
      time > this.duration
    ) {
      return false;
    }
    const wasPlaying = this.#isPlaying;
    this.#stopSource();
    this.#playbackOffset = time;
    if (wasPlaying) {
      this.#startSource(time);
    }
    return true;
  }
}

export default AudioSample;
