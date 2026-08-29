import type { Midi } from "@midiedit/core";
import { Application, Point, Rectangle } from "pixi.js";

export interface ChartViewState {
  midi: Midi | null;
  selectedTrackIndex: number | null;
  snap: SnapSettings;
}

export interface SnapSettings {
  enabled: boolean;
  /** Note-value denominator (4 == quarter note, 3 == triplet half note, etc). */
  denominator: number;
}

export abstract class AbstractChartView<T> {
  private app: Application | null = null;
  private destroyed = false;

  private width = 1;
  private height = 1;

  protected state: ChartViewState = {
    midi: null,
    selectedTrackIndex: null,
    snap: { enabled: true, denominator: 4 },
  };

  public async mount(host: HTMLElement): Promise<void> {
    const app = new Application();

    await app.init({
      width: this.width,
      height: this.height,
      background: "#151515",
      preference: "webgl",
      antialias: true,
      autoStart: false,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      autoDensity: true,
    });

    if (this.destroyed) {
      app.destroy({ removeView: true }, { children: true });

      return;
    }

    this.app = app;

    host.replaceChildren(app.canvas);

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

    this.app.destroy({ removeView: true }, { children: true });
    this.app = null;
  }

  protected onMounted(_app: Application): void {}

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

  public setCameraTick(_tick: number): void {}

  /** Notified whenever the view's camera position or zoom changes, if supported. */
  public onCameraChange: (() => void) | null = null;

  public abstract getTrackNotes(midi: Midi, trackIndex: number): T[];
}
