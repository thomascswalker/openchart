import type { MidiTrack } from "@openchart/midi";
import type { TrackRules } from "../ruleset/compile";
import type { Difficulty } from "../ruleset/difficulty";
import { ChartView } from "./chart";
import type { SongView } from "./song";
import { TrackView } from "./track";

/** Chart-bearing track (guitar, drums, gamepad): one ChartView per difficulty. */
export class InstrumentTrackView extends TrackView {
  private readonly charts: Map<Difficulty, ChartView> | null;

  constructor(
    song: SongView,
    midiTrack: MidiTrack | undefined,
    rules: TrackRules,
  ) {
    super(song, midiTrack, rules);

    if (rules.difficulties.size === 0) {
      this.charts = null;
      return;
    }
    this.charts = new Map(
      [...rules.difficulties.keys()]
        .sort((left, right) => right - left)
        .map((difficulty) => [
          difficulty,
          new ChartView(this.song, this, this.track, rules, difficulty),
        ]),
    );
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
