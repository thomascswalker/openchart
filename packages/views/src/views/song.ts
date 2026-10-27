import { Midi, MidiTrack, MetaType } from "@openchart/midi";
import {
  SongViewConfig,
  DefaultSongConfig,
  TrackViewConfig,
  TrackDescriptor,
} from "../config.js";
import { Instrument } from "../types.js";
import { GlobalTrackView } from "./global.js";
import { InstrumentTrackView } from "./instrumentTrack.js";
import { VocalTrackView } from "./vocalTrack.js";
import { BaseTrackView } from "../index.js";

class SongView {
  #midi: Midi;
  #config: SongViewConfig;
  #views!: BaseTrackView[];

  constructor(midi: Midi, config: SongViewConfig = DefaultSongConfig) {
    this.#midi = midi;
    this.#config = config;
    this.sync();
  }

  public sync(): void {
    this.#views = [];
    this.#config.tracks.forEach((def: TrackViewConfig) => {
      const midiTrack = this.#midi.getTrack(def.name);

      // Initialize the respective track view for the MIDI track
      switch (def.type) {
        case "global":
          this.#views.push(new GlobalTrackView(midiTrack, def));
          break;
        case "instrument":
          if (def.vocals !== undefined) {
            this.#views.push(new VocalTrackView(midiTrack, def));
          } else {
            this.#views.push(new InstrumentTrackView(midiTrack, def));
          }
          break;
        default:
          console.error("Not implemented yet");
          break;
      }
    });
  }

  private getTrackViews<T extends BaseTrackView>(
    type: new (...args: any[]) => T,
  ): T[] {
    return this.#views.filter((view) => view instanceof type) as T[];
  }

  public getGlobalTrackViews(): readonly GlobalTrackView[] {
    return this.getTrackViews(GlobalTrackView);
  }

  public getInstrumentTrackViews(): readonly InstrumentTrackView[] {
    return this.getTrackViews(InstrumentTrackView);
  }

  public getVocalTrackViews(): readonly VocalTrackView[] {
    return this.getTrackViews(VocalTrackView);
  }

  public getInstrumentTrackView(
    instrument: string | Instrument,
  ): InstrumentTrackView | undefined {
    return this.getInstrumentTrackViews().find(
      (v) => v.getName() === instrument || v.getKey() === instrument,
    );
  }

  public getTrackDescriptors(): readonly TrackDescriptor[] {
    return this.#views.map((view) => view.getDescriptor());
  }

  public getVisibleTrackDescriptors(): readonly TrackDescriptor[] {
    return this.getTrackDescriptors().filter(
      (descriptor) => descriptor.visible && descriptor.name !== "CHART HEADER",
    );
  }

  public getMidiTrack(
    descriptor: string | TrackDescriptor,
  ): MidiTrack | undefined {
    const key = typeof descriptor === "string" ? descriptor : descriptor.key;
    const config = this.getTrackDescriptors().find((item) => item.key === key);
    return config ? this.#midi.getTrack(config.name) : undefined;
  }

  /** Materialize a configured track only for an intentional edit. */
  public ensureMidiTrack(key: string): MidiTrack | undefined {
    const descriptor = this.getTrackDescriptors().find(
      (item) => item.key === key,
    );
    if (!descriptor || descriptor.name === "CHART HEADER") return undefined;
    const existing = this.#midi.getTrack(descriptor.name);
    if (existing) return existing;
    const track = new MidiTrack(descriptor.name);
    track.format = this.#midi.header.format;
    // Without a TrackName event the track would save to .mid unnamed and
    // no longer map to its configured instrument on reload.
    track.addTextEvent(MetaType.TrackName, 0, descriptor.name);
    this.#midi.tracks.push(track);
    this.#midi.header.trackCount = this.#midi.tracks.length;
    this.sync();
    return this.#midi.getTrack(descriptor.name);
  }

  public getUnmappedMidiTracks(): readonly MidiTrack[] {
    const names = new Set(this.getTrackDescriptors().map((item) => item.name));
    return this.#midi.tracks.filter((track) => !names.has(track.name));
  }
}

export { SongView };
