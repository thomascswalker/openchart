import { MidiTrack } from "@openchart/midi";
import {
  hasDifficulties,
  type ChartViewConfig,
  type InstrumentViewConfig,
} from "../config.js";
import { drumLayoutFromConfig } from "../chart/drums.js";
import { Difficulty } from "../types.js";
import { ChartView } from "./chart.js";
import { SongView } from "./song.js";
import { TrackView } from "./track.js";

export class InstrumentTrackView extends TrackView<InstrumentViewConfig> {
  private readonly charts: Map<Difficulty, ChartView> | null;

  constructor(
    song: SongView,
    midiTrack: MidiTrack | undefined,
    config: InstrumentViewConfig,
    validator: (midiTrack: MidiTrack) => boolean = () => {
      return true;
    },
  ) {
    super(song, midiTrack, config, validator);

    if (!hasDifficulties(config)) {
      this.charts = null;
      return;
    }

    this.charts = new Map(
      config.charts
        .filter((chart): chart is ChartViewConfig => "difficulty" in chart)
        .sort((left, right) => right.difficulty - left.difficulty)
        .map((chart) => {
          const drumLayout = drumLayoutFromConfig(config, chart.difficulty);
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
            new ChartView(this.song, this, this.track, chart, specialPitches),
          ];
        }),
    );
  }

  public getName(): string {
    return this.config.name;
  }

  public hasDifficulties(): boolean {
    return this.charts !== null && this.charts.size > 0;
  }

  public getChart(difficulty: Difficulty): ChartView | undefined {
    return this.charts?.get(difficulty);
  }

  public getCharts(): ChartView[] {
    return this.charts ? [...this.charts.values()] : [];
  }
}
