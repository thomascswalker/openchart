import { MetaType, Midi, MidiTrack } from "@openchart/midi";
import {
  defaultConfig,
  describeTrack,
  InstrumentTrackViewConfig,
  isVocalTrackConfig,
  SongViewConfig,
  TrackDescriptor,
  TrackViewConfig,
} from "../config.js";
import { Instrument } from "../types.js";
import { GlobalTrackView } from "./global.js";
import { InstrumentTrackView } from "./instrument.js";
import { VocalTrackView } from "./vocal.js";

class SongView {
  private midi: Midi;
  private config: SongViewConfig;

  private instruments!: InstrumentTrackView[];
  private global!: GlobalTrackView;

  constructor(midi: Midi, config: SongViewConfig = defaultConfig) {
    this.midi = midi;
    this.config = config;
    this.sync();
  }

  public sync(): void {
    this.instruments = [];
    this.config.tracks.forEach((def: TrackViewConfig) => {
      const midiTrack = this.midi.getTrack(def.name);

      // Initialize the respective track view for the MIDI track
      switch (def.type) {
        case "global":
          this.global = new GlobalTrackView(this, midiTrack);
          break;
        case "instrument":
          this.instruments.push(
            isVocalTrackConfig(def)
              ? new VocalTrackView(this, midiTrack, def)
              : new InstrumentTrackView(
                  this,
                  midiTrack,
                  def as InstrumentTrackViewConfig,
                ),
          );
          break;
        default:
          console.error("Not implemented yet");
          break;
      }
    });
  }

  public getInstrumentTrackView(
    instrument: string | Instrument,
  ): InstrumentTrackView | undefined {
    return this.instruments.find(
      (v) => v.getName() === instrument || v.getKey() === instrument,
    );
  }

  public getInstrumentTrackViews(): readonly InstrumentTrackView[] {
    return this.instruments;
  }

  /** The named vocal track, or the first configured one when omitted. */
  public getVocalTrackView(
    instrument?: string | Instrument,
  ): VocalTrackView | undefined {
    const views = this.getVocalTrackViews();
    return instrument === undefined
      ? views[0]
      : views.find(
          (view) =>
            view.getName() === instrument || view.getKey() === instrument,
        );
  }

  public getVocalTrackViews(): readonly VocalTrackView[] {
    return this.instruments.filter(
      (view): view is VocalTrackView => view instanceof VocalTrackView,
    );
  }

  public attachTrack(track: MidiTrack): void {
    if (!this.midi.tracks.includes(track)) {
      this.midi.tracks.push(track);
    }
  }

  public getTrackDescriptors(): readonly TrackDescriptor[] {
    return this.config.tracks.map(describeTrack);
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
    return config ? this.midi.getTrack(config.name) : undefined;
  }

  /** Materialize a configured track only for an intentional edit. */
  public ensureMidiTrack(key: string): MidiTrack | undefined {
    const descriptor = this.getTrackDescriptors().find(
      (item) => item.key === key,
    );
    if (!descriptor || descriptor.name === "CHART HEADER") return undefined;
    const existing = this.midi.getTrack(descriptor.name);
    if (existing) return existing;
    const track = new MidiTrack(descriptor.name);
    track.format = this.midi.header.format;
    // Without a TrackName event the track would save to .mid unnamed and
    // no longer map to its configured instrument on reload.
    track.addTextEvent(MetaType.TrackName, 0, descriptor.name);
    this.midi.tracks.push(track);
    this.midi.header.trackCount = this.midi.tracks.length;
    this.sync();
    return this.midi.getTrack(descriptor.name);
  }

  public getUnmappedMidiTracks(): readonly MidiTrack[] {
    const names = new Set(this.getTrackDescriptors().map((item) => item.name));
    return this.midi.tracks.filter((track) => !names.has(track.name));
  }
}

export { SongView, Instrument };
