import {
  MidiTrack,
  MidiNote,
  PitchRange,
  GetNotesOptions,
} from "@openchart/midi";
import { Difficulty } from "../types.js";
import type { Instrument } from "../types.js";

export class BaseChartView {
  /* MIDI track reference */
  #midiTrack: MidiTrack | null;

  /* Instrument of the chart (e.g., "drums") */
  #instrument: Instrument | string;

  /* Difficulty level of the chart */
  #difficulty: Difficulty | null;

  /* Offset of the chart */
  #offset: number;

  /* Number of lanes in the chart */
  #laneCount: number;

  /* Cached note track */
  #cachedTrack: MidiTrack | null;

  /* Cached note revision */
  #cachedRevision;

  /* Cached notes */
  #cachedNotes: MidiNote[];

  /* Callback for when the cached notes change */
  #onCacheChange: (() => void) | null;

  constructor(
    midiTrack: MidiTrack | null = null,
    instrument: Instrument | string,
    difficulty: Difficulty | null = null,
    offset: number,
    laneCount: number,
    onCacheChange: (() => void) | null = null,
  ) {
    this.#midiTrack = midiTrack;
    this.#instrument = instrument;
    this.#difficulty = difficulty;
    this.#offset = offset;
    this.#laneCount = laneCount;
    this.#cachedTrack = null;
    this.#cachedRevision = -1;
    this.#cachedNotes = [];
    this.#onCacheChange = onCacheChange;
  }

  public get midiTrack(): MidiTrack | null {
    return this.#midiTrack;
  }

  public set midiTrack(track: MidiTrack | null) {
    this.#midiTrack = track;
    this.resetCache();
  }

  public get difficulty(): Difficulty | null {
    return this.#difficulty;
  }

  public get offset(): number {
    return this.#offset;
  }

  public get range(): PitchRange {
    const low = this.#offset;
    const high = this.#offset + this.#laneCount;
    return { low, high };
  }

  public get laneCount(): number {
    return this.#laneCount;
  }

  public get noteRevision(): number {
    return this.#midiTrack?.getNoteRevision() ?? 0;
  }

  public get notes(): MidiNote[] {
    // If the MIDI track reference or note revision have changed, recache
    // the notes.
    if (this.hasTrackChanged()) {
      this.cacheNotes();
    }

    // Return the cached notes
    return this.#cachedNotes;
  }

  public hasTrackChanged(): boolean {
    const revision = this.noteRevision;
    const isSameTrack = this.#cachedTrack === this.#midiTrack;
    const isSameRevision = this.#cachedRevision === revision;
    return !isSameTrack || !isSameRevision;
  }

  private cacheNotes(): void {
    // Update the cache
    this.#cachedTrack = this.#midiTrack;
    this.#cachedRevision = this.noteRevision;
    const range = { pitch: this.range };
    this.#cachedNotes = this.#midiTrack?.getNotes(range) ?? [];

    // Notify any listeners that the cached notes have changed.
    this.#onCacheChange?.();
  }

  public containsNote(note: MidiNote): boolean {
    return this.containsPitch(note.note);
  }

  public containsPitch(pitch: number): boolean {
    return (
      (pitch >= this.#offset && pitch < this.#offset + this.#laneCount) ||
      (this.#instrument === "drums" &&
        this.#difficulty === Difficulty.Expert &&
        pitch === 95)
    );
  }

  private resetCache() {
    this.#cachedTrack = null;
    this.#cachedRevision = -1;
    this.#cachedNotes = [];
  }
}
