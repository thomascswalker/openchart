import { MidiTrack, MidiNote } from "@openchart/midi";
import { Difficulty } from "../types.js";
import { ChartViewConfig } from "../config.js";
import { InstrumentTrackView, SongView } from "../index.js";

export class ChartView {
  #song: SongView | undefined;
  #track: InstrumentTrackView | undefined;
  #midiTrack: MidiTrack | undefined;
  #config: ChartViewConfig;
  #specialPitches: readonly number[];
  #ensureTrack: (() => MidiTrack | undefined) | undefined;

  constructor(
    song: SongView | undefined,
    track: InstrumentTrackView | undefined,
    midiTrack: MidiTrack | undefined,
    config: ChartViewConfig,
    specialPitches: readonly number[] = [],
    ensureTrack?: () => MidiTrack | undefined,
  ) {
    this.#song = song;
    this.#track = track;
    this.#midiTrack = midiTrack;
    this.#config = config;
    this.#specialPitches = specialPitches;
    this.#ensureTrack = ensureTrack;
  }

  public getDifficulty(): Difficulty {
    return this.#config.difficulty;
  }

  public getLaneCount(): number {
    return this.#config.laneCount;
  }

  public getOffset(): number {
    return this.#config.range.low;
  }

  public getNoteRevision(): number {
    return this.#midiTrack?.getNoteRevision() ?? 0;
  }

  public getNotes(): MidiNote[] {
    return this.#midiTrack?.getNotes({ pitch: this.#config.range }) ?? [];
  }

  public addNote(
    note: number,
    start: number,
    end: number = 0,
    velocity: number = 100,
  ): boolean {
    if (note < 0 || note >= this.#config.laneCount) {
      return false;
    }
    return this.addNoteAtPitch(
      this.#config.range.low + note,
      start,
      end,
      velocity,
    );
  }

  public addNoteAtPitch(
    pitch: number,
    start: number,
    end: number = 0,
    velocity: number = 100,
  ): boolean {
    if (
      !this.#midiTrack ||
      !this.isValidPitch(pitch) ||
      start < 0 ||
      (end !== 0 && end < start)
    ) {
      return false;
    }

    this.#midiTrack.insertNote({
      tick: start,
      pitch,
      velocity,
      duration: Math.max(1, (end > start ? end : start + 1) - start),
    });
    return true;
  }

  public removeNote(note: MidiNote): boolean {
    if (!this.isValidNote(note) || !this.#midiTrack) {
      return false;
    }

    return this.#midiTrack.removeNote(note.noteOn, note.noteOff);
  }

  public moveNote(note: MidiNote, lane: number, start: number): boolean {
    if (
      start < 0 ||
      lane < 0 ||
      lane >= this.#config.laneCount ||
      !this.isValidNote(note) ||
      !this.#midiTrack
    ) {
      return false;
    }

    return this.#midiTrack.updateNote(note, {
      start,
      pitch: this.#config.range.low + lane,
      duration: note.end - note.start,
    });
  }

  public setNoteEnd(note: MidiNote, end: number): boolean {
    if (end <= note.start || !this.isValidNote(note) || !this.#midiTrack) {
      return false;
    }

    return this.#midiTrack.setNoteDuration(note, end - note.start);
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

  private ensureTrack(): MidiTrack | undefined {
    if (!this.#midiTrack && this.#ensureTrack) {
      this.#midiTrack = this.#ensureTrack();
    }
    return this.#midiTrack;
  }

  private isValidNote(note: MidiNote): boolean {
    return this.isValidPitch(note.pitch);
  }

  private isValidPitch(pitch: number): boolean {
    const { low, high } = this.#config.range;
    return (
      (pitch >= low && pitch <= high && pitch < low + this.#config.laneCount) ||
      this.#specialPitches.includes(pitch)
    );
  }
}
