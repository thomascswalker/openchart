import { MidiTrack } from "@openchart/midi";
import {
  InstrumentTrackViewConfig,
  hasDifficulties,
  getDifficultyNotePitch,
  describeTrack,
} from "../config.js";
import { Difficulty } from "../types.js";
import { ChartView } from "./chart.js";
import { SongView } from "./song.js";
import { TrackView } from "./track.js";

export class InstrumentTrackView extends TrackView {
  protected config: InstrumentTrackViewConfig;
  /** Absent for instruments without difficulties (vocals). */
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

    const offsets: Record<Difficulty, number> = {
      [Difficulty.Expert]: config.offsets?.expert || 0,
      [Difficulty.Hard]: config.offsets?.hard || 0,
      [Difficulty.Medium]: config.offsets?.medium || 0,
      [Difficulty.Easy]: config.offsets?.easy || 0,
    };
    this.charts = new Map(
      [
        Difficulty.Expert,
        Difficulty.Hard,
        Difficulty.Medium,
        Difficulty.Easy,
      ].map((difficulty) => [
        difficulty,
        new ChartView(
          this,
          this.track,
          difficulty,
          offsets[difficulty],
          config.noteCount,
          config.role,
          getDifficultyNotePitch(describeTrack(config), difficulty, "Kick2"),
        ),
      ]),
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
