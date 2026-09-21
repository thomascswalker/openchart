import type {
  Midi,
  MidiTrack,
  TempoChange,
  TimeSignatureChange,
} from "@midiedit/core";
import * as THREE from "three";
import { AbstractChartView } from "../AbstractChartView";
import { type CanvasPoint, type CanvasRect } from "../../../rendering/geometry";
import { type Engine } from "../../../rendering/engine";
import { CoordinateSystem } from "./coordinates";
import { HeaderController } from "./header";
import { PianoRollInputController } from "./input";
import { NoteDataStore } from "./noteData";
import { NoteEditingController } from "./noteEditing";
import { NoteGeometryCache } from "./noteGeometry";
import { PointerContext } from "./pointer";
import { PianoRollRenderer } from "./rendering";
import { SelectionContext } from "./selection";
import type { PianoRollCamera, PianoRollContext, PianoRollNote } from "./types";

export class PianoRollView extends AbstractChartView<PianoRollNote> {
  private readonly threeCamera = new THREE.OrthographicCamera(
    0,
    1,
    0,
    1,
    0.1,
    1000,
  );
  private readonly keyboardWidth = 64;
  private readonly camera: PianoRollCamera = { x: 0, y: 84, h: 120, v: 18 };
  private readonly pointer = new PointerContext();
  private readonly selection = new SelectionContext();

  private readonly noteData = new NoteDataStore();
  private readonly geometry = new NoteGeometryCache();
  private readonly coordinates = new CoordinateSystem(
    {
      getPpqn: () => this.getPpqn(),
      getState: () => this.state,
      getTempoChanges: () => this.tempoChanges,
    },
    this.camera,
    this.keyboardWidth,
  );
  private readonly context: PianoRollContext = {
    getState: () => this.state,
    getMidi: () => this.state.midi,
    getPpqn: () => this.getPpqn(),
    getSelectedTrack: () => this.getSelectedTrack(),
    getTrackNotes: (midi, trackIndex) =>
      this.noteData.getTrackNotes(midi, trackIndex),
    getCurrentNotes: () => this.noteData.currentNotes,
    getTempoChanges: () => this.tempoChanges,
    getTimeSignatureChanges: () => this.timeSignatureChanges,
    getCamera: () => this.camera,
    getKeyboardWidth: () => this.keyboardWidth,
    getViewport: () => ({ width: this.lastWidth, height: this.lastHeight }),
    getPointerContext: () => this.pointer,
    getSelectionContext: () => this.selection,
    requestRender: () => this.render(),
    notifyNotesChanged: () => this.onNotesChanged?.(),
    requestSeek: (tick) => this.onSeekRequest?.(tick),
    invalidateTempoCache: () => {
      this.tempoCacheMidi = null;
      this.onNotesChanged?.();
    },
  };
  private readonly editing = new NoteEditingController(
    this.context,
    this.coordinates,
  );
  private readonly header = new HeaderController(
    this.context,
    this.coordinates,
  );
  private readonly renderer = new PianoRollRenderer(
    this.context,
    this.coordinates,
    this.noteData,
    this.geometry,
    this.header,
  );
  private readonly input = new PianoRollInputController(
    this.context,
    this.coordinates,
    this.geometry,
    this.editing,
    this.header,
  );

  private tempoCacheMidi: Midi | null = null;
  private tempoChanges: TempoChange[] = [
    { tick: 0, microsecondsPerQuarterNote: 500_000 },
  ];
  private timeSignatureChanges: TimeSignatureChange[] = [
    { tick: 0, numerator: 4, denominator: 2 },
  ];
  private canvas: HTMLCanvasElement | null = null;
  private playheadTick = 0;
  private lastWidth = 1;
  private lastHeight = 1;
  private lastNotifiedCameraX: number | null = null;
  private lastNotifiedCameraH: number | null = null;

  public getPointerContext(): PointerContext {
    return this.pointer;
  }

  public getSelectionContext(): SelectionContext {
    return this.selection;
  }

  public override getCameraTick(): number {
    return this.camera.x;
  }

  public override getVisibleTickSpan(): number {
    return this.coordinates.getVisibleTickSpan(this.lastWidth);
  }

  public override setCameraTick(tick: number): void {
    this.coordinates.setCameraTick(tick);
    this.render();
  }

  public override setPlayheadTick(tick: number): void {
    this.playheadTick = tick;
    this.render();
  }

  public override async mount(host: HTMLElement): Promise<void> {
    await super.mount(host);
    if (!this.canvas) return;
    this.header.mount(host);
  }

  protected override get renderScene(): THREE.Scene {
    return this.renderer.getScene();
  }

  protected override get renderCamera(): THREE.Camera {
    return this.threeCamera;
  }

  protected override onMounted(engine: Engine): void {
    this.canvas = engine.canvas;
    this.input.attach(this.canvas);
    this.threeCamera.rotation.set(0, 0, 0);
  }

  public override destroy(): void {
    this.input.detach();
    this.header.destroy();
    this.canvas = null;
    this.geometry.clear();
    this.noteData.clear();
    this.renderer.dispose();
    super.destroy();
  }

  protected override draw(engine: Engine): void {
    const { width, height } = engine.getSize();
    this.lastWidth = width;
    this.lastHeight = height;
    this.threeCamera.left = 0;
    this.threeCamera.right = width;
    this.threeCamera.top = 0;
    this.threeCamera.bottom = height;
    this.threeCamera.position.set(0, 0, 10);
    this.threeCamera.updateProjectionMatrix();
    this.input.setViewport(width, height);
    this.updateTempoCache();
    this.renderer.draw(width, height, this.playheadTick);

    if (
      this.camera.x !== this.lastNotifiedCameraX ||
      this.camera.h !== this.lastNotifiedCameraH
    ) {
      this.lastNotifiedCameraX = this.camera.x;
      this.lastNotifiedCameraH = this.camera.h;
      this.onCameraChange?.();
    }
  }

  public override getTrackNotes(
    midi: Midi,
    trackIndex: number,
  ): PianoRollNote[] {
    return this.noteData.getTrackNotes(midi, trackIndex);
  }

  public focusSelection(): void {
    this.coordinates.focusSelection(
      this.selection.notes,
      this.lastWidth,
      this.lastHeight,
    );
    this.render();
  }

  public drawCursor(width: number, height: number): void {
    this.renderer.drawCursor(width, height, this.playheadTick);
  }

  protected override toScreenSpace(value: CanvasPoint): CanvasPoint;
  protected override toScreenSpace(value: CanvasRect): CanvasRect;
  protected override toScreenSpace(
    value: CanvasPoint | CanvasRect,
  ): CanvasPoint | CanvasRect {
    return this.coordinates.toScreenSpace(value);
  }

  private getSelectedTrack(): MidiTrack | null {
    const midi = this.state.midi;
    const trackIndex = this.state.selectedTrackIndex;
    if (!midi || trackIndex === null) return null;
    return midi.tracks[trackIndex] ?? null;
  }

  private updateTempoCache(): void {
    const midi = this.state.midi;
    if (midi === this.tempoCacheMidi) return;
    this.tempoCacheMidi = midi;
    this.tempoChanges = midi?.getTempoChanges() ?? [
      { tick: 0, microsecondsPerQuarterNote: 500_000 },
    ];
    this.timeSignatureChanges = midi?.getTimeSignatureChanges() ?? [
      { tick: 0, numerator: 4, denominator: 2 },
    ];
  }
}

export type { PianoRollNote } from "./types";
