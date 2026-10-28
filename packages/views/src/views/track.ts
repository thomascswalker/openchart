import { MidiTrack } from "@openchart/midi";
import type { TrackRules } from "../ruleset/compile.js";
import type { SongView } from "./song.js";

/** Base view of one MIDI track, driven by its compiled {@link TrackRules}. */
export class TrackView {
  protected readonly song: SongView;
  protected track: MidiTrack | undefined;
  protected readonly rules: TrackRules;

  constructor(
    song: SongView,
    midiTrack: MidiTrack | undefined,
    rules: TrackRules,
  ) {
    this.song = song;
    this.track = midiTrack;
    this.rules = rules;
  }

  public isValid(): boolean {
    return this.track !== undefined;
  }

  public getSong(): SongView {
    return this.song;
  }

  public getKey(): string {
    return this.rules.key;
  }

  public getName(): string {
    return this.rules.name;
  }

  public getMidiTrack(): MidiTrack | undefined {
    return this.track;
  }

  public getRules(): TrackRules {
    return this.rules;
  }
}
