import { MidiTrack } from "@openchart/midi";
import { TrackDescriptor, TrackType, TrackViewConfig } from "../config.js";

export type Validator = (track: MidiTrack) => boolean;

export class BaseTrackView<T extends TrackViewConfig = TrackViewConfig> {
  protected track: MidiTrack | undefined;
  protected config: T;
  protected validator: Validator | undefined;

  constructor(
    midiTrack: MidiTrack | undefined,
    config: T,
    validator?: Validator,
  ) {
    this.track = midiTrack;
    this.config = config;
    this.validator = validator;
  }

  public isValid(): boolean {
    return this.track !== undefined && (this.validator?.(this.track) ?? true);
  }

  public getDescriptor(): TrackDescriptor {
    return {
      key: this.config.key,
      name: this.config.name,
      type: this.config.type,
      visible: this.config.visible ?? true,
      editable: this.config.editable ?? true,
      config: this.config,
    };
  }

  public getKey(): string {
    return this.getDescriptor().key;
  }

  public get midiTrack(): MidiTrack | undefined {
    return this.track;
  }
}
