import type { MidiNote } from "@openchart/midi";
import type {
  ChartView,
  EditingSession,
  EntityId,
  EditablePhraseKind,
  NoteSnapshot,
  PreviewState,
} from "@openchart/views";
import { formatNoteId } from "@openchart/views";

export type IndexedNoteKind = "note" | "kick" | "cymbal" | "pad" | "phrase";

export interface IndexedNote {
  id: EntityId;
  source: MidiNote | null;
  pitch: number;
  start: number;
  end: number;
  velocity: number;
  lane: number;
  kind: IndexedNoteKind;
  phraseKind: EditablePhraseKind | null;
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
      );
      if (entry && intersects(entry, visibleStart, visibleEnd)) {
        overlay.push(entry);
      }
    }
    for (const snapshot of preview.added) {
      const entry = this.project(snapshot, null, session, projection);
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
        const snapshot: NoteSnapshot = {
          id,
          trackIndex,
          tick: note.start,
          pitch: note.pitch,
          duration: note.end - note.start,
          velocity: note.velocity,
        };
        const entry = this.project(snapshot, note, session, projection);
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
    snapshot: NoteSnapshot,
    source: MidiNote | null,
    session: EditingSession,
    projection: ReturnType<EditingSession["getProjection"]>,
  ): IndexedNote | null {
    const classification = session.classifyNote(snapshot);
    let kind: IndexedNoteKind;
    let phraseKind: EditableNotePhraseKind | null = null;
    let lane = 0;
    if (classification.kind === "phrase") {
      kind = "phrase";
      phraseKind =
        classification.subtype === "stagepower" ||
        classification.subtype === "solo"
          ? classification.subtype
          : null;
    } else {
      if (!classification.movable || classification.subtype === "unmapped") {
        return null;
      }
      const row = projection.rowForNote(snapshot);
      if (!row) return null;
      lane = row.index;
      if (session.mode.id === "chart.drums") {
        if (
          classification.subtype !== "kick" &&
          classification.subtype !== "cymbal" &&
          classification.subtype !== "pad"
        ) {
          return null;
        }
        kind = classification.subtype;
        if (kind === "kick") lane = 0;
      } else {
        kind = "note";
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
    };
  }
}

type EditableNotePhraseKind = Extract<
  EditablePhraseKind,
  "stagepower" | "solo"
>;

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
