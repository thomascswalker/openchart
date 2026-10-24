import { Box2 } from "three";
import type { PianoRollNote } from "./types";
import { BaseSelection } from "../shared/selection";

export class SelectionContext extends BaseSelection<PianoRollNote> {
  #bounds: Box2 | null = null;

  public get bounds(): Box2 | null {
    return this.#bounds;
  }

  public set bounds(value: Box2 | null) {
    this.#bounds =
      value !== null ? new Box2().setFromPoints([value.min, value.max]) : value;
  }

  public override get notes(): PianoRollNote[] {
    return super.notes;
  }

  public set notes(value: PianoRollNote[]) {
    this.set(value);
  }

  public get isSelecting(): boolean {
    return this.#bounds !== null;
  }

  public clear(): void {
    this.#bounds = null;
    super.clear();
  }

  public intersects(rect: Box2): boolean {
    return this.#bounds?.intersectsBox(rect) ?? false;
  }
}
