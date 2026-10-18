import type { CSSProperties } from "react";
import { applyStyle } from "../../../util/css";
import {
  HeaderHeight,
  KeyboardWidth,
  MinimumPixelsPerSemitone,
} from "./constants";
import type { CoordinateSystem } from "./coordinates";
import type { HeaderController, HeaderLane } from "./header";
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
  readonly #header: HeaderController;
  #host: HTMLElement | null = null;
  readonly #keyLabels: HTMLDivElement[] = [];
  readonly #laneLabels: HTMLDivElement[] = [];
  readonly #headerLaneLabels: HTMLDivElement[] = [];

  public constructor(
    context: PianoRollContext,
    coordinates: CoordinateSystem,
    header: HeaderController,
  ) {
    this.#context = context;
    this.#coordinates = coordinates;
    this.#header = header;
  }

  public mount(host: HTMLElement): void {
    this.#host = host;
  }

  public destroy(): void {
    this.#keyLabels.forEach((label) => label.remove());
    this.#laneLabels.forEach((label) => label.remove());
    this.#headerLaneLabels.forEach((label) => label.remove());
    this.#keyLabels.length = 0;
    this.#laneLabels.length = 0;
    this.#headerLaneLabels.length = 0;
    this.#host = null;
  }

  public draw(height: number): void {
    if (!this.#host) {
      return;
    }

    const profile = this.#context.getProfile();

    const headerLanes = this.#header.visibleLanes;
    headerLanes.forEach((lane, index) => {
      const label = this.label(this.#headerLaneLabels, index);
      label.textContent = this.headerLaneLabel(lane);
      applyStyle(label, {
        left: "0",
        top: `${(HeaderHeight / headerLanes.length) * index}px`,
        lineHeight: `${HeaderHeight / headerLanes.length}px`,
        width: `${KeyboardWidth}px`,
        boxSizing: "border-box",
        paddingLeft: "4px",
        color: "#bbb",
        backgroundColor: "#2a2a2a",
        display: "block",
      });
    });

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
        width: `${KeyboardWidth}px`,
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
          left: `${KeyboardWidth * 0.68}px`,
          top: `${y}px`,
          lineHeight: `${camera.v}px`,
          width: `${KeyboardWidth * 0.3}px`,
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
    this.hideFrom(this.#headerLaneLabels, headerLanes.length);
  }

  private headerLaneLabel(lane: HeaderLane): string {
    switch (lane) {
      case "tempo":
        return "Tempo";
      case "timeSignature":
        return "Time Sig";
      case "text":
        return "Text";
    }
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
