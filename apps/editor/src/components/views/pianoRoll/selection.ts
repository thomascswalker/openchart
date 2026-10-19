import type { Box2 } from "three";
import type { PianoRollNote } from "./types";

/** The selected notes plus the marquee rectangle used to select them. */
export class SelectionContext {
  /** Marquee rectangle in canvas pixels; null when no marquee is active. */
  #bounds: Box2 | null = null;

  /** Notes currently selected. */
  #notes: Set<PianoRollNote> = new Set();

  /**
   * Marquee rectangle. Build it with `Box2.setFromPoints` so it is normalized
   * however the drag runs; the setter stores a copy.
   */
  public get bounds(): Box2 | null {
    return this.#bounds;
  }

  public set bounds(value: Box2 | null) {
    this.#bounds = value !== null ? value.clone() : null;
  }

  /** Snapshot of the selected notes. */
  public get notes(): PianoRollNote[] {
    return Array.from(this.#notes);
  }

  public set notes(value: PianoRollNote[]) {
    this.#notes = new Set(value);
  }

  /** Number of selected notes. */
  public get size(): number {
    return this.#notes.size;
  }

  /** True while a marquee rectangle is being dragged. */
  public get isSelecting(): boolean {
    return this.#bounds !== null;
  }

  /** Drops the marquee and deselects every note. */
  public clear(): void {
    this.#bounds = null;
    this.#notes.clear();
  }

  /** True when the marquee overlaps `rect`; false when there is no marquee. */
  public intersects(rect: Box2): boolean {
    if (this.#bounds === null) return false;

    return (
      this.#bounds.min.x < rect.max.x &&
      this.#bounds.max.x > rect.min.x &&
      this.#bounds.min.y < rect.max.y &&
      this.#bounds.max.y > rect.min.y
    );
  }

  /** True when `note` is part of the selection. */
  public isSelected(note: PianoRollNote): boolean {
    return this.#notes.has(note);
  }

  /** Adds `note` to the selection. */
  public add(note: PianoRollNote): void {
    this.#notes.add(note);
  }

  /** Removes `note` from the selection. */
  public delete(note: PianoRollNote): void {
    this.#notes.delete(note);
  }
}
