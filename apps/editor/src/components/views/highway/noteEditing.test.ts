import type { MidiChannelEvent, MidiNote } from "@openchart/midi";
import { Difficulty, type ChartView, type Note } from "@openchart/views";
import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import type { ChartViewState } from "../AbstractChartView";
import { HighwayCoordinateSystem } from "./coordinates";
import type { HighwayContext } from "./context";
import { HighwayNoteEditingController } from "./noteEditing";
import { SelectionContext } from "./selection";
import type { HighwayNotePlacementType } from "./types";

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
      getLaneCount: () => 5,
      addNote: (lane: Note, start: number, end: number, velocity: number) => {
        added.push(makeNote(offset + Number(lane), start, end, velocity));
      },
    } as unknown as ChartView;
    const selection = new SelectionContext();
    notes.forEach((note) => selection.add(note.noteOn));
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

  it("places only the selected drum kind on a compatible physical lane", () => {
    const addNote = vi.fn();
    const chart = {
      getTrack: () => ({ getKey: () => "drums" }),
      getOffset: () => 96,
      addNote,
    } as unknown as ChartView;
    const context = {
      getDrumPlacementKind: () => "cymbal",
    } as unknown as HighwayContext;
    const editing = new HighwayNoteEditingController(
      context,
      {} as HighwayCoordinateSystem,
    );

    expect(editing.placeNoteAt(chart, 1, 480, false)).toBe(true);
    expect(editing.placeNoteAt(chart, 0, 960, false)).toBe(false);
    expect(addNote).toHaveBeenCalledOnce();
    expect(addNote).toHaveBeenCalledWith(5, 480, 481);
  });

  it("allows a kick to be placed from any of the four drum lanes", () => {
    const addNote = vi.fn();
    const chart = {
      getTrack: () => ({ getKey: () => "drums" }),
      getOffset: () => 96,
      addNote,
    } as unknown as ChartView;
    const context = {
      getDrumPlacementKind: () => "kick",
    } as unknown as HighwayContext;
    const editing = new HighwayNoteEditingController(
      context,
      {} as HighwayCoordinateSystem,
    );

    expect(editing.placeNoteAt(chart, 3, 480, false)).toBe(true);
    expect(addNote).toHaveBeenCalledWith(0, 480, 481);
  });

  it.each([
    ["force-hopo", 101],
    ["force-strum", 102],
    ["tap", 103],
  ] as const)(
    "adds the configured %s marker when placing a Lead/Groove note",
    (placementType: HighwayNotePlacementType, markerPitch) => {
      const markers: Array<{ note: number; start: number }> = [];
      const midiTrack = {
        getNotes: (options?: { pitch: { low: number; high: number } }) =>
          options
            ? markers.filter(
                (note) =>
                  note.note >= options.pitch.low &&
                  note.note < options.pitch.high,
              )
            : markers,
        getInsertionIndexAt: () => markers.length,
        getAbsoluteTickAt: () => 0,
        addNote: (note: number, start: number) => {
          markers.push({ note, start });
        },
        removeNote: vi.fn(),
      };
      const chart = {
        getTrack: () => ({
          getKey: () => "lead-guitar",
          getMidiTrack: () => midiTrack,
        }),
        getSong: () => ({
          getTrackDescriptors: () => [
            {
              key: "lead-guitar",
              config: {
                type: "instrument",
                offsets: { expert: 96 },
                notes: {
                  expertHopo: 101,
                  expertStrum: 102,
                  expertTap: 103,
                },
              },
            },
          ],
        }),
        getOffset: () => 96,
        getNotes: () => [],
        addNote: vi.fn(() => true),
      } as unknown as ChartView;
      const context = {
        getNotePlacementType: () => placementType,
      } as unknown as HighwayContext;
      const editing = new HighwayNoteEditingController(
        context,
        {} as HighwayCoordinateSystem,
      );

      expect(editing.placeNoteAt(chart, 0, 480, false)).toBe(true);
      expect(markers).toContainEqual({ note: markerPitch, start: 480 });
    },
  );

  it("moves cymbals as cymbals and keeps Expert Kick2 at pitch 95", () => {
    const cymbal = makeNote(101, 480, 481);
    const kick2 = makeNote(95, 960, 961);
    const setNotePitch = vi.fn((note: MidiNote, pitch: number) => {
      note.note = pitch;
      return true;
    });
    const setNoteStart = vi.fn(() => true);
    const track = { setNotePitch, setNoteStart };
    const chart = {
      getTrack: () => ({ getKey: () => "drums", getMidiTrack: () => track }),
      getSong: () => ({ attachTrack: vi.fn() }),
      getOffset: () => 96,
    } as unknown as ChartView;
    const editing = new HighwayNoteEditingController(
      {} as HighwayContext,
      {} as HighwayCoordinateSystem,
    );

    expect(editing.moveNote(chart, cymbal, 2, 720)).toBe(true);
    expect(setNotePitch).toHaveBeenNthCalledWith(1, cymbal, 102);
    expect(editing.moveNote(chart, kick2, 3, 1200)).toBe(true);
    expect(setNotePitch).toHaveBeenNthCalledWith(2, kick2, 95);
    expect(editing.moveNote(chart, cymbal, 0, 960)).toBe(false);
  });

  it("copies and pastes drum kinds without canonicalizing Kick2", () => {
    const sourceNotes = [makeNote(95, 120, 121), makeNote(101, 240, 241)];
    const added: MidiNote[] = [];
    const chart = {
      getTrack: () => ({ getKey: () => "drums" }),
      getOffset: () => 96,
      getNotes: () => [...sourceNotes, ...added],
      addNoteAtPitch: (pitch: number, start: number, end: number) => {
        added.push(makeNote(pitch, start, end));
        return true;
      },
    } as unknown as ChartView;
    const selection = new SelectionContext();
    sourceNotes.forEach((note) => selection.add(note.noteOn));
    const context = {
      getCurrentChart: () => chart,
      getSelectionContext: () => selection,
      getState: () => ({ isPlaying: false }),
      notifyNotesChanged: vi.fn(),
      requestRender: vi.fn(),
    } as unknown as HighwayContext;
    const coordinates = { snapTick: (tick: number) => tick };
    const editing = new HighwayNoteEditingController(
      context,
      coordinates as HighwayCoordinateSystem,
    );

    editing.copySelection();
    editing.pasteClipboard(600, 0);

    expect(added.map((note) => [note.note, note.start])).toEqual([
      [95, 600],
      [101, 720],
    ]);
  });
});
