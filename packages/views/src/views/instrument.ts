import { MidiTrack } from "@openchart/midi";
import {
  describeTrack,
  hasDifficulties,
  type ChartViewConfig,
  type InstrumentTrackViewConfig,
} from "../config.js";
import { drumLayoutFromConfig } from "../chart/drums.js";
import { Difficulty } from "../types.js";
import { ChartView } from "./chart.js";
import { SongView } from "./song.js";
import { TrackView } from "./track.js";

export class InstrumentTrackView extends TrackView {
  protected config: InstrumentTrackViewConfig;
  private readonly charts: Map<Difficulty, ChartView> | null;

  constructor(
    song: SongView,
    midiTrack: MidiTrack | undefined,
    config: InstrumentTrackViewConfig,
    validator: (midiTrack: MidiTrack) => boolean = () => {
      return true;
    },
  ) {
    super(song, midiTrack, validator);
    this.config = config;

    if (!hasDifficulties(config)) {
      this.charts = null;
      return;
    }

    this.charts = new Map(
      config.charts
        .filter((chart): chart is ChartViewConfig => "difficulty" in chart)
        .sort((left, right) => right.difficulty - left.difficulty)
        .map((chart) => {
          const descriptor = describeTrack(config);
          const drumLayout = drumLayoutFromConfig(descriptor, chart.difficulty);
          const specialPitches = drumLayout
            ? [
                drumLayout.kick,
                drumLayout.kick2,
                ...drumLayout.pads,
                ...drumLayout.cymbals,
                ...drumLayout.markers,
              ].filter((pitch): pitch is number => pitch !== null)
            : [];
          return [
            chart.difficulty,
            new ChartView(
              this.song,
              this,
              this.track,
              chart,
              specialPitches,
              () => {
                this.track ??= this.song.ensureMidiTrack(this.getKey());
                return this.track;
              },
            ),
          ];
        }),
    );
  }

  public getName(): string {
    return this.config.name;
  }

  public getConfig(): InstrumentTrackViewConfig {
    return this.config;
  }

  public override getKey(): string {
    return describeTrack(this.config).key;
  }

  public getMidiTrack(): MidiTrack | undefined {
    return this.track;
  }

  public hasDifficulties(): boolean {
    return this.charts !== null;
  }

  /** Undefined for instruments without difficulties. */
  public getChart(difficulty: Difficulty): ChartView | undefined {
    return this.charts?.get(difficulty);
  }

  /** Expert, Hard, Medium, Easy; empty for instruments without difficulties. */
  public getCharts(): ChartView[] {
    return this.charts ? [...this.charts.values()] : [];
  }
}
