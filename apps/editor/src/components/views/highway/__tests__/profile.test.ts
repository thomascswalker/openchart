import { Midi } from "@openchart/midi";
import {
  DefaultCompiledRuleset,
  Difficulty,
  SongView,
  classifyPitch,
} from "@openchart/views";
import { describe, expect, it } from "vitest";

describe("ruleset-driven drum lanes", () => {
  it("classifies configured drum pitches using lane and pad rules", () => {
    const track = DefaultCompiledRuleset.byKey.get("drums");
    expect(track?.kind).toBe("drums");
    if (!track) throw new Error("Default ruleset is missing drums");

    const song = new SongView(new Midi());
    const chart = song
      .getInstrumentTrackView("drums")
      ?.getChart(Difficulty.Expert);
    if (!chart) throw new Error("Default ruleset is missing Expert drums");

    expect(track.bars.map(({ id }) => id)).toContain("kick");
    expect(track.columns).toHaveLength(4);
    for (const note of chart.getChartRules().notes.values()) {
      if (!note.laneAvailable) continue;
      expect(classifyPitch(track, note.pitch, Difficulty.Expert)).toMatchObject(
        {
          kind: "laneNote",
          laneId: note.laneId,
        },
      );
    }
  });
});
