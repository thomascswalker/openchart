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

/** Style shared by every label element. */
const LABEL_STYLE: CSSProperties = {
  position: "absolute",
  font: "10px sans-serif",
  whiteSpace: "nowrap",
  overflow: "hidden",
  pointerEvents: "none",
};

/** Where an octave label starts within the keyboard, as a share of its width. */
const KeyLabelLeftRatio = 0.68;

/** How wide an octave label is, as a share of the keyboard width. */
const KeyLabelWidthRatio = 0.3;

/** Text shown for each header lane. */
const HeaderLaneTitles: Record<HeaderLane, string> = {
  tempo: "Tempo",
  timeSignature: "Time Sig",
  text: "Text",
};

/** Draws the DOM text labels that sit in the keyboard gutter. */
export class PianoRollLabels {
  /** Supplies the active profile. */
  readonly #context: PianoRollContext;

  /** Provides lane geometry and the camera. */
  readonly #coordinates: CoordinateSystem;

  /** Source of the header lanes to label. */
  readonly #header: HeaderController;

  /** Element the labels are appended to; null while unmounted. */
  #host: HTMLElement | null = null;

  /** Reusable octave labels on the keyboard. */
  readonly #keyLabels: HTMLDivElement[] = [];

  /** Reusable labels of the pinned lanes. */
  readonly #laneLabels: HTMLDivElement[] = [];

  /** Reusable labels of the header lanes. */
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

  /** Sets the element that labels are added to. */
  public mount(host: HTMLElement): void {
    this.#host = host;
  }

  /** Removes every label from the DOM and unmounts. */
  public destroy(): void {
    const pools = [this.#keyLabels, this.#laneLabels, this.#headerLaneLabels];

    for (const pool of pools) {
      pool.forEach((label) => label.remove());
      pool.length = 0;
    }

    this.#host = null;
  }

  /** Redraws all labels for a canvas `height` pixels tall. */
  public draw(height: number): void {
    if (!this.#host) return;

    const headerLaneCount = this.drawHeaderLaneLabels();
    const laneCount = this.drawPinnedLaneLabels();
    const keyCount = this.drawKeyboardLabels(height);

    // Hide unused label elements left in the reusable DOM pool when a redraw
    // produces fewer labels. This prevents stale text from remaining visible.
    this.hideFrom(this.#laneLabels, laneCount);
    this.hideFrom(this.#keyLabels, keyCount);
    this.hideFrom(this.#headerLaneLabels, headerLaneCount);
  }

  /** Labels each visible header lane; returns how many labels were used. */
  private drawHeaderLaneLabels(): number {
    const headerLanes = this.#header.visibleLanes;
    const laneHeight = HeaderHeight / headerLanes.length;

    headerLanes.forEach((lane, index) => {
      const label = this.getOrCreateLabel(this.#headerLaneLabels, index);
      label.textContent = HeaderLaneTitles[lane];
      applyStyle(label, this.gutterLabelStyle(laneHeight * index, laneHeight));
    });

    return headerLanes.length;
  }

  /** Labels each pinned lane; returns how many labels were used. */
  private drawPinnedLaneLabels(): number {
    const lanes = this.#context.getProfile().pinnedLanes;

    lanes.forEach((lane, index) => {
      const { y, height } = this.#coordinates.laneRect(lane);
      const label = this.getOrCreateLabel(this.#laneLabels, index);

      label.textContent = lane.label;
      label.title = `${lane.label} (pitch ${lane.pitches.join(", ")})`;
      applyStyle(label, this.gutterLabelStyle(y, height));
    });

    return lanes.length;
  }

  /** Labels each visible C on the keyboard; returns how many were used. */
  private drawKeyboardLabels(height: number): number {
    const camera = this.#coordinates.getCamera();
    const profile = this.#context.getProfile();
    if (!profile.keyboardLabels || camera.v < MinimumPixelsPerSemitone) {
      return 0;
    }

    const gridTop = this.#coordinates.getGridTop();
    const range = this.#coordinates.getPitchRange();
    const firstPitch = Math.ceil(camera.y);
    const topOffset = (camera.y - firstPitch) * camera.v;
    const rowCount = Math.ceil((height - gridTop) / camera.v) + 1;

    // Walk down the visible rows, labelling the C of each octave.
    let labelCount = 0;
    for (let row = 0; row < rowCount; row++) {
      const pitch = firstPitch - row;
      const isOctaveStart = pitch % 12 === 0;
      if (!isOctaveStart || pitch < range.low || pitch > range.high) continue;

      const y = gridTop + topOffset + row * camera.v;
      if (y < gridTop - 1) continue;

      const label = this.getOrCreateLabel(this.#keyLabels, labelCount++);
      label.textContent = pitchName(pitch);
      applyStyle(label, {
        left: `${KeyboardWidth * KeyLabelLeftRatio}px`,
        top: `${y}px`,
        lineHeight: `${camera.v}px`,
        width: `${KeyboardWidth * KeyLabelWidthRatio}px`,
        color: "#333",
        display: "block",
      });
    }

    return labelCount;
  }

  /** Style of a label that fills one row of the keyboard gutter. */
  private gutterLabelStyle(top: number, height: number): CSSProperties {
    return {
      left: "0",
      top: `${top}px`,
      lineHeight: `${height}px`,
      width: `${KeyboardWidth}px`,
      boxSizing: "border-box",
      paddingLeft: "4px",
      color: "#bbb",
      backgroundColor: "#2a2a2a",
      display: "block",
    };
  }

  /** Gets the label at `index` in `pool`, creating and mounting it if new. */
  private getOrCreateLabel(
    pool: HTMLDivElement[],
    index: number,
  ): HTMLDivElement {
    let label = pool[index];
    if (label) return label;

    label = document.createElement("div");
    label.className = "piano-roll-label";
    applyStyle(label, LABEL_STYLE);
    pool[index] = label;
    this.#host?.appendChild(label);

    return label;
  }

  /** Hides the labels in `pool` from `index` to the end. */
  private hideFrom(pool: HTMLDivElement[], index: number): void {
    for (let i = index; i < pool.length; i++) {
      pool[i].style.display = "none";
    }
  }
}
