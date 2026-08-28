import type { MidiNote } from "@midiedit/core";
import type { Rectangle } from "pixi.js";

export class SelectionContext {
  #bounds: Rectangle | null = null;
  #notes: MidiNote[] = [];

  public get bounds(): Rectangle | null {
    return this.#bounds;
  }

  public set bounds(value: Rectangle | null) {
    this.#bounds = value;
  }

  public get notes(): MidiNote[] {
    return this.#notes;
  }

  public set notes(value: MidiNote[]) {
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
    return this.#bounds?.intersects(rect) || false;
  }
}
