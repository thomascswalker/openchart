import { IStatefulService } from "../platform/services";
import Mixer from "@openchart/mixer";
import type { ILoggerService } from "./logger";
import type { FileSystemService } from "./filesystem";

export const wavFilePickerTypes: FilePickerAcceptType[] = [
  {
    description: "WAV file",
    accept: { "audio/wav": [".wav"] },
  },
];

type MixerInstance = InstanceType<typeof Mixer>;

export interface MixerSnapshot {
  readonly mixer: MixerInstance;
}

export class MixerService extends IStatefulService<MixerSnapshot> {
  static dependencies = ["logger", "filesystem"];
  private readonly logger: ILoggerService;
  private readonly fileSystem: FileSystemService;

  constructor(logger: ILoggerService, fileSystem: FileSystemService) {
    super();
    this.logger = logger;
    this.fileSystem = fileSystem;
    this.reset();
  }

  public readonly reset = (): void => {
    const mixer = new Mixer();
    mixer.onPlay = (event) =>
      this.logger.info(`Mixer playback started: ${JSON.stringify(event)}`);
    mixer.onPause = (event) =>
      this.logger.info(`Mixer playback paused: ${JSON.stringify(event)}`);
    mixer.onStop = (event) =>
      this.logger.info(`Mixer playback stopped: ${JSON.stringify(event)}`);
    mixer.onChange = this.publish;
    this._snapshot = { mixer };
    this.notify();
  };

  public addTrack = async (id: string): Promise<void> => {
    const file = await this.fileSystem.read(wavFilePickerTypes);
    if (!file) {
      this.logger.error(`No file selected for track: ${id}`);
      return;
    }

    const blob = new Blob([new Uint8Array(file.bytes).buffer], {
      type: "audio/wav",
    });
    const fileURL = URL.createObjectURL(blob);
    this._snapshot.mixer.addTrack(id, fileURL);
    this.logger.info(`Track added: ${id}`);
  };

  public removeTrack = (id: string): void => {
    this._snapshot.mixer.removeTrack(id);
  };

  public getTracks = (): string[] => this._snapshot.mixer.listTracks();

  public play = (): void => this._snapshot.mixer.play();

  public stop = (): void => this._snapshot.mixer.stop();

  public pause = (): void => this._snapshot.mixer.pause();

  private readonly publish = (): void => {
    this._snapshot = { ...this._snapshot };
    this.notify();
  };
}
