import type { CoordinateSystem } from "./coordinates";
import type { PianoRollContext } from "./types";

export abstract class IController {
  protected readonly context: PianoRollContext;
  protected readonly coordinates: CoordinateSystem;

  public constructor(context: PianoRollContext, coordinates: CoordinateSystem) {
    this.context = context;
    this.coordinates = coordinates;
  }

  abstract mount(host: HTMLElement): void;
  abstract destroy(): void;
  abstract draw(): void;
}
