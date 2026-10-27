import { MidiTrack } from "@openchart/midi";
import { InstrumentTrackViewConfig } from "../config.js";
import { Difficulty } from "../types.js";
import { BaseChartView } from "./baseChart.js";
import { BaseTrackView, Validator } from "./baseTrack.js";

export class InstrumentTrackView extends BaseTrackView<InstrumentTrackViewConfig> {
  readonly #charts: Map<Difficulty, BaseChartView> | null;

  constructor(
    midiTrack: MidiTrack | undefined,
    config: InstrumentTrackViewConfig,
    validator?: Validator,
  ) {
    super(midiTrack, config, validator);

    const offsets = this.config.offsets;
    if (!offsets || Object.keys(offsets).length === 0) {
      this.#charts = null;
      return;
    }

    this.#charts = new Map();
    Object.entries(offsets).forEach(([key, offset]) => {
      if (!this.#charts) {
        return;
      }
      const difficulty = Object.entries(Difficulty).find(
        ([k]) => k.toLowerCase() === key,
      )?.[1] as Difficulty;
      const chart = new BaseChartView(
        this.track,
        this.config.instrument,
        difficulty,
        offset,
        this.config.noteCount,
      );
      this.#charts.set(difficulty, chart);
    });
  }

  public getName(): string {
    return this.config.name;
  }

  public getConfig(): InstrumentTrackViewConfig {
    return this.config;
  }

  public hasDifficulties(): boolean {
    return this.#charts !== null;
  }

  public getChart(difficulty: Difficulty): BaseChartView | undefined {
    return this.#charts?.get(difficulty);
  }

  public getCharts(): BaseChartView[] {
    return this.#charts ? [...this.#charts.values()] : [];
  }
}
