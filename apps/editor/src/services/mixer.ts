import { IStatefulService } from "../platform/services";
import Mixer from "@openchart/mixer";
import type { LoggerService } from "./logger";
import type { FileSystemService } from "./filesystem";
import { wavFilePickerTypes, type MixerSnapshot } from "./mixer/types";

export class MixerService extends IStatefulService<MixerSnapshot> {
  static dependencies = ["logger", "filesystem"];
  readonly #logger: LoggerService;
  readonly #fileSystem: FileSystemService;

  constructor(logger: LoggerService, fileSystem: FileSystemService) {
    super();
    this.#logger = logger;
    this.#fileSystem = fileSystem;
    this.reset();
  }

  private get mixer() {
    return this._snapshot.mixer;
  }

  public readonly reset = (): void => {
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
    relativePath?: string,
    root?: FileSystemDirectoryHandle | null,
  ): Promise<void> => {
    let bytes: Uint8Array;
    if (relativePath && root) {
      let directory = root;
      const parts = relativePath.split("/").filter(Boolean);
      const fileName = parts.pop();
      if (!fileName) {
        throw new Error(`Invalid audio path for ${id}: ${relativePath}`);
      }
      for (const part of parts) {
        directory = await directory.getDirectoryHandle(part);
      }
      const handle = await directory.getFileHandle(fileName);
      bytes = new Uint8Array(await (await handle.getFile()).arrayBuffer());
    } else {
      const file = await this.#fileSystem.read(wavFilePickerTypes);
      if (!file) {
        this.#logger.error(`No file selected for track: ${id}`);
        return;
      }
      bytes = file.bytes;
    }

    const blob = new Blob([new Uint8Array(bytes).buffer], {
      type: "audio/wav",
    });
    const fileURL = URL.createObjectURL(blob);
    this._snapshot.mixer.addTrack(id, fileURL);
    this.#logger.info(`Track added: ${id}`);
  };

  public removeTrack = (id: string): void => {
    this._snapshot.mixer.removeTrack(id);
  };

  public getTracks = (): string[] => this.mixer.listTracks();

  public play = (): void => this.mixer.play();

  public stop = (): void => this.mixer.stop();

  public pause = (): void => this.mixer.pause();

  public solo = (id: string) => this.mixer.solo(id);

  public mute = (id: string) => this.mixer.mute(id);

  public seek = (time: number) => this.mixer.seek(time);

  public seekStart = () => this.mixer.seekStart();

  public seekEnd = () => this.mixer.seekEnd();

  private readonly publish = (): void => {
    this._snapshot = { ...this._snapshot };
    this.notify();
  };
}
