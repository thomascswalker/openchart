import type { MidiChannelEvent, MidiNote } from "@midiedit/core";
import { Difficulty, type MidiNotePhrase } from "@midiedit/views";
import { describe, expect, it } from "vitest";
import * as THREE from "three";
import type { ChartViewState } from "../AbstractChartView";
import { HighwayCoordinateSystem } from "./coordinates";
import type { HighwayContext } from "./context";
import { HighwayPhraseEditingController } from "./phraseEditing";

function createController(): HighwayPhraseEditingController {
  const state: ChartViewState = {
    midi: null,
    selectedTrackIndex: null,
    selectedInstrument: "LEAD GUITAR",
    selectedDifficulty: Difficulty.Expert,
    snap: { enabled: true, denominator: 4 },
    isPlaying: false,
  };
  const coordinates = new HighwayCoordinateSystem(
    {
      getCanvas: () => null,
      getPlayheadTick: () => 0,
      getPpqn: () => 480,
      getState: () => state,
      getViewport: () => ({ width: 800, height: 600 }),
    },
    new THREE.PerspectiveCamera(45, 4 / 3, 0.1, 64),
  );
  return new HighwayPhraseEditingController({} as HighwayContext, coordinates);
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
    editing.beginPhraseDrag(7, "starpower", 120, null, "create");
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
  });
});
