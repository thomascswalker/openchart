import type { CSSProperties } from "react";
import { applyStyle } from "../../../util/css";
import { MinimumPixelsPerSemitone } from "./constants";
import type { CoordinateSystem } from "./coordinates";
import { pitchName } from "./profile";
import type { PianoRollContext } from "./types";

const LABEL_STYLE: CSSProperties = {
  position: "absolute",
  font: "10px sans-serif",
  whiteSpace: "nowrap",
  overflow: "hidden",
  pointerEvents: "none",
};

export class PianoRollLabels {
  readonly #context: PianoRollContext;
  readonly #coordinates: CoordinateSystem;
  #host: HTMLElement | null = null;
  readonly #keyLabels: HTMLDivElement[] = [];
  readonly #laneLabels: HTMLDivElement[] = [];

  public constructor(context: PianoRollContext, coordinates: CoordinateSystem) {
    this.#context = context;
    this.#coordinates = coordinates;
  }

  public mount(host: HTMLElement): void {
    this.#host = host;
  }

  public destroy(): void {
    this.#keyLabels.forEach((label) => label.remove());
    this.#laneLabels.forEach((label) => label.remove());
    this.#keyLabels.length = 0;
    this.#laneLabels.length = 0;
    this.#host = null;
  }

  public draw(height: number): void {
    if (!this.#host) {
      return;
    }

    const profile = this.#context.getProfile();
    const keyboardWidth = this.#context.getKeyboardWidth();

    // Draw pinned lane labels
    let laneCount = 0;
    profile.pinnedLanes.forEach((lane) => {
      // Compute the Y position and height of this lane
      const { y, height: laneHeight } = this.#coordinates.laneRect(lane);

      // Get or make a label for this lane
      const label = this.label(this.#laneLabels, laneCount++);
      label.textContent = lane.label;
      label.title = `${lane.label} (pitch ${lane.pitches.join(", ")})`;

      // Set the style
      const style: CSSProperties = {
        left: "0",
        top: `${y}px`,
        lineHeight: `${laneHeight}px`,
        width: `${keyboardWidth}px`,
        boxSizing: "border-box",
        paddingLeft: "4px",
        color: "#bbb",
        backgroundColor: "#2a2a2a",
        display: "block",
      };
      applyStyle(label, style);
    });

    // Draw keyboard labels
    let keyCount = 0;
    const camera = this.#coordinates.getCamera();
    const gridTop = this.#coordinates.getGridTop();
    const range = this.#coordinates.getPitchRange();

    if (profile.keyboardLabels && camera.v >= MinimumPixelsPerSemitone) {
      const firstPitch = Math.ceil(camera.y);
      const topOffset = (camera.y - firstPitch) * camera.v;
      const rows = Math.ceil((height - gridTop) / camera.v) + 1;

      // Draw pitch labels starting from the lowest visible note
      for (let row = 0; row < rows; row++) {
        const pitch = firstPitch - row;

        // Only draw labels on octaves
        if (pitch % 12 !== 0 || pitch < range.low || pitch > range.high) {
          continue;
        }

        // Compute the top of the label.
        const y = gridTop + topOffset + row * camera.v;
        if (y < gridTop - 1) {
          continue;
        }

        // Get or make a label for this pitch
        const label = this.label(this.#keyLabels, keyCount++);
        label.textContent = pitchName(pitch);

        // Set style
        const style: CSSProperties = {
          left: `${keyboardWidth * 0.68}px`,
          top: `${y}px`,
          lineHeight: `${camera.v}px`,
          width: `${keyboardWidth * 0.3}px`,
          color: "#333",
          display: "block",
        };
        applyStyle(label, style);
      }
    }

    // Hide unused label elements left in the reusable DOM pool when a redraw
    // produces fewer labels. This prevents stale text from remaining visible.
    this.hideFrom(this.#laneLabels, laneCount);
    this.hideFrom(this.#keyLabels, keyCount);
  }

  /* Get or make a label at the specified index. */
  private label(pool: HTMLDivElement[], index: number): HTMLDivElement {
    let label = pool[index];
    if (!label) {
      label = document.createElement("div");
      label.className = "piano-roll-label";

      applyStyle(label, LABEL_STYLE);
      pool[index] = label;
      this.#host?.appendChild(label);
    }
    return label;
  }

  /* Hide elements in the pool starting from the specified index to the end. */
  private hideFrom(pool: HTMLDivElement[], index: number): void {
    for (let i = index; i < pool.length; i++) {
      pool[i].style.display = "none";
    }
  }
}
