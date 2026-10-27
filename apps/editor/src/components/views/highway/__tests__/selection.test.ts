import { formatNoteId } from "@openchart/views";
import { describe, expect, it } from "vitest";
import { createHighwayTestSetup } from "./testUtils";

describe("Highway session selection", () => {
  it("keeps entity selection stable across undo and redo", () => {
    const setup = createHighwayTestSetup();
    const note = setup.midiTrack.addNoteAt({
      pitch: setup.chart.getOffset(),
      tick: 480,
      duration: 120,
    });
    const id = formatNoteId(
      setup.session.target.trackIndex!,
      setup.midiTrack.getEventId(note.noteOn),
    );
    setup.session.selection.setSelectedIds([id]);

    expect(
      setup.session.execute({
        type: "MOVE_CHART_NOTES",
        targetIds: [id],
        tickDelta: 240,
        laneDelta: 1,
      }).changed,
    ).toBe(true);
    expect(setup.session.selection.getSelectedIds()).toEqual([id]);

    expect(setup.editing.history.undo()).toBe(true);
    expect(setup.session.selection.getSelectedIds()).toEqual([id]);
    expect(setup.editing.history.redo()).toBe(true);
    expect(setup.session.selection.getSelectedIds()).toEqual([id]);
  });
});
