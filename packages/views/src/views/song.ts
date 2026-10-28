import { MetaType, Midi, MidiTrack } from "@openchart/midi";
import {
  DefaultConfig,
  InstrumentViewConfig,
  SongViewConfig,
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

  constructor(midi: Midi, config: SongViewConfig = DefaultConfig) {
    this.midi = midi;
    this.config = config;
    this.build();
  }

  public getConfig(): SongViewConfig {
    return this.config;
  }

  /**
   * Build the track views for the song based on the current configuration.
   */
  public build(): void {
    this.instruments = [];
    this.config.tracks.forEach((def: TrackViewConfig) => {
      const midiTrack = this.midi.getTrack(def.name);

      // Initialize the respective track view for the MIDI track
      switch (def.type) {
        case "global":
          this.global = new GlobalTrackView(this, midiTrack, def);
          break;
        case "instrument":
          switch (def.instrument) {
            case "vocal":
              this.instruments.push(new VocalTrackView(this, midiTrack, def));
              break;
            default:
              this.instruments.push(
                new InstrumentTrackView(
                  this,
                  midiTrack,
                  def as InstrumentViewConfig,
                ),
              );
              break;
          }
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

  public getTrackConfigs(): readonly TrackViewConfig[] {
    return this.config.tracks;
  }

  public getVisibleTrackDescriptors(): readonly TrackViewConfig[] {
    return this.getTrackConfigs().filter(
      (descriptor) => descriptor.visible && descriptor.name !== "CHART HEADER",
    );
  }

  public getMidiTrack(
    keyOrConfig: string | TrackViewConfig,
  ): MidiTrack | undefined {
    const key = typeof keyOrConfig === "string" ? keyOrConfig : keyOrConfig.key;
    const config = this.getTrackConfigs().find((item) => item.key === key);
    return config ? this.midi.getTrack(config.name) : undefined;
  }

  /** Materialize a configured track only for an intentional edit. */
  public ensureMidiTrack(key: string): MidiTrack | undefined {
    const descriptor = this.getTrackConfigs().find((item) => item.key === key);
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
    this.build();
    return this.midi.getTrack(descriptor.name);
  }

  public getUnmappedMidiTracks(): readonly MidiTrack[] {
    const names = new Set(this.getTrackConfigs().map((item) => item.name));
    return this.midi.tracks.filter((track) => !names.has(track.name));
  }
}

export { SongView, Instrument };
