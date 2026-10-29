import type { TrackDescriptor } from "../ruleset/compile.js";
import type { EntityId } from "./entity.js";

/** Read-only snapshot of a MIDI note exposed to modes and projections. */
export interface NoteSnapshot {
  id: EntityId;
  trackIndex: number;
  tick: number;
  pitch: number;
  duration: number;
  velocity: number;
}

/** Read-only document surface available to pure editing modes. */
export interface ChartDocumentReader {
  getPpqn(): number;
  getTrackDescriptor(trackIndex: number): TrackDescriptor | null;
  findTrackIndex(trackKey: string): number | null;
  getNote(id: EntityId): NoteSnapshot | null;
  getNotes(
    trackIndex: number,
    pitchRange?: { low: number; high: number },
  ): readonly NoteSnapshot[];
  getLyricAt(
    trackIndex: number,
    tick: number,
  ): { id: EntityId; text: string } | null;
  getTextEvents(
    trackIndex: number,
  ): readonly { id: EntityId; tick: number; text: string; metaType: number }[];
}
