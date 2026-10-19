import { Box2 } from "three";
import type { PianoRollNote } from "./types";

export class SelectionContext {
  #bounds: Box2 | null = null;
  #notes: Set<PianoRollNote> = new Set();

  public get bounds(): Box2 | null {
    return this.#bounds;
  }

  public set bounds(value: Box2 | null) {
    this.#bounds =
      value !== null ? new Box2().setFromPoints([value.min, value.max]) : value;
  }

  public get notes(): PianoRollNote[] {
    return Array.from(this.#notes);
  }

  public set notes(value: PianoRollNote[]) {
    this.#notes = new Set(value);
  }

  public get size(): number {
    return this.#notes.size;
  }

  public get isSelecting(): boolean {
    return this.#bounds !== null;
  }

  public clear(): void {
    this.#bounds = null;
    this.#notes.clear();
  }

  public intersects(rect: Box2): boolean {
    if (this.#bounds === null) {
      return false;
    }
    return this.#bounds.intersectsBox(rect);
  }

  public isSelected(note: PianoRollNote): boolean {
    return this.#notes.has(note);
  }

  public add(note: PianoRollNote): void {
    this.#notes.add(note);
  }

  public delete(note: PianoRollNote): void {
    this.#notes.delete(note);
  }
}
