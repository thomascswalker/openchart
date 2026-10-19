import type { CoordinateSystem } from "./coordinates";
import type { PianoRollContext } from "./types";

/** Base class for piano-roll surfaces that mount DOM and draw each frame. */
export abstract class IController {
  /** Narrow view of the owning piano roll. */
  protected readonly context: PianoRollContext;

  /** Tick/pixel conversion and camera math shared by all surfaces. */
  protected readonly coordinates: CoordinateSystem;

  public constructor(context: PianoRollContext, coordinates: CoordinateSystem) {
    this.context = context;
    this.coordinates = coordinates;
  }

  /** Attaches the controller's DOM elements to `host`. */
  abstract mount(host: HTMLElement): void;

  /** Removes DOM elements and releases any state held by the controller. */
  abstract destroy(): void;

  /** Synchronizes the controller's DOM with the current view state. */
  abstract draw(): void;
}
