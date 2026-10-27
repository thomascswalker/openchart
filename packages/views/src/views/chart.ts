import { MidiTrack, MidiNote } from "@openchart/midi";
import { Difficulty } from "../types.js";
import { NoteCache } from "./cache.js";
import { ChartViewConfig } from "../config.js";

export class ChartView {
  #midiTrack: MidiTrack;
  #config: ChartViewConfig;
  #cache: NoteCache;

  constructor(midiTrack: MidiTrack, config: ChartViewConfig) {
    this.#midiTrack = midiTrack;
    this.#config = config;
    this.#cache = new NoteCache(midiTrack);
  }

  public getDifficulty(): Difficulty {
    return this.#config.difficulty;
  }

  public getLaneCount(): number {
    return this.#config.laneCount;
  }

  public getNoteRevision(): number {
    return this.#midiTrack?.getNoteRevision() ?? 0;
  }

  public getNotes(): MidiNote[] {
    this.#cache.update();
    return this.#cache.getNotes();
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
    if (!this.isValidPitch(pitch) || start < 0 || (end !== 0 && end < start)) {
      return false;
    }

    this.#midiTrack.addNoteAt({
      tick: start,
      pitch,
      velocity,
      duration: Math.max(1, (end > start ? end : start + 1) - start),
    });
    return true;
  }

  public removeNote(note: MidiNote): boolean {
    if (!this.isValidNote(note)) {
      return false;
    }

    return this.#midiTrack.removeNote(note.noteOn, note.noteOff);
  }

  public moveNote(note: MidiNote, lane: number, start: number): boolean {
    if (
      start < 0 ||
      lane < 0 ||
      lane >= this.#config.laneCount ||
      !this.isValidNote(note)
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
    if (end <= note.start || !this.isValidNote(note)) {
      return false;
    }

    return this.#midiTrack.setNoteDuration(note, end - note.start);
  }

  private isValidNote(note: MidiNote): boolean {
    return this.isValidPitch(note.pitch);
  }

  private isValidPitch(pitch: number): boolean {
    const { low, high } = this.#config.range;
    return pitch >= low && pitch < high;
  }
}
