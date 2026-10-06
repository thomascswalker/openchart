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

  it("advances its revision only when selected notes change", () => {
    const selection = new SelectionContext();
    const note = {} as MidiChannelEvent;

    expect(selection.getRevision()).toBe(0);
    selection.add(note);
    expect(selection.getRevision()).toBe(1);
    selection.add(note);
    expect(selection.getRevision()).toBe(1);
    selection.set([note]);
    expect(selection.getRevision()).toBe(1);
    selection.clear();
    expect(selection.getRevision()).toBe(2);
  });
});
