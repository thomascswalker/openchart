import { describe, expect, it } from "vitest";
import type { MidiNote } from "@midiedit/core";
import { NoteCrossingTracker } from "./noteCrossing";

function note(start: number, pitch: number): MidiNote {
  return {
    note: pitch,
    velocity: 100,
    start,
    end: start + 120,
    noteOn: { data1: pitch } as MidiNote["noteOn"],
    noteOff: { data1: pitch } as MidiNote["noteOff"],
  };
}

describe("NoteCrossingTracker", () => {
  it("fires a chord once when the playhead crosses it", () => {
    const tracker = new NoteCrossingTracker();
    const chord = [note(480, 60), note(480, 64), note(480, 67)];
    tracker.begin("highway:expert", 0);

    expect(tracker.advance("highway:expert", 480, chord)).toHaveLength(3);
    expect(tracker.advance("highway:expert", 480, chord)).toHaveLength(0);
  });

  it("fires a note that begins exactly at playback start", () => {
    const tracker = new NoteCrossingTracker();
    const first = note(0, 60);
    tracker.begin("highway:expert", 0);

    expect(tracker.advance("highway:expert", 1, [first])).toEqual([first]);
    expect(tracker.advance("highway:expert", 1, [first])).toEqual([]);
  });

  it("handles backward seeks and chart changes independently", () => {
    const tracker = new NoteCrossingTracker();
    const first = note(240, 60);
    const second = note(240, 62);
    tracker.begin("chart-a", 0);
    expect(tracker.advance("chart-a", 240, [first])).toEqual([first]);
    tracker.reset("chart-a");
    tracker.begin("chart-a", 0);
    expect(tracker.advance("chart-a", 240, [first])).toEqual([first]);
    tracker.begin("chart-b", 0);
    expect(tracker.advance("chart-b", 240, [second])).toEqual([second]);
  });
});
