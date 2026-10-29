import { describe, expect, it } from "vitest";
import {
  getPhraseAutoScrollDelta,
  getHighwayDragTarget,
  getHighwaySnapDenominator,
  getHighwaySteppedTick,
  getHighwayWheelTick,
  getPhrasePointerAction,
} from "../interactionMath";
import {
  getHighwaySustainEnd,
  getSustainCutOptions,
  getSustainCutTargets,
  getSustainsAtTick,
  MinimumMidiNoteDurationTicks,
} from "@openchart/views";
import { getPhraseModeForHighwayMode } from "../types";

describe("highway interaction helpers", () => {
  it("maps phrase modes independently from note tools", () => {
    expect(getPhraseModeForHighwayMode("stagepower")).toBe("stagepower");
    expect(getPhraseModeForHighwayMode("solo")).toBe("solo");
    expect(getPhraseModeForHighwayMode("select")).toBeNull();
    expect(getPhraseModeForHighwayMode("place")).toBeNull();
    expect(getPhraseModeForHighwayMode("remove")).toBeNull();
  });

  it("uses the minimum valid MIDI duration for a click-created note", () => {
    expect(MinimumMidiNoteDurationTicks).toBe(1);
  });

  it("computes bounded phrase edge-scroll targets in both directions", () => {
    expect(getPhraseAutoScrollDelta(0, 600, "resize-end", 48, 96)).toBe(96);
    expect(getPhraseAutoScrollDelta(24, 600, "resize-end", 48, 96)).toBe(48);
    expect(getPhraseAutoScrollDelta(599, 600, "resize-start", 48, 96)).toBe(
      -94,
    );
    expect(getPhraseAutoScrollDelta(100, 600, "resize-end", 48, 96)).toBe(0);
  });

  it("prioritizes phrase hits, then empty-band creation, then marquee", () => {
    expect(getPhrasePointerAction(true, true, true)).toBe("edit-phrase");
    expect(getPhrasePointerAction(false, true, false)).toBe("create-phrase");
    expect(getPhrasePointerAction(false, true, true)).toBe("marquee");
    expect(getPhrasePointerAction(false, false, false)).toBe("marquee");
  });

  it("moves the playhead in the corrected wheel direction", () => {
    expect(getHighwayWheelTick(480, 100, 480, 1 / 100)).toBe(0);
    expect(getHighwayWheelTick(480, -100, 480, 1 / 100)).toBe(960);
  });

  it("steps between absolute snap boundaries", () => {
    expect(getHighwaySteppedTick(500, 1, 480, true)).toBe(960);
    expect(getHighwaySteppedTick(500, -1, 480, true)).toBe(480);
    expect(getHighwaySteppedTick(480, -1, 480, true)).toBe(0);
    expect(getHighwaySteppedTick(500, 1, 480, false)).toBe(980);
  });

  it("moves through supported snap denominators", () => {
    const choices = [1, 2, 3, 4, 6, 8];

    expect(getHighwaySnapDenominator(4, -1, choices)).toBe(3);
    expect(getHighwaySnapDenominator(4, 1, choices)).toBe(6);
    expect(getHighwaySnapDenominator(8, 1, choices)).toBe(8);
  });

  it("calculates group drag positions from their initial locations", () => {
    expect(getHighwayDragTarget(960, 2, 250, 1, 240, true, 5)).toEqual({
      tick: 1_200,
      lane: 3,
    });
    expect(getHighwayDragTarget(960, 2, 250, -4, 240, true, 5)).toEqual({
      tick: 1_200,
      lane: 0,
    });
  });

  it("follows the pointer when extending or shortening a sustain", () => {
    expect(getHighwaySustainEnd(480, 1_200)).toBe(1_200);
    expect(getHighwaySustainEnd(480, 720)).toBe(720);
    expect(getHighwaySustainEnd(480, 0)).toBe(481);
  });

  it("stops sustain extension at the next note unless Shift allows overlap", () => {
    expect(getHighwaySustainEnd(480, 1_200, [840])).toBe(840);
    expect(
      getHighwaySustainEnd(480, 1_200, [840], { extendPastNext: true }),
    ).toBe(1_200);
    expect(getHighwaySustainEnd(480, 900, [840])).toBe(840);
  });

  it("finds one or all sustains crossing the clicked tick", () => {
    const notes = [
      { start: 0, end: 960, lane: 0, noteOn: "green" },
      { start: 240, end: 720, lane: 1, noteOn: "yellow" },
      { start: 480, end: 960, lane: 2, noteOn: "blue" },
    ];

    expect(getSustainsAtTick(notes, 500).map((note) => note.lane)).toEqual([
      0, 1, 2,
    ]);
    expect(
      getSustainCutTargets(
        notes,
        500,
        getSustainCutOptions(false, "green"),
      ).map((note) => note.lane),
    ).toEqual([0]);
    expect(
      getSustainCutTargets(notes, 500, getSustainCutOptions(true, "green")).map(
        (note) => note.lane,
      ),
    ).toEqual([0, 1, 2]);
    expect(
      getSustainCutTargets(
        notes,
        500,
        getSustainCutOptions(false, "green", true),
      ).map((note) => note.lane),
    ).toEqual([0, 1, 2]);
    expect(
      getSustainCutTargets(
        notes,
        500,
        getSustainCutOptions(true, "green", true),
      ).map((note) => note.lane),
    ).toEqual([0]);
    expect(
      getSustainCutTargets(notes, 500, getSustainCutOptions(true)),
    ).toEqual([]);
    expect(
      getSustainCutTargets(notes, 500, getSustainCutOptions(false)),
    ).toEqual(notes);
  });
});
