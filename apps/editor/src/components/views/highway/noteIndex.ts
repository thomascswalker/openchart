import type { MidiNote } from "@midiedit/core";
import type { ChartView } from "@midiedit/views";
import { drumLaneCount, getDrumNoteProfile } from "./drumProfile";

export type IndexedNoteKind = "note" | "kick" | "cymbal" | "pad";

export interface IndexedNote {
  note: MidiNote;
  start: number;
  end: number;
  lane: number;
  kind: IndexedNoteKind;
}

export class HighwayNoteIndex {
  private chart: ChartView | null = null;
  private revision = -1;
  private entries: IndexedNote[] = [];
  private prefixMaxEnd = new Float64Array(0);

  public query(
    chart: ChartView,
    visibleStart: number,
    visibleEnd: number,
    out: IndexedNote[] = [],
  ): number {
    this.ensure(chart);
    out.length = 0;

    let low = 0;
    let high = this.prefixMaxEnd.length;
    while (low < high) {
      const middle = low + ((high - low) >> 1);
      if (this.prefixMaxEnd[middle] >= visibleStart) high = middle;
      else low = middle + 1;
    }

    for (
      let index = low;
      index < this.entries.length && this.entries[index].start <= visibleEnd;
      index += 1
    ) {
      const entry = this.entries[index];
      if (entry.end >= visibleStart) out.push(entry);
    }
    return out.length;
  }

  private ensure(chart: ChartView): void {
    const revision = chart.getNoteRevision();
    if (this.chart === chart && this.revision === revision) return;

    const isDrumChart = chart.getTrack().getKey() === "drums";
    const laneLimit = isDrumChart ? drumLaneCount : chart.getLaneCount();
    const entries: IndexedNote[] = [];
    for (const note of chart.getNotes()) {
      let lane: number;
      let kind: IndexedNoteKind = "note";
      if (isDrumChart) {
        const profile = getDrumNoteProfile(note.note, chart.getOffset());
        if (profile?.kind === "kick") {
          lane = 0;
          kind = "kick";
        } else if (
          !profile ||
          profile.kind === "marker" ||
          profile.lane === null
        ) {
          continue;
        } else {
          lane = profile.lane;
          kind = profile.kind;
        }
      } else {
        lane = note.note - chart.getOffset();
      }
      if (lane < 0 || lane >= laneLimit) continue;
      entries.push({ note, start: note.start, end: note.end, lane, kind });
    }

    entries.sort(
      (left, right) =>
        left.start - right.start || left.note.note - right.note.note,
    );
    const prefixMaxEnd = new Float64Array(entries.length);
    let maximumEnd = -Infinity;
    entries.forEach((entry, index) => {
      maximumEnd = Math.max(maximumEnd, entry.end);
      prefixMaxEnd[index] = maximumEnd;
    });

    this.chart = chart;
    this.revision = revision;
    this.entries = entries;
    this.prefixMaxEnd = prefixMaxEnd;
  }
}

const indexes = new WeakMap<ChartView, HighwayNoteIndex>();

export function getHighwayNoteIndex(chart: ChartView): HighwayNoteIndex {
  let index = indexes.get(chart);
  if (!index) {
    index = new HighwayNoteIndex();
    indexes.set(chart, index);
  }
  return index;
}
