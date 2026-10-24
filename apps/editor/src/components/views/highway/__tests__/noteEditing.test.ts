import type { MidiNote } from "@openchart/midi";
import {
  defaultConfig,
  Difficulty,
  formatNoteId,
  type EntityId,
  type SongViewConfig,
} from "@openchart/views";
import { describe, expect, it } from "vitest";
import { HighwayNoteEditingController } from "../editing/noteEditing";
import { createHighwayTestSetup } from "./testUtils";

type NotePlacement = "force-hopo" | "force-strum" | "tap";

function addNote(
  setup: ReturnType<typeof createHighwayTestSetup>,
  pitch: number,
  tick: number,
  duration: number,
  velocity = 90,
): MidiNote {
  return setup.midiTrack.addNoteAt({
    pitch,
    tick,
    duration,
    velocity,
  });
}

function getNoteId(
  setup: ReturnType<typeof createHighwayTestSetup>,
  note: MidiNote,
): EntityId {
  return formatNoteId(
    setup.session.target.trackIndex!,
    setup.midiTrack.getEventId(note.noteOn),
  );
}

function createMarkerConfig(): SongViewConfig {
  return {
    ...defaultConfig,
    tracks: defaultConfig.tracks.map((track) => {
      if (track.key !== "lead-guitar" || track.type !== "instrument") {
        return track;
      }
      return {
        ...track,
        notes: {
          ...track.notes,
          expertHopo: 101,
          expertStrum: 102,
          expertTap: 103,
        },
      };
    }),
  };
}

describe("HighwayNoteEditingController", () => {
  it("copies relative pitches and ticks, preserves note data, and selects pasted IDs", () => {
    const setup = createHighwayTestSetup();
    const offset = setup.chart.getOffset();
    const source = [
      addNote(setup, offset + 2, 480, 240, 80),
      addNote(setup, offset + 4, 960, 240, 100),
    ];
    setup.session.selection.setSelectedIds(
      source.map((note) => getNoteId(setup, note)),
    );
    const editing = new HighwayNoteEditingController(setup.context);

    editing.copySelection();
    expect(editing.pasteClipboard(1000)).toBe(true);

    const pasted = setup.chart
      .getNotes()
      .filter(
        (note) =>
          !source.some((sourceNote) => note.noteOn === sourceNote.noteOn),
      );
    expect(
      pasted.map(({ note, start, end, velocity }) => ({
        pitch: note,
        start,
        end,
        velocity,
      })),
    ).toEqual([
      { pitch: offset + 2, start: 1000, end: 1240, velocity: 80 },
      { pitch: offset + 4, start: 1480, end: 1720, velocity: 100 },
    ]);
    expect(setup.session.selection.getSelectedIds()).toEqual(
      pasted.map((note) => getNoteId(setup, note)),
    );
  });

  it("can remove a note without changing selection when requested", () => {
    const setup = createHighwayTestSetup();
    const note = addNote(setup, setup.chart.getOffset() + 2, 0, 120);
    const id = getNoteId(setup, note);
    setup.session.selection.add(id);
    const editing = new HighwayNoteEditingController(setup.context);

    expect(editing.deleteNote(setup.chart, note, false)).toBe(true);
    expect(setup.midiTrack.getNotes()).toHaveLength(0);
    expect(setup.session.selection.isSelected(id)).toBe(true);
  });

  it("places only the selected drum kind on a compatible physical lane", () => {
    const setup = createHighwayTestSetup("drums");
    setup.setDrumPlacementKind("cymbal");
    const editing = new HighwayNoteEditingController(setup.context);

    expect(editing.placeNoteAt(setup.chart, 1, 480, false)).toBe(true);
    expect(editing.placeNoteAt(setup.chart, 0, 960, false)).toBe(false);
    expect(
      setup.chart.getNotes().map(({ note, start }) => [note, start]),
    ).toEqual([[101, 480]]);
  });

  it("allows a kick to be placed from any of the four drum lanes", () => {
    const setup = createHighwayTestSetup("drums");
    setup.setDrumPlacementKind("kick");
    const editing = new HighwayNoteEditingController(setup.context);

    expect(editing.placeNoteAt(setup.chart, 3, 480, false)).toBe(true);
    expect(
      setup.chart.getNotes().map(({ note, start }) => [note, start]),
    ).toEqual([[96, 480]]);
  });

  it.each([
    ["force-hopo", 101],
    ["force-strum", 102],
    ["tap", 103],
  ] as const)(
    "adds the configured %s marker when placing a Lead/Groove note",
    (placementType: NotePlacement, markerPitch: number) => {
      const setup = createHighwayTestSetup(
        "lead-guitar",
        createMarkerConfig(),
        Difficulty.Expert,
      );
      setup.setNotePlacementType(placementType);
      const editing = new HighwayNoteEditingController(setup.context);

      expect(editing.placeNoteAt(setup.chart, 0, 480, false)).toBe(true);
      expect(
        setup.midiTrack
          .getNotes({ pitch: { low: markerPitch, high: markerPitch + 1 } })
          .map(({ note, start }) => [note, start]),
      ).toEqual([[markerPitch, 480]]);
    },
  );

  it("previews mode-aware moves, preserves Kick2, and rejects marker movement", () => {
    const setup = createHighwayTestSetup("drums");
    const cymbal = addNote(setup, 101, 480, 120);
    const kick2 = addNote(setup, 95, 960, 120);
    const marker = addNote(setup, 104, 1200, 120);
    const editing = new HighwayNoteEditingController(setup.context);
    const cymbalId = getNoteId(setup, cymbal);
    const kick2Id = getNoteId(setup, kick2);

    expect(editing.moveNote(setup.chart, cymbal, 2, 720)).toBe(true);
    expect(
      setup.context.getPreviewState()?.updated.get(cymbalId),
    ).toMatchObject({
      tick: 720,
      pitch: 102,
    });
    expect([cymbal.note, cymbal.start]).toEqual([101, 480]);
    expect(editing.commitGesture()).toBe(true);
    const movedCymbal = setup.chart
      .getNotes()
      .find((note) => getNoteId(setup, note) === cymbalId)!;
    expect([movedCymbal.note, movedCymbal.start]).toEqual([102, 720]);

    const currentKick2 = setup.chart
      .getNotes()
      .find((note) => getNoteId(setup, note) === kick2Id)!;
    expect(editing.moveNote(setup.chart, currentKick2, 3, 1200)).toBe(true);
    expect(editing.commitGesture()).toBe(true);
    const movedKick2 = setup.chart
      .getNotes()
      .find((note) => getNoteId(setup, note) === kick2Id)!;
    expect([movedKick2.note, movedKick2.start]).toEqual([95, 1200]);

    const currentMarker = setup.midiTrack
      .getNotes()
      .find((note) => note.note === marker.note)!;
    expect(editing.moveNote(setup.chart, currentMarker, 0, 1440)).toBe(false);
    expect(editing.commitGesture()).toBe(false);
  });

  it("copies and pastes drum kinds without canonicalizing Kick2", () => {
    const setup = createHighwayTestSetup("drums");
    const kick2 = addNote(setup, 95, 120, 1);
    const cymbal = addNote(setup, 101, 240, 1);
    setup.session.selection.setSelectedIds([
      getNoteId(setup, kick2),
      getNoteId(setup, cymbal),
    ]);
    const editing = new HighwayNoteEditingController(setup.context);

    editing.copySelection();
    expect(editing.pasteClipboard(600)).toBe(true);

    expect(
      setup.chart
        .getNotes()
        .filter(
          (note) =>
            note.noteOn !== kick2.noteOn && note.noteOn !== cymbal.noteOn,
        )
        .map(({ note, start }) => [note, start]),
    ).toEqual([
      [95, 600],
      [101, 720],
    ]);
  });

  it("skips pasted notes that land on existing notes", () => {
    const setup = createHighwayTestSetup("drums");
    const kick2 = addNote(setup, 95, 120, 1);
    const cymbal = addNote(setup, 101, 240, 1);
    setup.session.selection.setSelectedIds([
      getNoteId(setup, kick2),
      getNoteId(setup, cymbal),
    ]);
    const editing = new HighwayNoteEditingController(setup.context);

    editing.copySelection();
    expect(editing.pasteClipboard(120)).toBe(false);
    expect(setup.chart.getNotes()).toHaveLength(2);
  });
});
