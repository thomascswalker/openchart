import { MidiTrack } from "@openchart/midi";
import { SongView } from "../views/song.js";
import { describeTrack } from "../config.js";

export class TrackView {
  protected song: SongView;
  protected track: MidiTrack | undefined;
  protected validator: (track: MidiTrack) => boolean;

  constructor(
    song: SongView,
    midiTrack: MidiTrack | undefined,
    validator: (midiTrack: MidiTrack) => boolean = () => {
      return true;
    },
  ) {
    this.song = song;
    this.track = midiTrack;
    this.validator = validator;
  }

  public isValid(): boolean {
    return this.track !== undefined && this.validator(this.track);
  }

  public getSong(): SongView {
    return this.song;
  }

  public getKey(): string {
    return describeTrack({
      name: this.track?.name || "",
      type: "global",
      notes: {},
    }).key;
  }

  public getMidiTrack(): MidiTrack | undefined {
    return this.track;
  }
}
