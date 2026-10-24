import { formatNoteId, type ChartView, type EntityId } from "@openchart/views";
import { describe, expect, it } from "vitest";
import { HighwayNoteIndex, type IndexedNote } from "../noteIndex";
import { createHighwayTestSetup } from "./testUtils";

function addNote(
  setup: ReturnType<typeof createHighwayTestSetup>,
  pitch: number,
  start: number,
  duration: number,
): void {
  setup.midiTrack.addNoteAt({
    pitch,
    tick: start,
    velocity: 90,
    duration: Math.max(1, duration),
  });
}

describe("HighwayNoteIndex", () => {
  it("matches interval queries for long and zero-length projected notes", () => {
    const setup = createHighwayTestSetup();
    const offset = setup.chart.getOffset();
    let randomState = 42;
    const random = () => {
      randomState = (randomState * 1_103_515_245 + 12_345) & 0x7fffffff;
      return randomState / 0x80000000;
    };
    for (let index = 0; index < 500; index += 1) {
      const start = Math.floor(random() * 20_000);
      const duration = Math.floor(random() * 4_000);
      const lane = Math.floor(random() * 7) - 1;
      addNote(setup, offset + lane, start, duration);
    }
    addNote(setup, offset, 0, 19_000);
    addNote(setup, offset + 4, 10_000, 0);
    const actualNotes = setup.chart.getNotes().map((note, index) => ({
      ...note,
      end:
        index === 501
          ? note.start + 19_000
          : index === 502
            ? note.start
            : note.end,
    }));
    const chart = {
      getNoteRevision: () => 1,
      getNotes: () => actualNotes,
      getTrack: () => setup.chart.getTrack(),
    } as unknown as ChartView;
    const index = new HighwayNoteIndex();

    for (let queryNumber = 0; queryNumber < 100; queryNumber += 1) {
      const start = Math.floor(random() * 20_000);
      const end = start + Math.floor(random() * 2_000);
      const expected = actualNotes
        .filter(
          (note) =>
            note.note >= offset &&
            note.note < offset + setup.chart.getLaneCount() &&
            note.end >= start &&
            note.start <= end,
        )
        .sort(
          (left, right) => left.start - right.start || left.note - right.note,
        );
      const actual: IndexedNote[] = [];
      index.query(chart, setup.session, null, start, end, actual);
      expect(actual.map(({ source }) => source)).toEqual(expected);
    }
  });

  it("classifies drum kinds through the bound mode and rebuilds after revision", () => {
    const setup = createHighwayTestSetup("drums");
    for (const [pitch, start, duration] of [
      [95, 0, 1],
      [96, 100, 100],
      [101, 300, 100],
      [104, 500, 100],
    ]) {
      addNote(setup, pitch!, start!, duration!);
    }
    const index = new HighwayNoteIndex();
    const actual: IndexedNote[] = [];
    const chart = {
      getNoteRevision: () => 1,
      getNotes: () => setup.chart.getNotes(),
      getTrack: () => setup.chart.getTrack(),
    } as unknown as ChartView;

    index.query(chart, setup.session, null, 0, 1_000, actual);
    expect(actual.map(({ kind, lane }) => [kind, lane])).toEqual([
      ["kick", 0],
      ["kick", 0],
      ["cymbal", 1],
    ]);

    addNote(setup, 97, 700, 100);
    const revisedChart = {
      getNoteRevision: () => 2,
      getNotes: () => setup.chart.getNotes(),
      getTrack: () => setup.chart.getTrack(),
    } as unknown as ChartView;
    index.query(revisedChart, setup.session, null, 0, 1_000, actual);
    expect(actual.map(({ kind }) => kind)).toEqual([
      "kick",
      "kick",
      "cymbal",
      "pad",
    ]);
  });

  it("overlays moved, added, and removed entities without rebuilding the base", () => {
    const setup = createHighwayTestSetup();
    const offset = setup.chart.getOffset();
    addNote(setup, offset, 100, 120);
    const [source] = setup.chart.getNotes();
    const track = setup.midiTrack;
    const entityId = formatNoteId(
      setup.session.target.trackIndex!,
      track.getEventId(source!.noteOn),
    );
    const preview = {
      updated: new Map([
        [
          entityId,
          {
            id: entityId,
            trackIndex: 0,
            tick: 400,
            pitch: offset + 2,
            duration: 120,
            velocity: 90,
          },
        ],
      ]),
      added: [],
      removed: new Set<EntityId>(),
      rejections: [],
    };
    const index = new HighwayNoteIndex();
    const actual: IndexedNote[] = [];

    index.query(setup.chart, setup.session, preview, 0, 1_000, actual);

    expect(actual).toHaveLength(1);
    expect(actual[0]).toMatchObject({
      id: entityId,
      start: 400,
      pitch: offset + 2,
    });
    expect(actual[0]?.source).toBe(source);
  });
});
