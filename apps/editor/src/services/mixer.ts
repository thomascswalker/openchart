import { StatefulService } from "../platform/services";
import Mixer, { type Track } from "@openchart/mixer";
import type { LoggerService } from "./logger";
import type { MixerSnapshot } from "./mixer/types";

export class MixerService extends StatefulService<MixerSnapshot> {
  static dependencies = ["logger"];
  readonly #logger: LoggerService;

  constructor(logger: LoggerService) {
    super();
    this.#logger = logger;
    this.reset();
  }

  private get mixer() {
    return this._snapshot.mixer;
  }

  public readonly reset = (): void => {
    // Release the previous mixer's tracks, object URLs, and AudioContext.
    // Each mixer owns a context; dropping one without disposing leaks it.
    const previous = this._snapshot?.mixer;
    if (previous) {
      for (const id of previous.listTracks()) {
        this.#revokeTrackUrl(id, previous);
      }
      previous.dispose?.();
    }
    const mixer = new Mixer();
    mixer.onPlay = (event) =>
      this.#logger.info(`Mixer playback started: ${JSON.stringify(event)}`);
    mixer.onPause = (event) =>
      this.#logger.info(`Mixer playback paused: ${JSON.stringify(event)}`);
    mixer.onStop = (event) =>
      this.#logger.info(`Mixer playback stopped: ${JSON.stringify(event)}`);
    mixer.onChange = this.publish;
    this._snapshot = { mixer };
    this.notify();
  };

  public addTrack = async (
    id: string,
    relativePath: string,
    root?: FileSystemDirectoryHandle | null,
    audioRootPath?: string | null,
  ): Promise<void> => {
    if (!root) {
      throw new Error(`Cannot load audio for ${id} without a project folder.`);
    }

    let directory = root;
    const parts = [
      ...(audioRootPath ?? "").split(/[\\/]/),
      ...relativePath.split(/[\\/]/),
    ].filter(Boolean);
    if (parts.some((part) => part === "." || part === "..")) {
      throw new Error(`Invalid audio path for ${id}: ${relativePath}`);
    }
    const fileName = parts.pop();
    if (!fileName) {
      throw new Error(`Invalid audio path for ${id}: ${relativePath}`);
    }
    for (const part of parts) {
      directory = await directory.getDirectoryHandle(part);
    }
    const handle = await directory.getFileHandle(fileName);
    // A File is already a Blob, so wrap it directly instead of copying the
    // bytes through an ArrayBuffer and two Uint8Arrays.
    const file = await handle.getFile();
    const blob = new Blob([file], { type: "audio/wav" });
    const fileURL = URL.createObjectURL(blob);
    this._snapshot.mixer.addTrack(id, fileURL);
    this.#logger.info(`Track added: ${id}`);
  };

  public addTrackFromUrl = (id: string, url: string): void => {
    this._snapshot.mixer.addTrack(id, url);
    this.#logger.info(`Track added: ${id}`);
  };

  public removeTrack = (id: string): void => {
    this.#revokeTrackUrl(id, this.mixer);
    this._snapshot.mixer.removeTrack(id);
  };

  #revokeTrackUrl(id: string, mixer: MixerSnapshot["mixer"]): void {
    const filename = mixer.getTrack(id)?.filename;
    if (filename?.startsWith("blob:")) {
      URL.revokeObjectURL(filename);
    }
  }

  public getTracks = () => this.mixer.tracks;
  public listTracks = (): string[] => this.mixer.listTracks();

  /** Playback position in seconds, derived from the audio clock. */
  public get currentTime(): number {
    return this.mixer.currentTime;
  }

  /**
   * The position while audio is actually playing and the audio clock is
   * running; `null` when the audio cannot be used as the time source.
   */
  public get clockTime(): number | null {
    return this.mixer.clockTime;
  }

  public play = (): void => this.mixer.play();

  public stop = (): void => this.mixer.stop();

  public pause = (): void => this.mixer.pause();

  public toggleSolo = (track: Track) => this.mixer.toggleSolo(track);

  public toggleMute = (track: Track) => this.mixer.toggleMute(track);

  public seek = (time: number) => this.mixer.seek(time);

  public seekStart = () => this.mixer.seekStart();

  public seekEnd = () => this.mixer.seekEnd();

  private readonly publish = (): void => {
    this._snapshot = { ...this._snapshot };
    this.notify();
  };
}
