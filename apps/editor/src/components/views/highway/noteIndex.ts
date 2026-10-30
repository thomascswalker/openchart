import type { MidiNote } from "@openchart/midi";
import type {
  ChartView,
  EditingSession,
  EntityId,
  NoteHandle,
  PreviewState,
} from "@openchart/views";
import { formatNoteId } from "@openchart/views";

/**
 * Visual kind of an indexed entry, derived from the lane's shape and pad type:
 * `gem` -> `note`, `pad` (tom) -> `pad`, `pad` (cymbal) -> `cymbal`,
 * `kickBar`/`openBar` -> `bar`.
 */
export type IndexedNoteKind = "note" | "bar" | "cymbal" | "pad" | "phrase";

export interface IndexedNote {
  id: EntityId;
  source: MidiNote | null;
  pitch: number;
  start: number;
  end: number;
  velocity: number;
  lane: number;
  kind: IndexedNoteKind;
  /** Phrase id (from the ruleset) for phrase entries, else null. */
  phraseKind: string | null;
  /** Ruleset lane id for lane notes, else null. */
  laneId: string | null;
}

export class HighwayNoteIndex {
  private chart: ChartView | null = null;
  private session: EditingSession | null = null;
  private revision = -1;
  private entries: IndexedNote[] = [];
  private entriesById = new Map<EntityId, IndexedNote>();
  private prefixMaxEnd = new Float64Array(0);

  public query(
    chart: ChartView,
    session: EditingSession,
    preview: PreviewState | null,
    visibleStart: number,
    visibleEnd: number,
    out: IndexedNote[] = [],
  ): number {
    this.ensure(chart, session);
    out.length = 0;

    let low = 0;
    let high = this.prefixMaxEnd.length;
    while (low < high) {
      const middle = low + ((high - low) >> 1);
      if (this.prefixMaxEnd[middle] >= visibleStart) high = middle;
      else low = middle + 1;
    }

    const updatedIds = preview
      ? new Set(preview.updated.keys())
      : new Set<EntityId>();
    for (
      let index = low;
      index < this.entries.length && this.entries[index]!.start <= visibleEnd;
      index += 1
    ) {
      const entry = this.entries[index]!;
      if (
        entry.end >= visibleStart &&
        !preview?.removed.has(entry.id) &&
        !updatedIds.has(entry.id)
      ) {
        out.push(entry);
      }
    }

    if (!preview) return out.length;
    const overlay: IndexedNote[] = [];
    const projection = session.getProjection();
    for (const snapshot of preview.updated.values()) {
      const entry = this.project(
        snapshot,
        this.entriesById.get(snapshot.id)?.source ?? null,
        session,
        projection,
        chart,
      );
      if (entry && intersects(entry, visibleStart, visibleEnd)) {
        overlay.push(entry);
      }
    }
    for (const snapshot of preview.added) {
      const entry = this.project(snapshot, null, session, projection, chart);
      if (entry && intersects(entry, visibleStart, visibleEnd)) {
        overlay.push(entry);
      }
    }
    if (overlay.length === 0) return out.length;

    overlay.sort(compareEntries);
    const merged: IndexedNote[] = [];
    let baseIndex = 0;
    let overlayIndex = 0;
    while (baseIndex < out.length && overlayIndex < overlay.length) {
      if (compareEntries(out[baseIndex]!, overlay[overlayIndex]!) <= 0) {
        merged.push(out[baseIndex++]!);
      } else {
        merged.push(overlay[overlayIndex++]!);
      }
    }
    merged.push(...out.slice(baseIndex), ...overlay.slice(overlayIndex));
    out.length = 0;
    for (const entry of merged) out.push(entry);
    return out.length;
  }

  private ensure(chart: ChartView, session: EditingSession): void {
    const revision = chart.getNoteRevision();
    if (
      this.chart === chart &&
      this.session === session &&
      this.revision === revision
    ) {
      return;
    }

    const trackIndex = session.target.trackIndex;
    const track = chart.getMidiTrack();
    const projection = session.getProjection();
    const entries: IndexedNote[] = [];
    if (trackIndex !== null && track) {
      for (const note of track.getNotes()) {
        const id = formatNoteId(trackIndex, track.getEventId(note.noteOn));
        const snapshot: NoteHandle = {
          id,
          trackIndex,
          tick: note.start,
          pitch: note.pitch,
          duration: note.end - note.start,
          velocity: note.velocity,
        };
        const entry = this.project(snapshot, note, session, projection, chart);
        if (entry) entries.push(entry);
      }
    }

    entries.sort(compareEntries);
    const prefixMaxEnd = new Float64Array(entries.length);
    let maximumEnd = -Infinity;
    for (let index = 0; index < entries.length; index += 1) {
      maximumEnd = Math.max(maximumEnd, entries[index]!.end);
      prefixMaxEnd[index] = maximumEnd;
    }

    this.chart = chart;
    this.session = session;
    this.revision = revision;
    this.entries = entries;
    this.entriesById = new Map(entries.map((entry) => [entry.id, entry]));
    this.prefixMaxEnd = prefixMaxEnd;
  }

  private project(
    snapshot: NoteHandle,
    source: MidiNote | null,
    session: EditingSession,
    projection: ReturnType<EditingSession["getProjection"]>,
    chart: ChartView,
  ): IndexedNote | null {
    const classification = session.classifyNote(snapshot);
    let kind: IndexedNoteKind;
    let phraseKind: string | null = null;
    let laneId: string | null = null;
    let lane = 0;
    if (classification.type === "phrase") {
      kind = "phrase";
      phraseKind = classification.subtype;
    } else {
      if (!classification.movable || classification.subtype === "unmapped") {
        return null;
      }
      const row = projection.rowForNote(snapshot);
      if (!row) return null;
      const role = chart.classify(snapshot.pitch);
      if (role.kind !== "laneNote" || !role.available) return null;
      const laneDef = chart.getLanes().find((l) => l.id === role.laneId);
      if (!laneDef) return null;
      laneId = laneDef.id;
      if (laneDef.isBar) {
        kind = "bar";
        lane = 0;
      } else {
        lane = row.index;
        kind =
          laneDef.shape === "pad"
            ? role.padType === "cymbal"
              ? "cymbal"
              : "pad"
            : "note";
      }
    }
    return {
      id: snapshot.id,
      source,
      pitch: snapshot.pitch,
      start: snapshot.tick,
      end: snapshot.tick + snapshot.duration,
      velocity: snapshot.velocity,
      lane,
      kind,
      phraseKind,
      laneId,
    };
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

function intersects(
  entry: IndexedNote,
  visibleStart: number,
  visibleEnd: number,
): boolean {
  return entry.start <= visibleEnd && entry.end >= visibleStart;
}

function compareEntries(left: IndexedNote, right: IndexedNote): number {
  return left.start - right.start || left.pitch - right.pitch;
}

/**
 * Visual kind and lane of a pitch on a chart, from the ruleset: bar lanes sit
 * on lane 0; pad lanes split into `pad`/`cymbal` by pad type; gems are `note`.
 * Returns null for pitches that are not lane notes of the chart's difficulty.
 */
export function laneVisualFor(
  chart: ChartView,
  pitch: number,
): {
  kind: Exclude<IndexedNoteKind, "phrase">;
  lane: number;
  laneId: string;
} | null {
  const role = chart.classify(pitch);
  if (role.kind !== "laneNote" || !role.available) return null;
  const laneDef = chart.getLanes().find((l) => l.id === role.laneId);
  if (!laneDef) return null;
  if (laneDef.isBar) return { kind: "bar", lane: 0, laneId: laneDef.id };
  const kind =
    laneDef.shape === "pad"
      ? role.padType === "cymbal"
        ? "cymbal"
        : "pad"
      : "note";
  return { kind, lane: laneDef.column, laneId: laneDef.id };
}
