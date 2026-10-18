import { MinimumPixelsPerSemitone } from "./constants";
import type { CoordinateSystem } from "./coordinates";
import { pitchName } from "./profile";
import type { PianoRollContext } from "./types";

/**
 * Text the WebGL renderer can't draw: C-octave labels on the keyboard and
 * pinned-lane names. Positioned absolutely in the chart host, like the
 * header's marker labels, and ignored by the pointer.
 */
export class PianoRollLabels {
  private readonly context: PianoRollContext;
  private readonly coordinates: CoordinateSystem;
  private host: HTMLElement | null = null;
  private readonly keyLabels: HTMLDivElement[] = [];
  private readonly laneLabels: HTMLDivElement[] = [];

  public constructor(context: PianoRollContext, coordinates: CoordinateSystem) {
    this.context = context;
    this.coordinates = coordinates;
  }

  public mount(host: HTMLElement): void {
    this.host = host;
  }

  public destroy(): void {
    this.keyLabels.forEach((label) => label.remove());
    this.laneLabels.forEach((label) => label.remove());
    this.keyLabels.length = 0;
    this.laneLabels.length = 0;
    this.host = null;
  }

  public draw(height: number): void {
    if (!this.host) return;
    const profile = this.context.getProfile();
    const keyboardWidth = this.context.getKeyboardWidth();

    let laneCount = 0;
    for (const lane of profile.pinnedLanes) {
      const { y, height: laneHeight } = this.coordinates.laneRect(lane);
      const label = this.label(this.laneLabels, laneCount++);
      label.textContent = lane.label;
      label.title = `${lane.label} (pitch ${lane.pitches.join(", ")})`;
      label.style.left = "0";
      label.style.top = `${y}px`;
      label.style.lineHeight = `${laneHeight}px`;
      label.style.width = `${keyboardWidth}px`;
      label.style.boxSizing = "border-box";
      label.style.paddingLeft = "4px";
      label.style.color = "#bbb";
      label.style.backgroundColor = "#2a2a2a";
      label.style.display = "block";
    }
    this.hideFrom(this.laneLabels, laneCount);

    let keyCount = 0;
    const camera = this.coordinates.getCamera();
    const gridTop = this.coordinates.getGridTop();
    const range = this.coordinates.getPitchRange();
    if (profile.keyboardLabels && camera.v >= MinimumPixelsPerSemitone) {
      const firstPitch = Math.ceil(camera.y);
      const topOffset = (camera.y - firstPitch) * camera.v;
      const rows = Math.ceil((height - gridTop) / camera.v) + 1;
      for (let row = 0; row < rows; row++) {
        const pitch = firstPitch - row;
        if (pitch % 12 !== 0 || pitch < range.low || pitch > range.high) {
          continue;
        }
        const y = gridTop + topOffset + row * camera.v;
        if (y < gridTop - 1) continue;
        const label = this.label(this.keyLabels, keyCount++);
        label.textContent = pitchName(pitch);
        label.title = "";
        label.style.left = `${keyboardWidth * 0.68}px`;
        label.style.top = `${y}px`;
        label.style.lineHeight = `${camera.v}px`;
        label.style.width = `${keyboardWidth * 0.3}px`;
        label.style.color = "#333";
        label.style.display = "block";
      }
    }
    this.hideFrom(this.keyLabels, keyCount);
  }

  private label(pool: HTMLDivElement[], index: number): HTMLDivElement {
    let label = pool[index];
    if (!label) {
      label = document.createElement("div");
      label.className = "piano-roll-label";
      label.style.position = "absolute";
      label.style.font = "10px sans-serif";
      label.style.whiteSpace = "nowrap";
      label.style.overflow = "hidden";
      label.style.pointerEvents = "none";
      pool[index] = label;
      this.host?.appendChild(label);
    }
    return label;
  }

  private hideFrom(pool: HTMLDivElement[], index: number): void {
    for (let i = index; i < pool.length; i++) pool[i].style.display = "none";
  }
}
