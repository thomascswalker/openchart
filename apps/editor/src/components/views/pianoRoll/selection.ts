import { normalizeRect, type CanvasRect } from "../../../rendering/geometry";
import type { PianoRollNote } from "./types";

export class SelectionContext {
  #bounds: CanvasRect | null = null;
  #notes: Set<PianoRollNote> = new Set();

  public get bounds(): CanvasRect | null {
    return this.#bounds;
  }

  public set bounds(value: CanvasRect | null) {
    this.#bounds = value !== null ? normalizeRect(value) : value;
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

  public intersects(rect: CanvasRect): boolean {
    if (this.#bounds === null) {
      return false;
    }
    return (
      this.#bounds.x < rect.x + rect.width &&
      this.#bounds.x + this.#bounds.width > rect.x &&
      this.#bounds.y < rect.y + rect.height &&
      this.#bounds.y + this.#bounds.height > rect.y
    );
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
