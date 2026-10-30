import type { Midi, MidiNote } from "@openchart/midi";
import type { EditingSession, PreviewState } from "@openchart/views";
import { ChartView, SongView, type CompiledRuleset } from "@openchart/views";
import * as THREE from "three";
import { AbstractChartView, type ChartViewState } from "../AbstractChartView";
import type { Engine } from "../../../rendering/engine";
import type { EngineOptions } from "../../../rendering/engine";
import { ResourceRegistry } from "./rendering/assets";
import { getHighwaySnapDenominator } from "./interactionMath";
import { SnapDenominators } from "../pianoRoll/constants";
import {
  defaultCameraFieldOfView,
  defaultCameraPosition,
  defaultCameraRotation,
  farBoardZ,
  nearBoardZ,
  strikeLineZ,
} from "./constants";
import {
  getPhraseModeForHighwayMode,
  type HighwayMode,
  type HighwayNotePlacementType,
  type HighwayPhraseKind,
  type HighwaySelectionRange,
} from "./types";
import type { HighwayContext } from "./context";
import { HighwayCoordinateSystem } from "./coordinates";
import { HighwayHitTester } from "./hitTesting";
import { HighwayNoteEditingController } from "./editing/noteEditing";
import { HighwayPhraseEditingController } from "./editing/phraseEditing";
import { HighwayInputController } from "./input/input";
import {
  HighwayRenderer,
  type HighwayRenderDiagnostics,
} from "./rendering/rendering";
export type { HighwayMode, HighwayTool } from "./types";
export type { HighwayNotePlacementType, HighwayPhraseKind } from "./types";

export class HighwayView extends AbstractChartView<MidiNote> {
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
    getEditingSession: () => this.editingSession,
    getPreviewState: () => this.previewState,
    setPreviewState: (preview) => {
      this.previewState = preview;
      this.render();
    },
    getViewport: () => ({
      width: this.viewportWidth,
      height: this.viewportHeight,
    }),
    getPlayheadTick: () => this.playheadTick,
    getCameraTick: () => this.cameraTick,
    getScrollSpeedMultiplier: () => this.scrollSpeedMultiplier,
    setCameraTick: (tick) => this.setCameraTick(tick),
    getMode: () => this.mode,
    getNotePlacementType: () => this.notePlacementType,
    getPhraseMode: () => this.phraseMode,
    getPhraseHoverState: () => this.input.getPhraseHoverState(),
    getSelectionRange: () => this.selectionRange,
    getGhostNoteLocation: () => this.input.getGhostNoteLocation(),
    getHoveredNoteOn: () => this.input.getHoveredNoteOn(),
    canShowNotePlacementPreview: () => this.input.canShowNotePlacementPreview(),
    getCanvas: () => this.canvas,
    requestRender: () => this.render(),
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
    setSelectionRange: (range) => this.setSelectionRange(range),
    updateMarqueeOutline: (marquee) => {
      this.renderer.updateMarqueeOutline(marquee);
    },
    clearHoverOutline: () => this.renderer.clearHoverOutline(),
  };
  private readonly coordinates = new HighwayCoordinateSystem(
    this.context,
    this.threeCamera,
  );
  private readonly hitTesting = new HighwayHitTester(
    this.coordinates,
    this.context,
  );
  private readonly editing = new HighwayNoteEditingController(this.context);
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
  private canvas: HTMLCanvasElement | null = null;
  private viewportWidth = 1;
  private viewportHeight = 1;
  private songMidi: Midi | null = null;
  private songRules: CompiledRuleset | null = null;
  private song: SongView | null = null;
  private playheadTick = 0;
  private cameraTick = 0;
  private scrollSpeedMultiplier = 1;
  private editingSession?: EditingSession;
  private previewState: PreviewState | null = null;
  private unsubscribeSelection: (() => void) | null = null;
  private selectionRange: HighwaySelectionRange | null = null;
  private mode: HighwayMode = "select";
  private notePlacementType: HighwayNotePlacementType = "normal";
  private phraseMode: HighwayPhraseKind | null = null;

  public constructor(
    registry?: ResourceRegistry,
    engineOptions?: EngineOptions,
  ) {
    super(engineOptions);
    this.renderer = new HighwayRenderer(
      this.context,
      this.coordinates,
      this.hitTesting,
      this.phraseEditing,
      registry,
    );
  }

  public getPerformanceDiagnostics(): HighwayRenderDiagnostics {
    return this.renderer.getPerformanceDiagnostics();
  }

  public override setEditingSession(session?: EditingSession): void {
    if (this.editingSession === session) return;
    this.input.cancelActiveGestures();
    this.unsubscribeSelection?.();
    this.unsubscribeSelection = null;
    this.editingSession = session;
    this.previewState = null;
    if (session) {
      this.unsubscribeSelection = session.selection.subscribe(() =>
        this.render(),
      );
    }
    this.render();
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

  public override getCameraTick(): number {
    return this.cameraTick;
  }

  public override getVisibleTickSpan(): number {
    return (
      this.coordinates.getTickAtDepth(farBoardZ) -
      this.coordinates.getTickAtDepth(nearBoardZ)
    );
  }

  public override getCameraTickForPlayhead(tick: number): number {
    return this.coordinates.getCameraTickAtDepth(tick, strikeLineZ);
  }

  public override setCameraTick(tick: number): void {
    const nextTick = tick;
    if (!Number.isFinite(nextTick) || nextTick === this.cameraTick) return;
    this.cameraTick = nextTick;
    this.render();
    this.notifyCameraChange();
  }

  public setScrollSpeedMultiplier(multiplier: number): void {
    if (
      !Number.isFinite(multiplier) ||
      multiplier < 0.5 ||
      multiplier > 4 ||
      multiplier === this.scrollSpeedMultiplier
    ) {
      return;
    }
    const strikeTick = this.coordinates.getTickAtDepth(strikeLineZ);
    this.scrollSpeedMultiplier = multiplier;
    const cameraTick = this.coordinates.getCameraTickAtDepth(
      strikeTick,
      strikeLineZ,
    );
    if (cameraTick === this.cameraTick) this.render();
    else this.setCameraTick(cameraTick);
  }

  /** Discriminant for `AnyChartView`. */
  public readonly kind = "highway" as const;

  public setMode(mode: HighwayMode): void {
    if (mode === this.mode) return;
    this.input.cancelPhraseGesture();
    this.phraseEditing.selectPhrase(null);
    this.mode = mode;
    this.phraseMode = getPhraseModeForHighwayMode(mode);
    this.input.refreshCursor();
    this.render();
  }

  public setNotePlacementType(type: HighwayNotePlacementType): void {
    if (type === this.notePlacementType) return;
    this.notePlacementType = type;
    // Ghost previews depend on the placement (pad type, bar, marker).
    this.render();
  }

  public toggleLaneNote(lane: number, preserveSustain = false): void {
    this.input.toggleLaneNote(lane, preserveSustain);
  }

  public releaseLaneNote(lane: number): void {
    this.input.releaseLaneNote(lane);
  }

  public stepPlayhead(direction: -1 | 1, extendSelection = false): void {
    this.input.stepPlayhead(direction, extendSelection);
  }

  public clearSelectionContext(): void {
    this.input.clearSelectionContext();
  }

  public clearSelectionRange(): void {
    this.input.clearKeyboardSelectionAnchor();
    this.setSelectionRange(null);
  }

  public seekSection(forward: boolean): void {
    this.input.seekSection(forward);
  }

  public deleteSelection(): void {
    this.input.deleteSelection();
  }

  public getPasteAnchorTick(): number {
    return this.playheadTick;
  }

  private setSelectionRange(range: HighwaySelectionRange | null): void {
    const next =
      range === null
        ? null
        : {
            start: Math.max(0, Math.min(range.start, range.end)),
            end: Math.max(0, Math.max(range.start, range.end)),
          };
    if (
      next?.start === this.selectionRange?.start &&
      next?.end === this.selectionRange?.end
    ) {
      return;
    }
    this.selectionRange = next;
    this.render();
  }

  protected override draw(engine: Engine): void {
    const { x: width, y: height } = engine.size;
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
    this.unsubscribeSelection?.();
    this.unsubscribeSelection = null;
    this.renderer.dispose();
    this.canvas = null;
    super.destroy();
  }
  private getActiveChart(midi: Midi): ChartView | null {
    const rules = this.editingSession?.rules;
    if (!rules) return null;
    if (this.songMidi !== midi || this.songRules !== rules) {
      this.songMidi = midi;
      this.songRules = rules;
      this.song = new SongView(midi, rules);
    }
    const target = this.editingSession?.target;
    if (!target || target.difficulty === null) return null;
    return (
      this.song
        ?.getInstrumentTrackView(target.trackKey)
        ?.getChart(target.difficulty) ?? null
    );
  }
}
