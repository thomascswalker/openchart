import type { Midi, MidiNote } from "@midiedit/core";
import type { EditablePhraseKind } from "@midiedit/views";
import { ChartView, SongView } from "@midiedit/views";
import * as THREE from "three";
import {
  AbstractChartView,
  type CameraDebugState,
  type ChartViewState,
  type CameraDebugView,
  type NoteSizeDebugState,
  type NoteSizeDebugView,
} from "../AbstractChartView";
import type { Engine } from "../../../rendering/engine";
import { ResourceRegistry } from "./assets";
import { DEFAULT_NOTE_SCALE_MULTIPLIER } from "./geometry";
import { getHighwaySnapDenominator } from "./interaction";
import { SnapDenominators } from "../pianoRoll/constants";
import {
  defaultCameraFieldOfView,
  defaultCameraPosition,
  defaultCameraRotation,
  maximumCameraFieldOfView,
  maximumNoteScale,
  minimumCameraFieldOfView,
  minimumNoteScale,
} from "./constants";
import type { HighwayMode } from "./types";
import type { HighwayContext } from "./context";
import { HighwayCoordinateSystem } from "./coordinates";
import { HighwayHitTester } from "./hitTesting";
import { HighwayNoteEditingController } from "./noteEditing";
import { HighwayPhraseEditingController } from "./phraseEditing";
import { HighwayInputController } from "./input";
import { HighwayRenderer } from "./rendering";
import { SelectionContext } from "./selection";
export type { HighwayMode, HighwayTool } from "./types";

function isValidCameraDebugState(state: CameraDebugState): boolean {
  return (
    [
      state.position.x,
      state.position.y,
      state.position.z,
      state.rotation.x,
      state.rotation.y,
      state.rotation.z,
      state.fieldOfView,
    ].every(Number.isFinite) &&
    state.fieldOfView >= minimumCameraFieldOfView &&
    state.fieldOfView <= maximumCameraFieldOfView
  );
}

function isValidNoteSizeDebugState(state: NoteSizeDebugState): boolean {
  return [state.x, state.y, state.z].every(
    (value) =>
      Number.isFinite(value) &&
      value >= minimumNoteScale &&
      value <= maximumNoteScale,
  );
}

export class HighwayView
  extends AbstractChartView<MidiNote>
  implements CameraDebugView, NoteSizeDebugView
{
  private readonly threeCamera = new THREE.PerspectiveCamera(
    defaultCameraFieldOfView,
    1,
    0.1,
    64,
  );
  private readonly context: HighwayContext = {
    getState: () => this.state,
    getMidi: () => this.state.midi,
    getPpqn: () => this.getPpqn(),
    getCurrentChart: () => {
      const midi = this.state.midi;
      return midi ? this.getActiveChart(midi) : null;
    },
    getViewport: () => ({
      width: this.viewportWidth,
      height: this.viewportHeight,
    }),
    getPlayheadTick: () => this.playheadTick,
    getMode: () => this.mode,
    getPhraseMode: () => this.phraseMode,
    getSelectionContext: () => this.selection,
    getGhostNoteLocation: () => this.input.getGhostNoteLocation(),
    getHoveredNoteOn: () => this.input.getHoveredNoteOn(),
    canShowNotePlacementPreview: () => this.input.canShowNotePlacementPreview(),
    getCanvas: () => this.canvas,
    requestRender: () => this.render(),
    beginEdit: () => this.onEditStart?.(),
    endEdit: () => this.onEditEnd?.(),
    notifyNotesChanged: () => this.onNotesChanged?.(),
    requestSeek: (tick) => this.onSeekRequest?.(tick),
    changeSnapDenominator: (denominator) =>
      this.onSnapDenominatorChange?.(denominator),
    stepSnapDenominator: (direction) =>
      this.onSnapDenominatorChange?.(
        getHighwaySnapDenominator(
          this.state.snap.denominator,
          direction,
          SnapDenominators,
        ),
      ),
    setPlayheadTick: (tick) => this.setPlayheadTick(tick),
    updateMarqueeOutline: (marquee) => {
      this.renderer.updateMarqueeOutline(marquee);
    },
    clearHoverOutline: () => this.renderer.clearHoverOutline(),
  };
  private readonly coordinates = new HighwayCoordinateSystem(
    this.context,
    this.threeCamera,
  );
  private readonly hitTesting = new HighwayHitTester(this.coordinates, () =>
    this.renderer.getEffectiveNoteCalibration(),
  );
  private readonly editing = new HighwayNoteEditingController(
    this.context,
    this.coordinates,
  );
  private readonly phraseEditing = new HighwayPhraseEditingController(
    this.context,
    this.coordinates,
  );
  private readonly input = new HighwayInputController(
    this.context,
    this.coordinates,
    this.hitTesting,
    this.editing,
    this.phraseEditing,
  );
  private readonly renderer: HighwayRenderer;
  private cameraDebugDefaults: CameraDebugState | null = null;
  private cameraReady = false;
  private canvas: HTMLCanvasElement | null = null;
  private viewportWidth = 1;
  private viewportHeight = 1;
  private songMidi: Midi | null = null;
  private song: SongView | null = null;
  private playheadTick = 0;
  private readonly selection = new SelectionContext();
  private mode: HighwayMode = "select";
  private phraseMode: EditablePhraseKind | null = null;

  public constructor(registry?: ResourceRegistry) {
    super();
    this.renderer = new HighwayRenderer(
      this.context,
      this.coordinates,
      this.hitTesting,
      this.phraseEditing,
      registry,
    );
  }

  public override update(state: ChartViewState): void {
    const playbackStarted = !this.state.isPlaying && state.isPlaying;
    super.update(state);
    if (!playbackStarted) {
      return;
    }

    this.input.cancelActiveGestures();
  }

  protected override get renderScene(): THREE.Scene {
    return this.renderer.getScene();
  }

  protected override get renderCamera(): THREE.Camera {
    return this.threeCamera;
  }

  protected override onMounted(engine: Engine): void {
    this.canvas = engine.canvas;
    this.canvas.tabIndex = 0;
    this.threeCamera.position.set(
      defaultCameraPosition.x,
      defaultCameraPosition.y,
      defaultCameraPosition.z,
    );
    this.threeCamera.rotation.set(
      defaultCameraRotation.x,
      defaultCameraRotation.y,
      defaultCameraRotation.z,
    );
    this.threeCamera.lookAt(0, 0, -20);
    this.cameraReady = true;
    this.cameraDebugDefaults = this.getCameraDebugState();
    this.renderer.mount();
    this.input.attach(this.canvas);
  }

  protected override onResized(width: number, height: number): void {
    this.threeCamera.aspect = width / Math.max(1, height);
    this.threeCamera.updateProjectionMatrix();
  }

  public override setPlayheadTick(tick: number): void {
    this.playheadTick = Math.max(0, tick);
    this.render();
  }

  public setMode(mode: HighwayMode): void {
    if (mode !== this.mode) {
      this.phraseEditing.setSelectedPhraseNoteOn(null);
    }
    this.mode = mode;
    this.input.refreshCursor();
    this.render();
  }

  public canCopySelection(): boolean {
    return this.editing.canCopySelection();
  }

  public canCutSelection(): boolean {
    return this.editing.canCutSelection();
  }

  public canPasteClipboard(): boolean {
    return this.editing.canPasteClipboard();
  }

  public copySelection(): void {
    this.editing.copySelection();
  }

  public cutSelection(): void {
    this.editing.cutSelection();
  }

  public pasteClipboard(): void {
    this.editing.pasteClipboard(
      this.input.getGhostNoteLocation()?.tick ?? this.playheadTick,
      this.input.getGhostNoteLocation()?.lane ?? 0,
    );
  }

  public getCameraDebugState(): CameraDebugState | null {
    if (!this.cameraReady) return null;
    return {
      position: {
        x: this.threeCamera.position.x,
        y: this.threeCamera.position.y,
        z: this.threeCamera.position.z,
      },
      rotation: {
        x: THREE.MathUtils.radToDeg(this.threeCamera.rotation.x),
        y: THREE.MathUtils.radToDeg(this.threeCamera.rotation.y),
        z: THREE.MathUtils.radToDeg(this.threeCamera.rotation.z),
      },
      fieldOfView: this.threeCamera.fov,
    };
  }

  public applyCameraDebugState(state: CameraDebugState): boolean {
    if (!this.cameraReady || !isValidCameraDebugState(state)) return false;
    this.threeCamera.position.set(
      state.position.x,
      state.position.y,
      state.position.z,
    );
    this.threeCamera.rotation.set(
      THREE.MathUtils.degToRad(state.rotation.x),
      THREE.MathUtils.degToRad(state.rotation.y),
      THREE.MathUtils.degToRad(state.rotation.z),
    );
    this.threeCamera.fov = state.fieldOfView;
    this.threeCamera.updateProjectionMatrix();
    this.render();
    return true;
  }

  public resetCameraDebugState(): boolean {
    return this.cameraDebugDefaults
      ? this.applyCameraDebugState(this.cameraDebugDefaults)
      : false;
  }

  public getNoteSizeDebugState(): NoteSizeDebugState | null {
    return this.renderer.getNoteSizeDebugState();
  }

  public applyNoteSizeDebugState(state: NoteSizeDebugState): boolean {
    if (!isValidNoteSizeDebugState(state)) return false;
    if (!this.renderer.applyNoteSizeDebugState(state)) return false;
    this.render();
    return true;
  }

  public resetNoteSizeDebugState(): boolean {
    return this.applyNoteSizeDebugState({ ...DEFAULT_NOTE_SCALE_MULTIPLIER });
  }

  protected override draw(engine: Engine): void {
    const { width, height } = engine.getSize();
    this.viewportWidth = width;
    this.viewportHeight = height;
    this.threeCamera.aspect = width / Math.max(1, height);
    this.threeCamera.updateProjectionMatrix();
    this.renderer.draw();
  }
  public override getTrackNotes(midi: Midi): MidiNote[] {
    return this.getActiveChart(midi)?.getNotes() ?? [];
  }

  public override destroy(): void {
    this.input.cancelActiveGestures();
    this.input.detach();
    this.renderer.dispose();
    this.canvas = null;
    super.destroy();
  }
  private getActiveChart(midi: Midi): ChartView | null {
    if (this.songMidi !== midi) {
      this.songMidi = midi;
      this.song = new SongView(midi);
    }
    return (
      this.song
        ?.getInstrumentTrackView(this.state.selectedInstrument)
        ?.getChart(this.state.selectedDifficulty) ?? null
    );
  }
}
