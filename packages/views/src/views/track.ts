import { MidiTrack } from "@openchart/midi";
import { SongView } from "../views/song.js";
import { TrackViewConfig } from "../config.js";

export class TrackView<TConfig extends TrackViewConfig> {
  protected readonly song: SongView;
  protected track: MidiTrack | undefined;
  protected readonly config: TConfig;
  protected readonly validator: (track: MidiTrack) => boolean;

  constructor(
    song: SongView,
    midiTrack: MidiTrack | undefined,
    config: TConfig,
    validator: (midiTrack: MidiTrack) => boolean = () => {
      return true;
    },
  ) {
    this.song = song;
    this.track = midiTrack;
    this.config = config;
    this.validator = validator;
  }

  public isValid(): boolean {
    return this.track !== undefined && this.validator(this.track);
  }

  public getSong(): SongView {
    return this.song;
  }

  public getKey(): string {
    return this.config.key;
  }

  public getMidiTrack(): MidiTrack | undefined {
    return this.track;
  }

  public getConfig(): TConfig {
    return this.config;
  }
}
