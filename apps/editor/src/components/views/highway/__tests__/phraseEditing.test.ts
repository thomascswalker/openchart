import type { MidiChannelEvent, MidiNote } from "@openchart/midi";
import { Difficulty, type MidiNotePhrase } from "@openchart/views";
import { describe, expect, it } from "vitest";
import * as THREE from "three";
import type { ChartViewState } from "../../AbstractChartView";
import { HighwayCoordinateSystem } from "../coordinates";
import type { HighwayContext } from "../context";
import { HighwayPhraseEditingController } from "../editing/phraseEditing";

function createController(
  overrides: Partial<HighwayContext> = {},
): HighwayPhraseEditingController {
  const state: ChartViewState = {
    midi: null,
    selectedTrackKey: null,
    selectedTrackIndex: null,
    selectedInstrument: "LEAD GUITAR",
    selectedDifficulty: Difficulty.Expert,
    snap: { enabled: true, denominator: 4 },
    lockCursor: false,
    isPlaying: false,
  };
  const coordinates = new HighwayCoordinateSystem(
    {
      getCanvas: () => null,
      getCameraTick: () => 0,
      getPpqn: () => 480,
      getState: () => state,
      getViewport: () => ({ width: 800, height: 600 }),
    },
    new THREE.PerspectiveCamera(45, 4 / 3, 0.1, 64),
  );
  return new HighwayPhraseEditingController(
    {
      beginEdit: () => {},
      endEdit: () => {},
      getCurrentChart: () => null,
      ...overrides,
    } as unknown as HighwayContext,
    coordinates,
  );
}

function createPhrase(): MidiNotePhrase {
  return {
    start: 480,
    end: 960,
    note: {
      noteOn: {} as MidiChannelEvent,
    } as MidiNote,
  } as MidiNotePhrase;
}

describe("HighwayPhraseEditingController", () => {
  it("creates a drag preview and cancels it", () => {
    const editing = createController();
    editing.beginPhraseDrag(7, "stagepower", 120, null, "create");
    editing.updatePhraseDrag(360);

    expect(editing.getDragState()).toMatchObject({
      pointerId: 7,
      startTick: 120,
      endTick: 360,
      operation: "create",
    });
    editing.cancelPhraseDrag();
    expect(editing.getDragState()).toBeNull();
  });

  it("normalizes reverse creation and ignores a click without a drag", () => {
    const editing = createController();
    editing.beginPhraseDrag(1, "solo", 720, null, "create");
    editing.updatePhraseDrag(240);
    expect(editing.getDragState()).toMatchObject({
      startTick: 240,
      endTick: 720,
      moved: true,
    });

    editing.cancelPhraseDrag();
    editing.beginPhraseDrag(2, "solo", 480, null, "create");
    expect(editing.finishPhraseDrag()).toBe(false);
  });

  it("closes one history transaction on finish and cancellation", () => {
    const calls: string[] = [];
    const editing = createController({
      beginEdit: () => calls.push("begin"),
      endEdit: () => calls.push("end"),
    });

    editing.beginPhraseDrag(1, "solo", 100, null, "create");
    editing.cancelPhraseDrag();
    editing.beginPhraseDrag(2, "solo", 100, null, "create");
    editing.finishPhraseDrag();

    expect(calls).toEqual(["begin", "end", "begin", "end"]);
  });

  it("clears selected phrase identity after external track removal", () => {
    const phrase = createPhrase();
    const notes = [phrase.note];
    const chart = {
      getTrack: () => ({ getMidiTrack: () => ({ getNotes: () => notes }) }),
    };
    const editing = createController({
      getCurrentChart: () => chart as never,
    });

    editing.selectPhrase(phrase);
    expect(editing.getSelectedPhraseNoteOn()).toBe(phrase.note.noteOn);
    notes.length = 0;
    expect(editing.getSelectedPhraseNoteOn()).toBeNull();
  });

  it("replaces or additively extends phrase marquee selection", () => {
    const first = createPhrase();
    const second = createPhrase();
    const third = createPhrase();
    const notes = [first.note, second.note, third.note];
    const chart = {
      getTrack: () => ({ getMidiTrack: () => ({ getNotes: () => notes }) }),
    };
    const editing = createController({
      getCurrentChart: () => chart as never,
    });

    editing.selectPhrases([first.note.noteOn, second.note.noteOn], false);
    editing.selectPhrases([third.note.noteOn], true);
    expect(editing.getSelectedPhraseNoteOns()).toEqual([
      first.note.noteOn,
      second.note.noteOn,
      third.note.noteOn,
    ]);

    editing.selectPhrases([second.note.noteOn], false);
    expect(editing.getSelectedPhraseNoteOns()).toEqual([second.note.noteOn]);
    editing.selectPhrases([], false);
    expect(editing.getSelectedPhraseNoteOns()).toEqual([]);
  });

  it("deletes all selected phrases in one history transaction", () => {
    const first = createPhrase();
    const second = createPhrase();
    const notes = [first.note, second.note];
    const track = {
      getNotes: () => notes,
      removeNote: (noteOn: MidiChannelEvent) => {
        const index = notes.findIndex((note) => note.noteOn === noteOn);
        if (index < 0) return false;
        notes.splice(index, 1);
        return true;
      },
    };
    const calls: string[] = [];
    const chart = { getTrack: () => ({ getMidiTrack: () => track }) };
    const editing = createController({
      getCurrentChart: () => chart as never,
      beginEdit: () => calls.push("begin"),
      endEdit: () => calls.push("end"),
      notifyNotesChanged: () => calls.push("changed"),
    });
    editing.selectPhrases([first.note.noteOn, second.note.noteOn], false);

    expect(editing.deleteSelectedPhrase()).toBe(true);
    expect(notes).toEqual([]);
    expect(calls).toEqual(["begin", "changed", "end"]);
    expect(editing.getSelectedPhraseNoteOns()).toEqual([]);
  });

  it("snaps phrase movement and keeps resized phrases at least one tick long", () => {
    const editing = createController();
    const phrase = createPhrase();
    editing.beginPhraseDrag(1, "solo", 720, phrase, "move");
    editing.updatePhraseDrag(800);
    expect(editing.getDragState()).toMatchObject({
      startTick: 480,
      endTick: 960,
      operation: "move",
    });

    editing.beginPhraseDrag(2, "solo", 480, phrase, "resize-end");
    editing.updatePhraseDrag(200);
    expect(editing.getDragState()).toMatchObject({
      startTick: 480,
      endTick: 481,
      operation: "resize-end",
    });

    editing.beginPhraseDrag(3, "solo", 480, phrase, "resize-start");
    editing.updatePhraseDrag(0);
    expect(editing.getDragState()).toMatchObject({
      startTick: 0,
      endTick: 960,
      operation: "resize-start",
    });
  });
});
