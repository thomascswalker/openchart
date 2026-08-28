import { Rectangle } from "pixi.js";
import type { PianoRollNote } from "./types";

function normalizeRectangle(rect: Rectangle): Rectangle {
  const x = rect.width < 0 ? rect.x + rect.width : rect.x;
  const y = rect.height < 0 ? rect.y + rect.height : rect.y;
  return new Rectangle(x, y, Math.abs(rect.width), Math.abs(rect.height));
}

export class SelectionContext {
  #bounds: Rectangle | null = null;
  #notes: PianoRollNote[] = [];

  public get bounds(): Rectangle | null {
    return this.#bounds;
  }

  public set bounds(value: Rectangle | null) {
    this.#bounds = value;
  }

  public get notes(): PianoRollNote[] {
    return this.#notes;
  }

  public set notes(value: PianoRollNote[]) {
    this.#notes = value;
  }

  public get isSelecting(): boolean {
    return this.#bounds !== null;
  }

  public clear(): void {
    this.#bounds = null;
    this.#notes = [];
  }

  public intersects(rect: Rectangle): boolean {
    if (this.#bounds === null) {
      return false;
    }

    // Rectangle.intersects assumes non-negative width/height, but dragging
    // up/left produces negative values, so normalize before checking.
    const bounds = normalizeRectangle(this.#bounds);
    return bounds.intersects(rect);
  }

  public isSelected(note: PianoRollNote): boolean {
    return this.#notes.indexOf(note) !== -1;
  }
}
