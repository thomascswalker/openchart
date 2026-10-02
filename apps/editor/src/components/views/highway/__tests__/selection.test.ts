import type { MidiChannelEvent } from "@midiedit/core";
import { describe, expect, it } from "vitest";
import { SelectionContext } from "../selection";

describe("Highway SelectionContext", () => {
  it("adds, removes, and clears selected note-on events", () => {
    const selection = new SelectionContext();
    const first = {} as MidiChannelEvent;
    const second = {} as MidiChannelEvent;

    expect(selection.size).toBe(0);
    expect(selection.isSelected(first)).toBe(false);
    selection.add(first);
    selection.add(second);
    expect(selection.notes).toEqual([first, second]);
    expect(selection.isSelected(first)).toBe(true);
    selection.remove(first);
    expect(selection.isSelected(first)).toBe(false);
    selection.clear();
    expect(selection.size).toBe(0);
  });

  it("replaces selection without retaining prior notes", () => {
    const selection = new SelectionContext();
    const first = {} as MidiChannelEvent;
    const replacement = {} as MidiChannelEvent;

    selection.add(first);
    selection.set([replacement]);

    expect(selection.notes).toEqual([replacement]);
    expect(selection.isSelected(first)).toBe(false);
  });
});
