import type { Midi } from "@openchart/midi";
import {
  DefaultCompiledRuleset,
  Difficulty,
  type EditingSession,
} from "@openchart/views";
import * as THREE from "three";
import { Box2, Vector2 } from "three";
import { Engine, type EngineOptions } from "../../rendering/engine";
import { RenderScheduler } from "../../rendering/scheduler";
import { getCameraTickForPlayhead } from "./viewNavigation";

export interface ChartViewState {
  midi: Midi | null;
  selectedTrackKey: string | null;
  selectedTrackIndex: number | null;
  selectedInstrument: string;
  selectedDifficulty: Difficulty;
  snap: SnapSettings;
  lockCursor: boolean;
  isPlaying: boolean;
}

export interface SnapSettings {
  enabled: boolean;
  denominator: number;
}

export abstract class AbstractChartView<T> {
  private readonly defaultScene = new THREE.Scene();
  private readonly defaultCamera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
  private engine: Engine | null = null;
  private scheduler: RenderScheduler | null = null;
  private readonly cameraListeners = new Set<() => void>();
  private destroyed = false;
  private readonly engineOptions: EngineOptions | undefined;

  private width = 1;
  private height = 1;

  protected state: ChartViewState = {
    midi: null,
    selectedTrackKey: null,
    selectedTrackIndex: null,
    // Overwritten by the viewport; the first editable track of the default rules.
    selectedInstrument:
      DefaultCompiledRuleset.descriptors().find((t) => t.visible && t.editable)
        ?.name ?? "",
    selectedDifficulty: Difficulty.Expert,
    snap: { enabled: true, denominator: 4 },
    lockCursor: false,
    isPlaying: false,
  };

  public constructor(engineOptions?: EngineOptions) {
    this.engineOptions = engineOptions;
  }

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
    engine.size = new Vector2(this.width, this.height);

    // Paint once synchronously so the viewport has a useful first frame even
    // when the host is mounted between animation-frame callbacks. The
    // scheduler still coalesces subsequent state and pointer updates.
    this.draw(engine);
    engine.render(this.renderScene, this.renderCamera);
    this.render();
  }

  public update(state: ChartViewState): void {
    this.state = state;

    this.render();
  }

  /** Binds the editing session supplied by the active viewport. */
  public setEditingSession(_session?: EditingSession): void {
    void _session;
  }

  /** Chart renderers use this instead of reaching into React playback state. */
  protected get canEditNotes(): boolean {
    return !this.state.isPlaying;
  }

  /** The canvas this view draws into, once mounted. */
  public getCanvas(): HTMLCanvasElement | null {
    return this.engine?.canvas ?? null;
  }

  public resize(width: number, height: number): void {
    this.width = width;
    this.height = height;

    if (!this.engine) {
      return;
    }

    this.engine.size = new Vector2(width, height);
    this.onResized(width, height);

    this.render();
  }

  public destroy(): void {
    this.destroyed = true;
    this.cameraListeners.clear();

    this.scheduler?.dispose();
    this.scheduler = null;
    this.engine?.dispose();
    this.engine = null;
  }

  protected getEngineOptions(): EngineOptions {
    return (
      this.engineOptions ?? {
        background: 0x151515,
        antialias: false,
        pixelRatioCap: 2,
      }
    );
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

  protected render(): void {
    this.scheduler?.request();
  }

  protected toScreenSpace(value: Vector2): Vector2;
  protected toScreenSpace(value: Box2): Box2;
  protected toScreenSpace(value: Vector2 | Box2): Vector2 | Box2 {
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

  /** Camera tick that frames the playhead, or null when no move is needed. */
  public getCameraTickForPlayhead(playheadTick: number): number | null {
    return getCameraTickForPlayhead(
      playheadTick,
      this.getCameraTick(),
      this.getVisibleTickSpan(),
    );
  }

  public setCameraTick(_tick: number): void {
    void _tick;
  }

  /** Current playback cursor position, in MIDI ticks, if this view supports drawing it. */
  public setPlayheadTick(_tick: number): void {
    void _tick;
  }

  /** Subscribe to camera pan/zoom changes. Returns an unsubscribe function. */
  public subscribeCameraChange(listener: () => void): () => void {
    this.cameraListeners.add(listener);
    return () => {
      this.cameraListeners.delete(listener);
    };
  }

  protected notifyCameraChange(): void {
    for (const listener of [...this.cameraListeners]) listener();
  }

  /** Notified when the user clicks (without dragging) to seek to a tick, if supported. */
  public onSeekRequest: ((tick: number) => void) | null = null;

  /** Notified when the user changes the snap interval from a chart view. */
  public onSnapDenominatorChange: ((denominator: number) => void) | null = null;

  public abstract getTrackNotes(midi: Midi, trackIndex: number): T[];
}
