import type { Midi } from "@midiedit/core";
import { Difficulty } from "@midiedit/views";
import { Application, Point, Rectangle } from "pixi.js";

export interface ChartViewState {
  midi: Midi | null;
  selectedTrackIndex: number | null;
  selectedInstrument: string;
  selectedDifficulty: Difficulty;
  snap: SnapSettings;
}

export interface SnapSettings {
  enabled: boolean;
  /** Note-value denominator (4 == quarter note, 3 == triplet half note, etc). */
  denominator: number;
}

export interface CameraDebugState {
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number };
  fieldOfView: number;
}

export interface CameraDebugView {
  getCameraDebugState(): CameraDebugState | null;
  applyCameraDebugState(state: CameraDebugState): boolean;
  resetCameraDebugState(): boolean;
}

export function isCameraDebugView(view: unknown): view is CameraDebugView {
  return (
    typeof view === "object" &&
    view !== null &&
    "getCameraDebugState" in view &&
    typeof view.getCameraDebugState === "function" &&
    "applyCameraDebugState" in view &&
    typeof view.applyCameraDebugState === "function" &&
    "resetCameraDebugState" in view &&
    typeof view.resetCameraDebugState === "function"
  );
}

export abstract class AbstractChartView<T> {
  private app: Application | null = null;
  private destroyed = false;

  private width = 1;
  private height = 1;

  protected state: ChartViewState = {
    midi: null,
    selectedTrackIndex: null,
    selectedInstrument: "LEAD GUITAR",
    selectedDifficulty: Difficulty.Expert,
    snap: { enabled: true, denominator: 4 },
  };

  public async mount(host: HTMLElement): Promise<void> {
    const app = new Application({
      width: this.width,
      height: this.height,
      background: "#151515",
      antialias: true,
      autoStart: false,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      autoDensity: true,
    });

    if (this.destroyed) {
      app.destroy(true, { children: true });

      return;
    }

    this.app = app;

    host.replaceChildren(app.view as HTMLCanvasElement);

    this.onMounted(app);
    this.render();
  }

  public update(state: ChartViewState): void {
    this.state = state;

    this.render();
  }

  public resize(width: number, height: number): void {
    this.width = width;
    this.height = height;

    if (!this.app) {
      return;
    }

    this.app.renderer.resize(width, height);

    this.render();
  }

  public destroy(): void {
    this.destroyed = true;

    if (!this.app) {
      return;
    }

    this.app.destroy(true, { children: true });
    this.app = null;
  }

  protected onMounted(_app: Application): void {
    void _app;
  }

  protected abstract draw(app: Application): void;

  protected render(): void {
    if (!this.app) {
      return;
    }

    this.draw(this.app);
    this.app.render();
  }

  protected toScreenSpace(value: Point): Point;
  protected toScreenSpace(value: Rectangle): Rectangle;
  protected toScreenSpace(value: Point | Rectangle): Point | Rectangle {
    return value;
  }

  public getPpqn(): number {
    return this.state.midi?.header.division ?? 480;
  }

  /** Absolute MIDI tick at the left edge of the visible viewport, if this view supports panning. */
  public getCameraTick(): number {
    return 0;
  }

  /** Number of MIDI ticks currently visible horizontally, if this view supports panning. */
  public getVisibleTickSpan(): number {
    return 0;
  }

  public setCameraTick(_tick: number): void {
    void _tick;
  }

  /** Current playback cursor position, in MIDI ticks, if this view supports drawing it. */
  public setPlayheadTick(_tick: number): void {
    void _tick;
  }

  /** Notified whenever the view's camera position or zoom changes, if supported. */
  public onCameraChange: (() => void) | null = null;

  /** Notified whenever notes are added or removed, if supported. */
  public onNotesChanged: (() => void) | null = null;

  /** Notified when the user clicks (without dragging) to seek to a tick, if supported. */
  public onSeekRequest: ((tick: number) => void) | null = null;

  public abstract getTrackNotes(midi: Midi, trackIndex: number): T[];
}
