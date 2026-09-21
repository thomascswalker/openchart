import type { Midi } from "@midiedit/core";
import { Difficulty } from "@midiedit/views";
import * as THREE from "three";
import { RenderScheduler } from "../../rendering/scheduler";
import { Engine, type EngineOptions } from "../../rendering/engine";
import type { CanvasPoint, CanvasRect } from "../../rendering/geometry";

export interface ChartViewState {
  midi: Midi | null;
  selectedTrackIndex: number | null;
  selectedInstrument: string;
  selectedDifficulty: Difficulty;
  snap: SnapSettings;
  /** Note mutations are disabled while the shared transport is playing. */
  isPlaying: boolean;
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

export interface NoteSizeDebugState {
  x: number;
  y: number;
  z: number;
}

export interface NoteSizeDebugView {
  getNoteSizeDebugState(): NoteSizeDebugState | null;
  applyNoteSizeDebugState(state: NoteSizeDebugState): boolean;
  resetNoteSizeDebugState(): boolean;
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

export function isNoteSizeDebugView(view: unknown): view is NoteSizeDebugView {
  return (
    typeof view === "object" &&
    view !== null &&
    "getNoteSizeDebugState" in view &&
    typeof view.getNoteSizeDebugState === "function" &&
    "applyNoteSizeDebugState" in view &&
    typeof view.applyNoteSizeDebugState === "function" &&
    "resetNoteSizeDebugState" in view &&
    typeof view.resetNoteSizeDebugState === "function"
  );
}

export abstract class AbstractChartView<T> {
  private readonly defaultScene = new THREE.Scene();
  private readonly defaultCamera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
  private engine: Engine | null = null;
  private scheduler: RenderScheduler | null = null;
  private destroyed = false;

  private width = 1;
  private height = 1;

  protected state: ChartViewState = {
    midi: null,
    selectedTrackIndex: null,
    selectedInstrument: "LEAD GUITAR",
    selectedDifficulty: Difficulty.Expert,
    snap: { enabled: true, denominator: 4 },
    isPlaying: false,
  };

  public async mount(host: HTMLElement): Promise<void> {
    if (this.destroyed) return;

    const engine = new Engine(this.getEngineOptions());
    this.engine = engine;
    this.scheduler = new RenderScheduler(() => {
      if (!this.engine || this.destroyed) return;
      this.draw(this.engine);
      this.engine.render(this.renderScene, this.renderCamera);
    });

    host.replaceChildren(engine.canvas);
    this.onMounted(engine);
    engine.setSize(this.width, this.height);

    // Paint once synchronously so the viewport has a useful first frame even
    // when the host is mounted between animation-frame callbacks. The
    // scheduler still coalesces subsequent state and pointer updates.
    this.draw(engine);
    engine.render(this.renderScene, this.renderCamera);
    this.requestRender();
  }

  public update(state: ChartViewState): void {
    this.state = state;

    this.requestRender();
  }

  /** Chart renderers use this instead of reaching into React playback state. */
  protected get canEditNotes(): boolean {
    return !this.state.isPlaying;
  }

  public resize(width: number, height: number): void {
    this.width = width;
    this.height = height;

    if (!this.engine) {
      return;
    }

    this.engine.setSize(width, height);
    this.onResized(width, height);

    this.requestRender();
  }

  public destroy(): void {
    this.destroyed = true;

    this.scheduler?.dispose();
    this.scheduler = null;
    this.engine?.dispose();
    this.engine = null;
  }

  protected getEngineOptions(): EngineOptions {
    return { background: 0x151515, antialias: false, pixelRatioCap: 2 };
  }

  protected onMounted(_engine: Engine): void {
    void _engine;
  }

  protected onResized(_width: number, _height: number): void {
    void _width;
    void _height;
  }

  protected get renderScene(): THREE.Scene {
    return this.defaultScene;
  }

  protected get renderCamera(): THREE.Camera {
    return this.defaultCamera;
  }
  protected abstract draw(engine: Engine): void;

  /** Coalesce all state changes into one complete render per display frame. */
  protected requestRender(): void {
    this.scheduler?.request();
  }

  /** Existing views call render(); keep that API while routing through the scheduler. */
  protected render(): void {
    this.requestRender();
  }

  protected toScreenSpace(value: CanvasPoint): CanvasPoint;
  protected toScreenSpace(value: CanvasRect): CanvasRect;
  protected toScreenSpace(
    value: CanvasPoint | CanvasRect,
  ): CanvasPoint | CanvasRect {
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
