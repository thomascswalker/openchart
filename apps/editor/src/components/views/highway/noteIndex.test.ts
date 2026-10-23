import type { MidiNote } from "@openchart/midi";
import type { ChartView } from "@openchart/views";
import { describe, expect, it } from "vitest";
import { HighwayNoteIndex, type IndexedNote } from "./noteIndex";

function makeNote(note: number, start: number, end: number): MidiNote {
  return { note, start, end } as MidiNote;
}

function makeChart(
  notes: MidiNote[],
  options: { key?: string; revision?: number; lanes?: number } = {},
): ChartView {
  return {
    getNoteRevision: () => options.revision ?? 1,
    getNotes: () => notes,
    getTrack: () => ({ getKey: () => options.key ?? "lead" }),
    getOffset: () => 96,
    getLaneCount: () => options.lanes ?? 5,
  } as unknown as ChartView;
}

describe("HighwayNoteIndex", () => {
  it("matches brute-force interval queries for long and zero-length notes", () => {
    let randomState = 42;
    const random = () => {
      randomState = (randomState * 1_103_515_245 + 12_345) & 0x7fffffff;
      return randomState / 0x80000000;
    };
    const notes = Array.from({ length: 500 }, () => {
      const start = Math.floor(random() * 20_000);
      const duration = Math.floor(random() * 4_000);
      return makeNote(
        96 + Math.floor(random() * 7) - 1,
        start,
        start + duration,
      );
    });
    notes.push(makeNote(96, 0, 19_000), makeNote(100, 10_000, 10_000));
    const chart = makeChart(notes);
    const index = new HighwayNoteIndex();

    for (let queryNumber = 0; queryNumber < 100; queryNumber += 1) {
      const start = Math.floor(random() * 20_000);
      const end = start + Math.floor(random() * 2_000);
      const expected = notes
        .filter(
          (note) =>
            note.note >= 96 &&
            note.note < 101 &&
            note.end >= start &&
            note.start <= end,
        )
        .sort(
          (left, right) => left.start - right.start || left.note - right.note,
        );
      const actual: IndexedNote[] = [];
      index.query(chart, start, end, actual);
      expect(actual.map(({ note }) => note)).toEqual(expected);
    }
  });

  it("resolves drum kinds once and rebuilds after a revision change", () => {
    const notes = [
      makeNote(95, 0, 0),
      makeNote(96, 100, 200),
      makeNote(101, 300, 400),
      makeNote(104, 500, 600),
    ];
    const index = new HighwayNoteIndex();
    const chart = makeChart(notes, { key: "drums", lanes: 9 });
    const actual: IndexedNote[] = [];

    index.query(chart, 0, 1_000, actual);
    expect(actual.map(({ kind, lane }) => [kind, lane])).toEqual([
      ["kick", 0],
      ["kick", 0],
      ["cymbal", 1],
    ]);

    notes.push(makeNote(97, 700, 800));
    const revisedChart = makeChart(notes, {
      key: "drums",
      lanes: 9,
      revision: 2,
    });
    index.query(revisedChart, 0, 1_000, actual);
    expect(actual.map(({ kind }) => kind)).toEqual([
      "kick",
      "kick",
      "cymbal",
      "pad",
    ]);
  });
});
