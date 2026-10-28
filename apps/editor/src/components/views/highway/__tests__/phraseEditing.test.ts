import { formatNoteId } from "@openchart/views";
import { describe, expect, it } from "vitest";
import type { HighwayCoordinateSystem } from "../coordinates";
import { HighwayPhraseEditingController } from "../editing/phraseEditing";
import type { HighwayPhrase } from "../hitTesting";
import { createHighwayTestSetup, getPhrasePitch } from "./testUtils";

function createController() {
  const setup = createHighwayTestSetup();
  const coordinates = {
    snapTick: (tick: number) => Math.round(tick / 240) * 240,
  } as HighwayCoordinateSystem;
  return {
    setup,
    editing: new HighwayPhraseEditingController(setup.context, coordinates),
  };
}

function addPhrase(
  setup: ReturnType<typeof createHighwayTestSetup>,
  kind: "stagePower" | "solo",
  start: number,
  end: number,
): HighwayPhrase {
  const descriptor = setup.song
    .getTrackDescriptors()
    .find((track) => track.key === "lead-guitar")!;
  const pitch = getPhrasePitch(descriptor, kind)!;
  setup.midiTrack.insertNote({
    pitch,
    tick: start,
    velocity: 100,
    duration: end - start,
  });
  const note = setup.midiTrack
    .getNotes()
    .find(
      (candidate) => candidate.start === start && candidate.pitch === pitch,
    )!;
  return {
    id: formatNoteId(
      setup.session.target.trackIndex!,
      setup.midiTrack.getEventId(note.noteOn),
    ),
    start,
    end,
    kind,
  };
}

describe("HighwayPhraseEditingController", () => {
  it("previews creation and cancels without changing MIDI or history", () => {
    const { setup, editing } = createController();
    const before = setup.midi.toBuffer();
    editing.beginPhraseDrag(7, "stagePower", 120, null, "create");
    editing.updatePhraseDrag(360);

    expect(editing.getDragState()).toMatchObject({
      pointerId: 7,
      startTick: 120,
      endTick: 360,
      operation: "create",
    });
    expect(setup.context.getPreviewState()?.added).toHaveLength(1);
    editing.cancelPhraseDrag();

    expect(editing.getDragState()).toBeNull();
    expect(setup.midi.toBuffer()).toEqual(before);
    expect(setup.editing.history.undoDepth).toBe(0);
    expect(setup.context.getPreviewState()).toBeNull();
  });

  it("normalizes reverse creation and ignores a click without a drag", () => {
    const { editing } = createController();
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

  it("commits creation, movement, and resizing as session transactions", () => {
    const { setup, editing } = createController();
    editing.beginPhraseDrag(1, "stagePower", 120, null, "create");
    editing.updatePhraseDrag(360);
    expect(editing.finishPhraseDrag()).toBe(true);
    const phrase = addPhrase(setup, "solo", 480, 960);
    expect(setup.editing.history.undoDepth).toBe(1);

    editing.beginPhraseDrag(2, "solo", 720, phrase, "move");
    editing.updatePhraseDrag(960);
    expect(editing.getDragState()).toMatchObject({
      startTick: 720,
      endTick: 1200,
      operation: "move",
    });
    expect(editing.finishPhraseDrag()).toBe(true);
    const movedPhrase = { ...phrase, start: 720, end: 1200 };

    editing.beginPhraseDrag(3, "solo", 720, movedPhrase, "resize-end");
    editing.updatePhraseDrag(200);
    expect(editing.getDragState()).toMatchObject({
      startTick: 720,
      endTick: 721,
      operation: "resize-end",
    });
    expect(editing.finishPhraseDrag()).toBe(true);

    const resizedPhrase = { ...movedPhrase, end: 721 };
    editing.beginPhraseDrag(4, "solo", 720, resizedPhrase, "resize-start");
    editing.updatePhraseDrag(0);
    expect(editing.getDragState()).toMatchObject({
      startTick: 0,
      endTick: 721,
      operation: "resize-start",
    });
    expect(editing.finishPhraseDrag()).toBe(true);
  });

  it("keeps phrase selection stable by ID and deletes selected phrases once", () => {
    const { setup, editing } = createController();
    const first = addPhrase(setup, "stagePower", 0, 240);
    const second = addPhrase(setup, "solo", 480, 960);
    editing.selectPhrases([first.id], false);
    editing.selectPhrases([second.id], true);

    expect(editing.getSelectedPhraseIds()).toEqual([first.id, second.id]);
    const beforeDeleteDepth = setup.editing.history.undoDepth;

    expect(editing.deleteSelectedPhrase()).toBe(true);
    expect(setup.chart.getNotes()).toHaveLength(0);
    expect(editing.getSelectedPhraseIds()).toEqual([]);
    expect(setup.editing.history.undoDepth).toBe(beforeDeleteDepth + 1);
  });
});
