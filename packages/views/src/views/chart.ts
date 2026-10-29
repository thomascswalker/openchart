import type { MidiNote, MidiTrack } from "@openchart/midi";
import type { PhraseDef } from "../ruleset/config";
import { classifyPitch, type PitchRole } from "../ruleset/classify";
import {
  difficultyName,
  type ChartRules,
  type CompiledLane,
  type TrackRules,
} from "../ruleset/compile";
import type { Difficulty } from "../ruleset/difficulty";
import type { InstrumentTrackView } from "./instrument";
import type { SongView } from "./song";

/**
 * Read-only view of one difficulty of a chart track. All semantics (lanes,
 * markers, phrases) come from the compiled ruleset; edits go through the
 * editing session, never through this class.
 */
export class ChartView {
  #song: SongView | undefined;
  #track: InstrumentTrackView | undefined;
  #midiTrack: MidiTrack | undefined;
  #rules: TrackRules;
  #difficulty: Difficulty;
  #cache: { revision: number; notes: MidiNote[] } | null = null;

  constructor(
    song: SongView | undefined,
    track: InstrumentTrackView | undefined,
    midiTrack: MidiTrack | undefined,
    rules: TrackRules,
    difficulty: Difficulty,
  ) {
    this.#song = song;
    this.#track = track;
    this.#midiTrack = midiTrack;
    this.#rules = rules;
    this.#difficulty = difficulty;
  }

  public getDifficulty(): Difficulty {
    return this.#difficulty;
  }

  public getRules(): TrackRules {
    return this.#rules;
  }

  public getChartRules(): ChartRules {
    return this.#rules.difficulties.get(this.#difficulty)!;
  }

  /** Lanes that exist on this track, sorted by `index`. */
  public getLanes(): readonly CompiledLane[] {
    return this.#rules.lanes;
  }

  /** Lanes that occupy a visual column (gems and pads). */
  public getColumns(): readonly CompiledLane[] {
    return this.#rules.columns;
  }

  /** Full-width bar lanes (kick, open). */
  public getBars(): readonly CompiledLane[] {
    return this.#rules.bars;
  }

  public getNoteRevision(): number {
    return this.#midiTrack?.getNoteRevision() ?? 0;
  }

  /** Notes whose pitch is a lane note or marker of this difficulty. */
  public getNotes(): MidiNote[] {
    const track = this.#midiTrack;
    if (!track) return [];
    // The same array is returned until the track's note revision changes.
    const revision = track.getNoteRevision();
    if (this.#cache?.revision === revision) return this.#cache.notes;
    const chart = this.getChartRules();
    const notes = track
      .getNotes()
      .filter(
        (note) => chart.notes.has(note.pitch) || chart.markers.has(note.pitch),
      );
    this.#cache = { revision, notes };
    return notes;
  }

  /** Phrases that apply to this difficulty. */
  public getPhrases(): readonly PhraseDef[] {
    const name = difficultyName(this.#difficulty);
    return this.#rules.phrases.filter(
      (phrase) =>
        !phrase.appliesTo ||
        phrase.appliesTo === "all" ||
        phrase.appliesTo.includes(name),
    );
  }

  public classify(pitch: number): PitchRole {
    return classifyPitch(this.#rules, pitch, this.#difficulty);
  }

  public getMidiTrack(): MidiTrack | undefined {
    return this.#midiTrack;
  }

  public getSong(): SongView | undefined {
    return this.#song;
  }

  public getTrack(): InstrumentTrackView | undefined {
    return this.#track;
  }
}
