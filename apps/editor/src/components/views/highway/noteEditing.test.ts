import type { MidiChannelEvent, MidiNote } from "@midiedit/core";
import { Difficulty, type ChartView, type Note } from "@midiedit/views";
import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import type { ChartViewState } from "../AbstractChartView";
import { HighwayCoordinateSystem } from "./coordinates";
import type { HighwayContext } from "./context";
import { HighwayNoteEditingController } from "./noteEditing";
import { SelectionContext } from "./selection";

function makeNote(
  lane: number,
  start: number,
  end: number,
  velocity = 90,
): MidiNote {
  return {
    note: lane as Note,
    start,
    end,
    velocity,
    noteOn: {} as MidiChannelEvent,
    noteOff: {} as MidiChannelEvent,
  } as MidiNote;
}

describe("HighwayNoteEditingController", () => {
  it("copies relative lane/tick positions, clips paste lanes, and selects pasted notes", () => {
    const offset = 60;
    const notes = [
      makeNote(offset + 2, 480, 720, 80),
      makeNote(offset + 4, 960, 1200, 100),
    ];
    const added: MidiNote[] = [];
    const chart = {
      getNotes: () => [...notes, ...added],
      getOffset: () => offset,
      addNote: (lane: Note, start: number, end: number, velocity: number) => {
        added.push(makeNote(offset + Number(lane), start, end, velocity));
      },
    } as unknown as ChartView;
    const selection = new SelectionContext();
    notes.forEach((note) => selection.add(note.noteOn));
    const state: ChartViewState = {
      midi: null,
      selectedTrackIndex: null,
      selectedInstrument: "LEAD GUITAR",
      selectedDifficulty: Difficulty.Expert,
      snap: { enabled: true, denominator: 4 },
      isPlaying: false,
    };
    const context = {
      getState: () => state,
      getCurrentChart: () => chart,
      getSelectionContext: () => selection,
      notifyNotesChanged: vi.fn(),
      requestRender: vi.fn(),
    } as unknown as HighwayContext;
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
    const editing = new HighwayNoteEditingController(context, coordinates);

    editing.copySelection();
    editing.pasteClipboard(1000, 1);

    expect(
      added.map(({ note, start, end, velocity }) => ({
        lane: note - offset,
        start,
        end,
        velocity,
      })),
    ).toEqual([
      { lane: 1, start: 960, end: 1200, velocity: 80 },
      { lane: 3, start: 1440, end: 1680, velocity: 100 },
    ]);
    expect(selection.notes).toEqual(added.map((note) => note.noteOn));
    expect(context.notifyNotesChanged).toHaveBeenCalledOnce();
    expect(context.requestRender).toHaveBeenCalledOnce();
  });

  it("can remove a note without changing selection when requested", () => {
    const note = makeNote(2, 0, 1);
    const notes = [note];
    const chart = {
      removeNote: (target: MidiNote) => {
        const index = notes.indexOf(target);
        if (index < 0) return false;
        notes.splice(index, 1);
        return true;
      },
    } as unknown as ChartView;
    const selection = new SelectionContext();
    selection.add(note.noteOn);
    const context = {
      getSelectionContext: () => selection,
    } as unknown as HighwayContext;
    const editing = new HighwayNoteEditingController(
      context,
      {} as HighwayCoordinateSystem,
    );

    expect(editing.removeNote(chart, note, false)).toBe(true);
    expect(selection.isSelected(note.noteOn)).toBe(true);
  });
});
