import type { Midi, MidiChannelEvent, MidiNote } from "@midiedit/core";
import {
  addNotePhrase,
  extractSections,
  findSection,
  getNotePhrases,
  getPhrasePitch,
  type EditablePhraseKind,
  type MidiNotePhrase,
  updateNotePhrase,
} from "@midiedit/views";
import { ChartView, Note, SongView } from "@midiedit/views";
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
import { primitiveRoles } from "../../../rendering/registry";
import {
  createMaterialSet as createMaterialSet,
  rgbFromHex,
  setMaterialState,
  type MaterialSet,
} from "./materials";
import {
  calibrationFromModel,
  DEFAULT_NOTE_CALIBRATION,
  DEFAULT_NOTE_SCALE_MULTIPLIER,
  noteWorldPosition,
  applyModelCalibration,
  scaleNoteCalibration,
  setModelState,
  sustainWorldTransform,
  type ModelCalibration,
} from "./geometry";
import {
  createModelInstance,
  createNoteInstances,
  createFretAssembly,
  createSustainInstance,
  destroyInstancedObjects,
  type InstancedNote,
  type InstancedTail,
} from "./instances";
import { HIGHWAY_GEOMETRY_CATALOG } from "./geometryCatalog";
import {
  getHighwayDragTarget,
  getHighwaySnapDenominator,
  getHighwaySteppedTick,
  getHighwaySustainEnd,
  getHighwayWheelTick,
  getSustainCutTargets,
  minimumMidiNoteDurationTicks,
} from "./interaction";
import { SnapDenominators } from "../pianoRoll/constants";

const defaultCameraPosition = { x: 0, y: 7, z: 7 };
const defaultCameraRotation = { x: -0.65, y: 0, z: 0 };
const defaultCameraFieldOfView = 45;
const minimumCameraFieldOfView = 1;
const maximumCameraFieldOfView = 179;
const wheelTicksPerPixel = 1 / 100;
const minimumNoteScale = 0.1;
const maximumNoteScale = 10;
const laneColors = [0x00a651, 0xdc2626, 0xfacc15, 0x2563eb, 0xf97316];
const laneCount = laneColors.length;
const instanceSizePerLane = 128;
const instanceSizePreviewSustainPerLane = 16;
const instanceSizeBeatLines = 64;
const instanceSizePhraseSpans = 128;
const visibleQuarterNotes = 16;
const strikeLineZ = -3.5;
const farBoardZ = -44;
const nearBoardZ = 0.5;
const laneRgbColors = laneColors.map(rgbFromHex);

export type HighwayTool = "select" | "place" | "remove";
export type HighwayMode = HighwayTool | EditablePhraseKind;

interface HighwayClipboardNote {
  relativeTick: number;
  relativeLane: number;
  durationTicks: number;
  velocity: number;
}

interface InstancedBeatLine {
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
}

interface PhraseDragState {
  pointerId: number;
  kind: EditablePhraseKind;
  startTick: number;
  endTick: number;
  pointerTick: number;
  initialStartTick: number;
  initialEndTick: number;
  operation: "create" | "move" | "resize-start" | "resize-end";
  note: MidiNote | null;
}

interface SectionMarkerInstance {
  tick: number;
  name: string;
  line: THREE.Mesh;
  label: THREE.Sprite;
}

interface DragState {
  pointerId: number;
  button: 0 | 2;
  shiftKey: boolean;
  moved: boolean;
  sustainHit: MidiNote | null;
  noteOn: MidiChannelEvent;
  noteOns: MidiChannelEvent[];
  targets: Array<{
    noteOn: MidiChannelEvent;
    initialTick: number;
    initialLane: number;
  }>;
  initialLane: number;
  initialTick: number;
  pointerLane: number;
  pointerTick: number;
  resizing: boolean;
  changed: boolean;
}

interface MarqueeDragState {
  pointerId: number;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
  additive: boolean;
  moved: boolean;
}

interface ScreenBounds {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

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
  private readonly threeScene = new THREE.Scene();
  private readonly threeCamera = new THREE.PerspectiveCamera(
    defaultCameraFieldOfView,
    1,
    0.1,
    64,
  );
  private readonly raycaster = new THREE.Raycaster();
  private readonly boardPlane = new THREE.Plane(
    new THREE.Vector3(0, 1, 0),
    -0.05,
  );
  private readonly hoverOutline = new THREE.LineLoop(
    new THREE.BufferGeometry(),
    new THREE.LineBasicMaterial({ color: 0xffffff, linewidth: 2 }),
  );
  private readonly marqueeOutline = new THREE.LineLoop(
    new THREE.BufferGeometry(),
    new THREE.LineBasicMaterial({ color: 0x38bdf8, linewidth: 2 }),
  );
  private readonly gemInstances: InstancedNote[][] = [];
  private readonly tailInstances: InstancedTail[][] = [];
  private readonly previewTailInstances: InstancedTail[][] = [];
  private readonly sustainCutPreviewLine = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-3, 0, 0),
      new THREE.Vector3(3, 0, 0),
    ]),
    new THREE.LineDashedMaterial({
      color: 0xffffff,
      dashSize: 0.14,
      gapSize: 0.12,
      transparent: true,
      opacity: 0.9,
      depthTest: false,
    }),
  );
  private readonly gemBindings = new Map<MidiChannelEvent, InstancedNote>();
  private readonly tailBindings = new Map<MidiChannelEvent, InstancedTail>();
  private readonly beatLineInstance: InstancedBeatLine[] = [];
  private readonly phraseSpanInstances: THREE.Mesh[] = [];
  private readonly sectionMarkers: SectionMarkerInstance[] = [];
  private readonly phraseSpanGeometry = new THREE.BoxGeometry(6, 0.018, 1);
  private readonly starpowerMaterial = new THREE.MeshBasicMaterial({
    color: 0xfacc15,
    transparent: true,
    opacity: 0.28,
    depthWrite: false,
  });
  private readonly soloMaterial = new THREE.MeshBasicMaterial({
    color: 0x38bdf8,
    transparent: true,
    opacity: 0.22,
    depthWrite: false,
  });
  private readonly selectedPhraseMaterial = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.48,
    depthWrite: false,
  });
  private readonly assetRegistry: ResourceRegistry;
  private readonly ownsAssetRegistry: boolean;
  private cameraDebugDefaults: CameraDebugState | null = null;
  private noteSizeDebugState: NoteSizeDebugState = {
    ...DEFAULT_NOTE_SCALE_MULTIPLIER,
  };
  private cameraReady = false;
  private canvas: HTMLCanvasElement | null = null;
  private viewportWidth = 1;
  private viewportHeight = 1;
  private sceneReady = false;
  private assetsReady = false;
  private songMidi: Midi | null = null;
  private song: SongView | null = null;
  private materials: MaterialSet | null = null;
  private noteCalibration: ModelCalibration = DEFAULT_NOTE_CALIBRATION;
  private fretAssemblies: THREE.Group[] = [];
  private ghostGem: InstancedNote | null = null;
  private ghostNoteLocation: {
    lane: number;
    tick: number;
    shiftKey: boolean;
    sustainHit: MidiNote | null;
  } | null = null;
  private playheadTick = 0;
  private selectedNoteOns = new Set<MidiChannelEvent>();
  private noteClipboard: HighwayClipboardNote[] = [];
  private mode: HighwayMode = "select";
  private hoveredNoteOn: MidiChannelEvent | null = null;
  private drag: DragState | null = null;
  private marqueeDrag: MarqueeDragState | null = null;
  private phraseMode: EditablePhraseKind | null = null;
  private phraseDrag: PhraseDragState | null = null;
  private selectedPhraseNoteOn: MidiChannelEvent | null = null;
  private suppressNextClick = false;

  public constructor(registry?: ResourceRegistry) {
    super();
    this.assetRegistry = registry ?? new ResourceRegistry();
    this.ownsAssetRegistry = !registry;
  }

  public override update(state: ChartViewState): void {
    const playbackStarted = !this.state.isPlaying && state.isPlaying;
    super.update(state);
    if (!playbackStarted) {
      return;
    }

    if (this.drag && this.canvas?.hasPointerCapture(this.drag.pointerId)) {
      this.canvas.releasePointerCapture(this.drag.pointerId);
    }
    if (
      this.phraseDrag &&
      this.canvas?.hasPointerCapture(this.phraseDrag.pointerId)
    ) {
      this.canvas.releasePointerCapture(this.phraseDrag.pointerId);
    }
    this.drag = null;
    this.marqueeDrag = null;
    this.phraseDrag = null;
    this.marqueeOutline.visible = false;
    this.ghostNoteLocation = null;
    this.hoveredNoteOn = null;
    this.hoverOutline.visible = false;
    this.suppressNextClick = false;
  }

  protected override get renderScene(): THREE.Scene {
    return this.threeScene;
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
    this.threeScene.add(this.hoverOutline);
    this.threeScene.add(this.marqueeOutline);
    this.sustainCutPreviewLine.computeLineDistances();
    this.sustainCutPreviewLine.renderOrder = 15;
    this.sustainCutPreviewLine.visible = false;
    this.threeScene.add(this.sustainCutPreviewLine);
    this.createFretboard();
    this.createBeatLineInstance();
    this.createPhraseSpanInstances();
    this.sceneReady = true;
    void this.loadResources();

    this.canvas.style.touchAction = "none";
    this.canvas.addEventListener("click", this.handleClick);
    this.canvas.addEventListener("keydown", this.handleKeyDown);
    this.canvas.addEventListener("contextmenu", this.handleContextMenu);
    this.canvas.addEventListener("wheel", this.handleWheel, { passive: false });
    this.canvas.addEventListener("pointerdown", this.handlePointerDown);
    this.canvas.addEventListener("pointermove", this.handlePointerMove);
    this.canvas.addEventListener("pointerleave", this.handlePointerLeave);
    this.canvas.addEventListener("pointerup", this.handlePointerUp);
    this.canvas.addEventListener("pointercancel", this.handlePointerUp);
    window.addEventListener("pointerup", this.handlePointerUp);
    window.addEventListener("keydown", this.handleModifierKey);
    window.addEventListener("keyup", this.handleModifierKey);
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
    if (mode !== this.mode) this.selectedPhraseNoteOn = null;
    this.mode = mode;
    this.updateCanvasCursor(this.hoveredNoteOn !== null);
    this.render();
  }

  private get tool(): HighwayTool {
    return this.mode === "starpower" || this.mode === "solo"
      ? "select"
      : this.mode;
  }

  public canCopySelection(): boolean {
    return (
      this.getCurrentChart()
        ?.getNotes()
        .some((note) => this.selectedNoteOns.has(note.noteOn)) ?? false
    );
  }

  public canCutSelection(): boolean {
    return this.canEditNotes && this.canCopySelection();
  }

  public canPasteClipboard(): boolean {
    return this.canEditNotes && this.noteClipboard.length > 0;
  }

  public copySelection(): void {
    const chart = this.getCurrentChart();
    const notes = (chart?.getNotes() ?? []).filter((note) =>
      this.selectedNoteOns.has(note.noteOn),
    );
    if (notes.length === 0) return;
    const firstTick = Math.min(...notes.map((note) => note.start));
    const firstLane = Math.min(
      ...notes.map((note) => note.note - (chart?.getOffset() ?? 0)),
    );
    const offset = chart?.getOffset() ?? 0;
    this.noteClipboard = notes.map((note) => ({
      relativeTick: note.start - firstTick,
      relativeLane: note.note - offset - firstLane,
      durationTicks: note.end - note.start,
      velocity: note.velocity,
    }));
  }

  public cutSelection(): void {
    const chart = this.getCurrentChart();
    if (!chart || !this.canCutSelection()) return;
    this.copySelection();
    let changed = false;
    for (const note of chart.getNotes()) {
      if (this.selectedNoteOns.has(note.noteOn)) {
        changed = chart.removeNote(note) || changed;
      }
    }
    this.selectedNoteOns.clear();
    if (changed) this.onNotesChanged?.();
    this.render();
  }

  public pasteClipboard(): void {
    const chart = this.getCurrentChart();
    if (!chart || !this.canPasteClipboard()) return;
    const anchorTick = this.snapTick(
      this.ghostNoteLocation?.tick ?? this.playheadTick,
    );
    const anchorLane = this.ghostNoteLocation?.lane ?? 0;
    const originalNotes = new Set(chart.getNotes().map((note) => note.noteOn));
    const pasted = new Set<MidiChannelEvent>();
    for (const entry of this.noteClipboard) {
      const lane = anchorLane + entry.relativeLane;
      if (lane < 0 || lane >= laneCount) continue;
      const start = Math.max(0, this.snapTick(anchorTick + entry.relativeTick));
      chart.addNote(
        lane as Note,
        start,
        start + entry.durationTicks,
        entry.velocity,
      );
      const note = chart
        .getNotes()
        .find(
          (candidate) =>
            !originalNotes.has(candidate.noteOn) &&
            !pasted.has(candidate.noteOn) &&
            candidate.note === lane + chart.getOffset() &&
            candidate.start === start &&
            candidate.end === start + entry.durationTicks,
        );
      if (note) pasted.add(note.noteOn);
    }
    if (pasted.size > 0) {
      this.selectedNoteOns = pasted;
      this.onNotesChanged?.();
      this.render();
    }
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
    return this.sceneReady ? structuredClone(this.noteSizeDebugState) : null;
  }

  public applyNoteSizeDebugState(state: NoteSizeDebugState): boolean {
    if (!this.sceneReady || !isValidNoteSizeDebugState(state)) return false;
    this.noteSizeDebugState = structuredClone(state);
    this.applyNoteCalibrationToInstances();
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
    const midi = this.state.midi;
    const chart = midi ? this.getActiveChart(midi) : null;
    if (!chart) {
      this.threeScene.userData.visibleNotes = 0;
      this.threeScene.userData.visibleSustains = 0;
      this.hideAllObjects();
      this.hidePhraseSpans();
      this.hideSectionMarkers();
      return;
    }

    const cutPreview = this.getSustainCutPreview(chart);
    this.updateSustainCutPreviewLine(
      cutPreview.size > 0 ? (this.ghostNoteLocation?.tick ?? null) : null,
    );
    this.drawPhraseSpans(chart);
    this.drawSectionMarkers(chart);
    if (!this.assetsReady || !this.materials) {
      this.threeScene.userData.visibleNotes = 0;
      this.threeScene.userData.visibleSustains = 0;
      this.hideAllObjects();
      return;
    }

    this.drawBeatLines();
    const visibleStart = this.getTickAtDepth(nearBoardZ);
    const visibleEnd = this.playheadTick + this.getPpqn() * visibleQuarterNotes;
    const visibleNotes = chart
      .getNotes()
      .map((note) => ({ note, lane: note.note - chart.getOffset() }))
      .filter(
        ({ note, lane }) =>
          note.end >= visibleStart &&
          note.start <= visibleEnd &&
          lane >= 0 &&
          lane < laneCount,
      );

    const usedTails = new Set<InstancedTail>();
    const visibleTailEnd = this.getTickAtDepth(farBoardZ);
    for (const { note, lane } of visibleNotes) {
      const tailStart = Math.max(note.start, visibleStart);
      const tailEnd = Math.min(note.end, visibleTailEnd);
      if (tailEnd <= tailStart) continue;
      const cutTick = cutPreview.has(note.noteOn)
        ? (this.ghostNoteLocation?.tick ?? null)
        : null;
      const solidTailEnd =
        cutTick === null ? tailEnd : Math.min(tailEnd, cutTick);
      if (solidTailEnd <= tailStart) continue;
      const instancedTail = this.acquireTail(note.noteOn, usedTails);
      if (!instancedTail) continue;
      usedTails.add(instancedTail);
      const transform = sustainWorldTransform(
        this.getLaneX(lane),
        this.getNoteZ(tailStart),
        this.getNoteZ(solidTailEnd),
      );
      const selected = this.selectedNoteOns.has(note.noteOn);
      instancedTail.mesh.position.set(
        transform.position.x,
        transform.position.y,
        transform.position.z,
      );
      instancedTail.mesh.scale.set(
        transform.scale.x,
        transform.scale.y,
        transform.scale.z,
      );
      instancedTail.mesh.renderOrder = 10;
      instancedTail.mesh.visible = true;
      setMaterialState(instancedTail.mesh, {
        baseColor: laneRgbColors[lane],
        emissionColor: laneRgbColors[lane],
        emissionIntensity: selected ? 1.7 : 1,
        selected,
        alpha: 0.65,
        passed: false,
        useStrikeLine: true,
        strikeLineZ,
      });
    }
    const previewSustains = this.drawSustainCutPreviewRemainders(
      chart,
      cutPreview,
      visibleStart,
      visibleTailEnd,
    );
    this.threeScene.userData.visibleNotes = visibleNotes.length;
    this.threeScene.userData.visibleSustains = usedTails.size + previewSustains;

    const usedGems = new Set<InstancedNote>();
    for (const { note, lane } of visibleNotes) {
      const instancedGem = this.acquireGem(note.noteOn, usedGems);
      if (!instancedGem) continue;
      usedGems.add(instancedGem);
      const distance = (note.start - this.playheadTick) / this.getPpqn();
      const position = noteWorldPosition(
        this.getLaneX(lane),
        strikeLineZ - distance * 3,
        this.getEffectiveNoteCalibration(),
      );
      instancedGem.object.position.set(position.x, position.y, position.z);
      instancedGem.object.renderOrder = 20;
      instancedGem.object.visible = true;
      instancedGem.selected = this.selectedNoteOns.has(note.noteOn);
      setModelState(instancedGem.object, this.materials, laneRgbColors[lane], {
        selected: instancedGem.selected,
        passed: note.start <= this.playheadTick + 0.001,
      });
    }
    this.releaseUnusedBindings(this.gemBindings, usedGems, (item) => {
      item.object.visible = false;
    });
    this.releaseUnusedBindings(this.tailBindings, usedTails, (item) => {
      item.mesh.visible = false;
    });
    this.drawGhostGem();
    this.drawHoverOutline(chart);
  }

  public override getTrackNotes(midi: Midi): MidiNote[] {
    return this.getActiveChart(midi)?.getNotes() ?? [];
  }

  public override destroy(): void {
    this.canvas?.removeEventListener("click", this.handleClick);
    this.canvas?.removeEventListener("keydown", this.handleKeyDown);
    this.canvas?.removeEventListener("contextmenu", this.handleContextMenu);
    this.canvas?.removeEventListener("wheel", this.handleWheel);
    this.canvas?.removeEventListener("pointerdown", this.handlePointerDown);
    this.canvas?.removeEventListener("pointermove", this.handlePointerMove);
    this.canvas?.removeEventListener("pointerleave", this.handlePointerLeave);
    this.canvas?.removeEventListener("pointerup", this.handlePointerUp);
    this.canvas?.removeEventListener("pointercancel", this.handlePointerUp);
    window.removeEventListener("pointerup", this.handlePointerUp);
    window.removeEventListener("keydown", this.handleModifierKey);
    window.removeEventListener("keyup", this.handleModifierKey);
    this.canvas = null;
    this.drag = null;
    destroyInstancedObjects(this.gemInstances, this.tailInstances);
    destroyInstancedObjects([], this.previewTailInstances);
    this.gemInstances.length = 0;
    this.tailInstances.length = 0;
    this.previewTailInstances.length = 0;
    this.gemBindings.clear();
    this.tailBindings.clear();
    this.beatLineInstance.forEach(({ mesh, material }) => {
      mesh.geometry.dispose();
      material.dispose();
      mesh.removeFromParent();
    });
    this.beatLineInstance.length = 0;
    this.phraseSpanInstances.forEach((mesh) => mesh.removeFromParent());
    this.phraseSpanInstances.length = 0;
    this.phraseSpanGeometry.dispose();
    this.starpowerMaterial.dispose();
    this.soloMaterial.dispose();
    this.selectedPhraseMaterial.dispose();
    this.marqueeOutline.geometry.dispose();
    (this.marqueeOutline.material as THREE.Material).dispose();
    this.sustainCutPreviewLine.geometry.dispose();
    (this.sustainCutPreviewLine.material as THREE.Material).dispose();
    this.fretAssemblies.forEach((assembly) => {
      assembly.traverse((object) => {
        const mesh = object as THREE.Mesh;
        mesh.geometry?.dispose();
        const materials = Array.isArray(mesh.material)
          ? mesh.material
          : mesh.material
            ? [mesh.material]
            : [];
        materials.forEach((material) => material.dispose());
      });
      assembly.removeFromParent();
    });
    this.fretAssemblies.length = 0;
    this.ghostGem = null;
    this.disposeSectionMarkers();
    this.materials?.destroy();
    this.materials = null;
    if (this.ownsAssetRegistry) this.assetRegistry.dispose();
    this.threeScene.clear();
    this.assetsReady = false;
    this.sceneReady = false;
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

  private async loadResources(): Promise<void> {
    try {
      await this.assetRegistry.loadResources();
      if (!this.sceneReady || !this.cameraReady) {
        return;
      }
      this.materials = createMaterialSet(this.assetRegistry.textures);

      const { note, fretTop, fretBase } = this.assetRegistry.meshes;
      this.noteCalibration = calibrationFromModel(note.value!);
      this.gemInstances.push(
        ...createNoteInstances(
          this.threeScene,
          note.value!,
          this.materials,
          laneRgbColors,
          instanceSizePerLane,
          this.getEffectiveNoteCalibration(),
          primitiveRoles.note,
        ),
      );
      this.tailInstances.push(
        ...createSustainInstance(
          this.threeScene,
          this.materials.sustain,
          laneRgbColors,
          instanceSizePerLane,
        ),
      );
      this.previewTailInstances.push(
        ...createSustainInstance(
          this.threeScene,
          this.materials.sustain,
          laneRgbColors,
          instanceSizePreviewSustainPerLane,
        ),
      );
      this.fretAssemblies = laneRgbColors.map((color, lane) => {
        const assembly = createFretAssembly(
          this.threeScene,
          fretTop.value!,
          fretBase.value!,
          this.materials!.fretTinted,
          color,
          primitiveRoles.fretTop,
          this.materials!.fretGrayscale,
          primitiveRoles.fretBase,
        );
        const transform = HIGHWAY_GEOMETRY_CATALOG.fretTop.transform;
        assembly.position.set(
          this.getLaneX(lane) + transform.position.x,
          transform.position.y,
          strikeLineZ,
        );
        assembly.scale.set(
          transform.scale.x,
          transform.scale.y,
          transform.scale.z,
        );
        assembly.rotation.x = THREE.MathUtils.degToRad(
          transform.rotationDegrees.x,
        );
        return assembly;
      });
      this.ghostGem = createModelInstance(
        note.value!,
        (primitiveIndex) =>
          (primitiveRoles.note[primitiveIndex] === "tinted"
            ? this.materials!.noteGhostTinted
            : this.materials!.noteGhostGrayscale
          ).clone(),
        this.getEffectiveNoteCalibration(),
      );
      this.ghostGem.meshes.forEach((mesh, primitiveIndex) =>
        setMaterialState(mesh, {
          baseColor: laneRgbColors[0],
          emissionColor:
            primitiveRoles.note[primitiveIndex] === "neutral"
              ? [1, 1, 1]
              : laneRgbColors[0],
          alpha: 0.35,
          ghost: true,
          tint: primitiveRoles.note[primitiveIndex] === "tinted",
        }),
      );
      this.threeScene.add(this.ghostGem.object);
      this.assetsReady = true;
      this.render();
    } catch (error) {
      console.error("Circular highway assets failed to load", error);
    }
  }

  private createFretboard(): void {
    const boardCenterZ = (nearBoardZ + farBoardZ) / 2;
    const boardDepth = nearBoardZ - farBoardZ;
    const board = new THREE.Mesh(
      new THREE.BoxGeometry(6.5, 0.3, boardDepth),
      new THREE.MeshBasicMaterial({ color: 0x1f2937 }),
    );
    board.position.set(0, -0.25, boardCenterZ);
    board.renderOrder = 0;
    this.threeScene.add(board);

    for (let lane = 0; lane <= laneCount; lane++) {
      const divider = new THREE.Mesh(
        new THREE.BoxGeometry(0.05, 0.08, boardDepth),
        new THREE.MeshBasicMaterial({ color: 0x64748b }),
      );
      divider.position.set(-3 + (6 * lane) / laneCount, -0.05, boardCenterZ);
      divider.renderOrder = 2;
      this.threeScene.add(divider);
    }
    const strike = new THREE.Mesh(
      new THREE.BoxGeometry(6, 0.03, 0.12),
      new THREE.MeshBasicMaterial({ color: 0xf8fafc }),
    );
    strike.position.set(0, -0.04, strikeLineZ);
    strike.renderOrder = 3;
    this.threeScene.add(strike);
  }

  private createBeatLineInstance(): void {
    for (let index = 0; index < instanceSizeBeatLines; index++) {
      const material = new THREE.MeshBasicMaterial({ color: 0x64748b });
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(6, 0.016, 1), material);
      mesh.visible = false;
      mesh.renderOrder = 3;
      this.threeScene.add(mesh);
      this.beatLineInstance.push({ mesh, material });
    }
  }

  private createPhraseSpanInstances(): void {
    for (let index = 0; index < instanceSizePhraseSpans; index++) {
      const mesh = new THREE.Mesh(
        this.phraseSpanGeometry,
        this.starpowerMaterial,
      );
      mesh.visible = false;
      mesh.renderOrder = 4;
      this.threeScene.add(mesh);
      this.phraseSpanInstances.push(mesh);
    }
  }

  private drawPhraseSpans(chart: ChartView): void {
    const track = chart.getTrack().getMidiTrack();
    const descriptor = chart
      .getSong()
      .getTrackDescriptors()
      .find((item) => item.key === chart.getTrack().getKey());
    if (!track || !descriptor) {
      this.hidePhraseSpans();
      return;
    }

    const visibleStart = Math.max(0, this.getTickAtDepth(nearBoardZ));
    const visibleEnd = this.getTickAtDepth(farBoardZ);
    const phrases: Array<{
      start: number;
      end: number;
      kind: EditablePhraseKind;
      noteOn: MidiChannelEvent | null;
    }> = (["starpower", "solo"] as const).flatMap((kind) => {
      const pitch = getPhrasePitch(descriptor, kind);
      return pitch === null
        ? []
        : getNotePhrases(track, pitch, kind)
            .filter(
              (phrase) =>
                phrase.end >= visibleStart && phrase.start <= visibleEnd,
            )
            .map(({ start, end, note }) => ({
              start,
              end,
              kind,
              noteOn: note.noteOn,
            }));
    });
    if (this.phraseDrag) {
      phrases.push({
        kind: this.phraseDrag.kind,
        start: Math.min(this.phraseDrag.startTick, this.phraseDrag.endTick),
        end: Math.max(this.phraseDrag.startTick, this.phraseDrag.endTick),
        noteOn: this.phraseDrag.note?.noteOn ?? null,
      });
    }

    let index = 0;
    for (const phrase of phrases) {
      const mesh = this.phraseSpanInstances[index++];
      if (!mesh) break;
      const start = Math.max(visibleStart, phrase.start);
      const end = Math.min(visibleEnd, phrase.end);
      const startZ = this.getNoteZ(start);
      const endZ = this.getNoteZ(end);
      mesh.position.set(0, -0.045, (startZ + endZ) / 2);
      mesh.scale.z = Math.max(0.03, Math.abs(startZ - endZ));
      mesh.material =
        phrase.noteOn === this.selectedPhraseNoteOn
          ? this.selectedPhraseMaterial
          : phrase.kind === "starpower"
            ? this.starpowerMaterial
            : this.soloMaterial;
      mesh.visible = true;
    }
    for (; index < this.phraseSpanInstances.length; index++) {
      this.phraseSpanInstances[index].visible = false;
    }
  }

  private hidePhraseSpans(): void {
    this.phraseSpanInstances.forEach((mesh) => (mesh.visible = false));
  }

  private drawSectionMarkers(chart: ChartView): void {
    const track = chart.getTrack().getMidiTrack();
    if (!track) {
      this.hideSectionMarkers();
      return;
    }

    const sections = extractSections(track);
    const markersChanged =
      sections.length !== this.sectionMarkers.length ||
      sections.some(
        (section, index) =>
          section.tick !== this.sectionMarkers[index]?.tick ||
          section.name !== this.sectionMarkers[index]?.name,
      );
    if (markersChanged) {
      this.disposeSectionMarkers();
      for (const section of sections) this.createSectionMarker(section);
    }

    const visibleStart = Math.max(0, this.getTickAtDepth(nearBoardZ));
    const visibleEnd = this.getTickAtDepth(farBoardZ);
    for (const marker of this.sectionMarkers) {
      const visible = marker.tick >= visibleStart && marker.tick <= visibleEnd;
      const z = this.getNoteZ(marker.tick);
      marker.line.position.set(0, -0.035, z);
      marker.label.position.set(-2.35, 0.2, z);
      marker.line.visible = visible;
      marker.label.visible = visible;
    }
  }

  private createSectionMarker(section: { name: string; tick: number }): void {
    const line = new THREE.Mesh(
      new THREE.BoxGeometry(6, 0.012, 0.035),
      new THREE.MeshBasicMaterial({
        color: 0xe2e8f0,
        transparent: true,
        opacity: 0.7,
      }),
    );
    line.renderOrder = 5;
    this.threeScene.add(line);

    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 64;
    const context = canvas.getContext("2d");
    if (context) {
      context.fillStyle = "rgba(15, 23, 42, 0.88)";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.fillStyle = "#f8fafc";
      context.font = "bold 26px sans-serif";
      context.textBaseline = "middle";
      context.fillText(section.name, 14, canvas.height / 2, canvas.width - 28);
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const label = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        depthTest: false,
      }),
    );
    label.scale.set(3.2, 0.4, 1);
    label.renderOrder = 6;
    this.threeScene.add(label);
    this.sectionMarkers.push({ ...section, line, label });
  }

  private hideSectionMarkers(): void {
    this.sectionMarkers.forEach(({ line, label }) => {
      line.visible = false;
      label.visible = false;
    });
  }

  private disposeSectionMarkers(): void {
    this.sectionMarkers.forEach(({ line, label }) => {
      line.geometry.dispose();
      (line.material as THREE.Material).dispose();
      const material = label.material as THREE.SpriteMaterial;
      material.map?.dispose();
      material.dispose();
      line.removeFromParent();
      label.removeFromParent();
    });
    this.sectionMarkers.length = 0;
  }

  private drawBeatLines(): void {
    const ppqn = Math.max(1, this.getPpqn());
    const minTick = Math.max(0, this.playheadTick - Math.floor(ppqn * 2));
    const maxTick =
      this.playheadTick + Math.ceil(ppqn * (visibleQuarterNotes + 2));
    const startQuarterTick = Math.ceil(minTick / ppqn) * ppqn;
    let instanceIndex = 0;
    for (let tick = startQuarterTick; tick <= maxTick; tick += ppqn) {
      const z = this.getNoteZ(tick);
      if (z < farBoardZ || z > nearBoardZ) continue;
      const instanced = this.beatLineInstance[instanceIndex++];
      if (!instanced) break;
      const q = Math.round(tick / ppqn);
      const thicknessZ = q % 4 === 0 ? 0.07 : q % 2 === 0 ? 0.045 : 0.025;
      instanced.material.color.setHex(
        q % 4 === 0 ? 0xf1f5f9 : q % 2 === 0 ? 0x94a3b8 : 0x64748b,
      );
      instanced.mesh.position.set(0, -0.065, z);
      instanced.mesh.scale.z = thicknessZ;
      instanced.mesh.visible = true;
    }
    for (
      let index = instanceIndex;
      index < this.beatLineInstance.length;
      index++
    ) {
      this.beatLineInstance[index].mesh.visible = false;
    }
  }

  private acquireGem(
    key: MidiChannelEvent,
    used: Set<InstancedNote>,
  ): InstancedNote | null {
    const existing = this.gemBindings.get(key);
    if (existing) return existing;
    const bound = new Set(this.gemBindings.values());
    const candidate = this.gemInstances
      .flat()
      .find((item) => !bound.has(item) && !used.has(item));
    if (!candidate) return null;
    this.gemBindings.set(key, candidate);
    return candidate;
  }

  private acquireTail(
    key: MidiChannelEvent,
    used: Set<InstancedTail>,
  ): InstancedTail | null {
    const existing = this.tailBindings.get(key);
    if (existing) return existing;
    const bound = new Set(this.tailBindings.values());
    const candidate = this.tailInstances
      .flat()
      .find((item) => !bound.has(item) && !used.has(item));
    if (!candidate) return null;
    this.tailBindings.set(key, candidate);
    return candidate;
  }

  private releaseUnusedBindings<T>(
    bindings: Map<MidiChannelEvent, T>,
    used: Set<T>,
    hide: (item: T) => void,
  ): void {
    for (const [key, item] of bindings) {
      if (used.has(item)) continue;
      hide(item);
      bindings.delete(key);
    }
  }

  private hideAllObjects(): void {
    this.gemInstances.flat().forEach(({ object }) => (object.visible = false));
    this.tailInstances.flat().forEach(({ mesh }) => (mesh.visible = false));
    this.previewTailInstances
      .flat()
      .forEach(({ mesh }) => (mesh.visible = false));
    this.beatLineInstance.forEach(({ mesh }) => (mesh.visible = false));
    this.sustainCutPreviewLine.visible = false;
    if (this.ghostGem) this.ghostGem.object.visible = false;
    this.gemBindings.clear();
    this.tailBindings.clear();
  }

  private getSustainCutPreview(
    chart: ChartView,
  ): Map<MidiChannelEvent, MidiNote> {
    const location = this.ghostNoteLocation;
    if (!location || !this.canShowNotePlacementPreview()) {
      return new Map();
    }
    const sameLanePlacement =
      location.sustainHit !== null &&
      location.sustainHit.note - chart.getOffset() === location.lane;
    const targets = getSustainCutTargets(
      chart.getNotes(),
      location.tick,
      location.shiftKey,
      location.sustainHit?.noteOn ?? null,
      sameLanePlacement,
    );
    return new Map(targets.map((note) => [note.noteOn, note]));
  }

  private updateSustainCutPreviewLine(tick: number | null): void {
    if (tick === null || !this.canShowNotePlacementPreview()) {
      this.sustainCutPreviewLine.visible = false;
      return;
    }
    this.sustainCutPreviewLine.position.set(0, -0.005, this.getNoteZ(tick));
    this.sustainCutPreviewLine.visible = true;
  }

  private drawSustainCutPreviewRemainders(
    chart: ChartView,
    cutPreview: Map<MidiChannelEvent, MidiNote>,
    visibleStart: number,
    visibleEnd: number,
  ): number {
    this.previewTailInstances
      .flat()
      .forEach(({ mesh }) => (mesh.visible = false));
    const usedByLane = Array<number>(laneCount).fill(0);
    let used = 0;
    const cutTick = this.ghostNoteLocation?.tick;
    if (cutTick === undefined) return used;

    for (const note of cutPreview.values()) {
      const lane = note.note - chart.getOffset();
      if (lane < 0 || lane >= laneCount) continue;
      const start = Math.max(note.start, visibleStart, cutTick);
      const end = Math.min(note.end, visibleEnd);
      if (end <= start) continue;
      const instance = this.previewTailInstances[lane]?.[usedByLane[lane]++];
      if (!instance) continue;
      const transform = sustainWorldTransform(
        this.getLaneX(lane),
        this.getNoteZ(start),
        this.getNoteZ(end),
      );
      instance.mesh.position.set(
        transform.position.x,
        transform.position.y,
        transform.position.z,
      );
      instance.mesh.scale.set(
        transform.scale.x,
        transform.scale.y,
        transform.scale.z,
      );
      instance.mesh.renderOrder = 11;
      instance.mesh.visible = true;
      setMaterialState(instance.mesh, {
        baseColor: laneRgbColors[lane],
        emissionColor: laneRgbColors[lane],
        emissionIntensity: 0.25,
        alpha: 0.18,
        ghost: true,
        selected: false,
        passed: false,
        useStrikeLine: true,
        strikeLineZ,
      });
      used++;
    }
    return used;
  }

  private getEffectiveNoteCalibration(): ModelCalibration {
    return scaleNoteCalibration(this.noteCalibration, this.noteSizeDebugState);
  }

  private applyNoteCalibrationToInstances(): void {
    const calibration = this.getEffectiveNoteCalibration();
    this.gemInstances
      .flat()
      .forEach(({ object }) => applyModelCalibration(object, calibration));
    if (this.ghostGem) applyModelCalibration(this.ghostGem.object, calibration);
  }

  private drawGhostGem(): void {
    if (!this.ghostGem) return;
    const location = this.ghostNoteLocation;
    if (!location || !this.canShowNotePlacementPreview()) {
      this.ghostGem.object.visible = false;
      return;
    }
    const distance = (location.tick - this.playheadTick) / this.getPpqn();
    const position = noteWorldPosition(
      this.getLaneX(location.lane),
      strikeLineZ - distance * 3,
      this.getEffectiveNoteCalibration(),
    );
    this.ghostGem.object.position.set(position.x, position.y, position.z);
    this.ghostGem.object.renderOrder = 30;
    this.ghostGem.object.visible = true;
  }

  private canShowNotePlacementPreview(): boolean {
    return (
      this.canEditNotes &&
      !this.drag &&
      !this.phraseMode &&
      this.tool === "place"
    );
  }

  private drawHoverOutline(chart: ChartView): void {
    const note = this.hoveredNoteOn
      ? chart.getNotes().find((value) => value.noteOn === this.hoveredNoteOn)
      : null;
    if (!note) {
      this.hoverOutline.visible = false;
      return;
    }
    const lane = note.note - chart.getOffset();
    const bounds = this.getGemScreenBounds(note, lane);
    if (!bounds) {
      this.hoverOutline.visible = false;
      return;
    }
    const corners = [
      this.screenToWorld(bounds.left, bounds.top),
      this.screenToWorld(bounds.right, bounds.top),
      this.screenToWorld(bounds.right, bounds.bottom),
      this.screenToWorld(bounds.left, bounds.bottom),
    ].filter((value): value is THREE.Vector3 => value !== null);
    if (corners.length !== 4) return;
    this.hoverOutline.geometry.dispose();
    this.hoverOutline.geometry = new THREE.BufferGeometry().setFromPoints(
      corners,
    );
    this.hoverOutline.visible = true;
  }

  private readonly handleClick = (event: MouseEvent): void => {
    if (event.button !== 0) return;
    if (!this.canEditNotes) {
      this.suppressNextClick = false;
      return;
    }
    if (this.suppressNextClick) {
      this.suppressNextClick = false;
      return;
    }
    if (this.tool !== "place") return;
    const chart = this.getCurrentChart();
    const location = this.getChartLocation(event);
    if (!chart || !location) return;
    this.placeNoteAt(
      chart,
      location.lane as Note,
      location.tick,
      event.shiftKey || event.altKey,
    );
    this.onNotesChanged?.();
    this.render();
  };

  private readonly handleContextMenu = (event: MouseEvent): void => {
    event.preventDefault();
    this.canvas?.focus();
  };

  private readonly handlePointerDown = (event: PointerEvent): void => {
    if (!this.canEditNotes || (event.button !== 0 && event.button !== 2))
      return;
    const chart = this.getCurrentChart();
    const location = this.getChartLocation(event);
    if (!chart || !location) return;
    const sustainHit = this.getSustainAt(chart, event, location.tick) ?? null;
    const note = sustainHit ?? this.getNoteAt(chart, event);
    this.updateCanvasCursor(note !== undefined, event);
    if (this.phraseMode && event.button === 0) {
      event.preventDefault();
      this.canvas?.focus();
      this.suppressNextClick = true;
      const existingPhrase = this.getPhraseAt(chart, event, this.phraseMode);
      if (existingPhrase) {
        const operation = this.getPhraseDragOperation(
          existingPhrase,
          location.tick,
        );
        this.selectedPhraseNoteOn = existingPhrase.note.noteOn;
        this.phraseDrag = {
          pointerId: event.pointerId,
          kind: this.phraseMode,
          startTick: existingPhrase.start,
          endTick: existingPhrase.end,
          pointerTick: location.tick,
          initialStartTick: existingPhrase.start,
          initialEndTick: existingPhrase.end,
          operation,
          note: existingPhrase.note,
        };
      } else {
        this.selectedPhraseNoteOn = null;
        this.phraseDrag = {
          pointerId: event.pointerId,
          kind: this.phraseMode,
          startTick: location.tick,
          endTick: location.tick,
          pointerTick: location.tick,
          initialStartTick: location.tick,
          initialEndTick: location.tick,
          operation: "create",
          note: null,
        };
      }
      this.canvas?.setPointerCapture(event.pointerId);
      this.render();
      return;
    }
    if (this.tool === "place") return;
    if (this.tool === "remove") {
      if (event.button !== 0) return;
      event.preventDefault();
      this.canvas?.focus();
      this.suppressNextClick = true;
      if (note && chart.removeNote(note)) {
        this.selectedNoteOns.delete(note.noteOn);
        this.onNotesChanged?.();
      }
      this.render();
      return;
    }
    if (!note) {
      if (event.button !== 0) return;
      const point = this.getCanvasPoint(event);
      if (!point) return;
      this.canvas?.focus();
      this.marqueeDrag = {
        pointerId: event.pointerId,
        startX: point.x,
        startY: point.y,
        currentX: point.x,
        currentY: point.y,
        additive: event.shiftKey || event.ctrlKey || event.metaKey,
        moved: false,
      };
      this.suppressNextClick = true;
      this.canvas?.setPointerCapture(event.pointerId);
      this.marqueeOutline.visible = false;
      this.render();
      return;
    }
    event.preventDefault();
    this.canvas?.focus();
    this.suppressNextClick = event.button === 0;
    const chartNotes = chart.getNotes();
    const chord = chartNotes.filter(
      (candidate) => candidate.start === note.start,
    );
    const chordNoteOns = chord.map((candidate) => candidate.noteOn);
    if (event.button === 0) {
      if ((event.shiftKey || event.ctrlKey || event.metaKey) && !sustainHit) {
        const shouldRemove = chordNoteOns.every((noteOn) =>
          this.selectedNoteOns.has(noteOn),
        );
        chordNoteOns.forEach((noteOn) =>
          shouldRemove
            ? this.selectedNoteOns.delete(noteOn)
            : this.selectedNoteOns.add(noteOn),
        );
        if (shouldRemove) {
          this.render();
          return;
        }
      } else if (
        !event.shiftKey &&
        !event.ctrlKey &&
        !event.metaKey &&
        !this.selectedNoteOns.has(note.noteOn)
      ) {
        this.selectedNoteOns = new Set(chordNoteOns);
      }
    } else {
      this.selectedNoteOns = new Set(chordNoteOns);
    }
    this.ghostNoteLocation = null;
    const selectedTargets = chartNotes.filter((candidate) =>
      this.selectedNoteOns.has(candidate.noteOn),
    );
    const resizeChord = event.button === 2;
    const targets = (resizeChord ? chord : selectedTargets).map(
      (candidate) => ({
        noteOn: candidate.noteOn,
        initialTick: candidate.start,
        initialLane: candidate.note - chart.getOffset(),
      }),
    );
    this.drag = {
      pointerId: event.pointerId,
      button: event.button as 0 | 2,
      shiftKey: event.shiftKey,
      moved: false,
      sustainHit,
      noteOn: note.noteOn,
      noteOns: targets.map((target) => target.noteOn),
      targets,
      initialLane: note.note - chart.getOffset(),
      initialTick: note.start,
      pointerLane: location.lane,
      pointerTick: location.tick,
      resizing: resizeChord,
      changed: false,
    };
    this.canvas?.setPointerCapture(event.pointerId);
    this.render();
  };

  private readonly handlePointerMove = (event: PointerEvent): void => {
    if (this.phraseDrag?.pointerId === event.pointerId) {
      const location = this.getChartLocation(event);
      if (location) {
        const phraseDrag = this.phraseDrag;
        this.canvas!.style.cursor =
          phraseDrag.operation === "move"
            ? "grabbing"
            : phraseDrag.operation === "create"
              ? "default"
              : "ns-resize";
        if (phraseDrag.operation === "create") {
          phraseDrag.endTick = location.tick;
        } else if (phraseDrag.operation === "move") {
          const start = this.snapTick(
            phraseDrag.initialStartTick +
              location.tick -
              phraseDrag.pointerTick,
          );
          const duration =
            phraseDrag.initialEndTick - phraseDrag.initialStartTick;
          phraseDrag.startTick = start;
          phraseDrag.endTick = start + duration;
        } else if (phraseDrag.operation === "resize-start") {
          phraseDrag.startTick = Math.min(
            phraseDrag.initialEndTick - 1,
            location.tick,
          );
        } else {
          phraseDrag.endTick = Math.max(
            phraseDrag.initialStartTick + 1,
            location.tick,
          );
        }
        this.render();
      }
      return;
    }
    if (this.marqueeDrag?.pointerId === event.pointerId) {
      const point = this.getCanvasPoint(event);
      if (point) {
        const marquee = this.marqueeDrag;
        marquee.currentX = point.x;
        marquee.currentY = point.y;
        marquee.moved ||=
          Math.hypot(
            marquee.currentX - marquee.startX,
            marquee.currentY - marquee.startY,
          ) >= 4;
        if (marquee.moved) {
          this.suppressNextClick = true;
          if (this.canvas) this.canvas.style.cursor = "crosshair";
          this.updateMarqueeOutline(marquee);
        }
        this.render();
      }
      return;
    }

    const drag = this.drag;
    if (!drag || drag.pointerId !== event.pointerId) {
      this.updateHoveredNote(event);
      this.updateGhostLocation(event);
      return;
    }
    this.ghostNoteLocation = null;
    const chart = this.getCurrentChart();
    const location = this.getChartLocation(event);
    const anchor = chart
      ?.getNotes()
      .find((note) => note.noteOn === drag.noteOn);
    if (!chart || !location || !anchor) return;

    drag.moved ||=
      location.tick !== drag.pointerTick || location.lane !== drag.pointerLane;
    const chartNotes = chart.getNotes();
    const otherNoteStarts = chartNotes
      .filter((note) => !drag.noteOns.includes(note.noteOn))
      .map((note) => note.start);
    let changed = false;
    for (const target of drag.targets) {
      const candidate = chartNotes.find(
        (note) => note.noteOn === target.noteOn,
      );
      if (!candidate) continue;
      const dragTarget = getHighwayDragTarget(
        target.initialTick,
        target.initialLane,
        location.tick - drag.pointerTick,
        location.lane - drag.pointerLane,
        this.getSnapTicks(),
        this.state.snap.enabled,
        laneCount,
      );
      if (drag.resizing) {
        const nextEnd = getHighwaySustainEnd(
          candidate.start,
          location.tick,
          otherNoteStarts,
          event.shiftKey || event.altKey,
        );
        if (nextEnd !== candidate.end) {
          changed = chart.setNoteEnd(candidate, nextEnd) || changed;
        }
      } else {
        changed =
          chart.moveNote(candidate, dragTarget.lane as Note, dragTarget.tick) ||
          changed;
      }
    }
    drag.changed ||= changed;
    if (changed) this.render();
  };

  private readonly handlePointerLeave = (): void => {
    this.hoveredNoteOn = null;
    this.ghostNoteLocation = null;
    this.hoverOutline.visible = false;
    if (this.canvas) this.canvas.style.cursor = "default";
    this.render();
  };

  private readonly handlePointerUp = (event: PointerEvent): void => {
    const marquee = this.marqueeDrag;
    if (marquee?.pointerId === event.pointerId) {
      this.canvas?.releasePointerCapture(event.pointerId);
      this.marqueeDrag = null;
      if (marquee.moved) {
        const bounds: ScreenBounds = {
          left: Math.min(marquee.startX, marquee.currentX),
          right: Math.max(marquee.startX, marquee.currentX),
          top: Math.min(marquee.startY, marquee.currentY),
          bottom: Math.max(marquee.startY, marquee.currentY),
        };
        const chart = this.getCurrentChart();
        const selected = new Set(
          (chart?.getNotes() ?? [])
            .filter((note) => {
              const noteBounds = this.getGemScreenBounds(
                note,
                note.note - (chart?.getOffset() ?? 0),
              );
              return (
                noteBounds !== null &&
                noteBounds.right >= bounds.left &&
                noteBounds.left <= bounds.right &&
                noteBounds.bottom >= bounds.top &&
                noteBounds.top <= bounds.bottom
              );
            })
            .map((note) => note.noteOn),
        );
        this.selectedNoteOns = marquee.additive
          ? new Set([...this.selectedNoteOns, ...selected])
          : selected;
      } else if (!marquee.additive) {
        this.selectedNoteOns.clear();
      }
      this.marqueeOutline.visible = false;
      this.updateCanvasCursor(false, event);
      this.render();
      return;
    }

    const phraseDrag = this.phraseDrag;
    if (phraseDrag?.pointerId === event.pointerId) {
      this.canvas?.releasePointerCapture(event.pointerId);
      this.phraseDrag = null;
      const chart = this.getCurrentChart();
      if (chart) {
        const descriptor = chart
          .getSong()
          .getTrackDescriptors()
          .find((item) => item.key === chart.getTrack().getKey());
        const pitch = descriptor
          ? getPhrasePitch(descriptor, phraseDrag.kind)
          : null;
        const track = chart
          .getSong()
          .ensureMidiTrack(chart.getTrack().getKey());
        if (track && pitch !== null) {
          const start = Math.min(phraseDrag.startTick, phraseDrag.endTick);
          const end = Math.max(phraseDrag.startTick, phraseDrag.endTick);
          const finalEnd = Math.max(start + 1, end);
          const changed = phraseDrag.note
            ? (start !== phraseDrag.initialStartTick ||
                finalEnd !== phraseDrag.initialEndTick) &&
              updateNotePhrase(track, phraseDrag.note, start, finalEnd)
            : addNotePhrase(track, pitch, phraseDrag.kind, start, finalEnd) !==
              null;
          if (changed) this.onNotesChanged?.();
        }
      }
      this.updateCanvasCursor(false, event);
      this.render();
      return;
    }

    const drag = this.drag;
    if (!drag || drag.pointerId !== event.pointerId) return;
    this.canvas?.releasePointerCapture(event.pointerId);
    this.drag = null;
    let changed = drag.changed;
    if (!drag.moved && drag.sustainHit) {
      const chart = this.getCurrentChart();
      if (chart && drag.button === 0) {
        const lane = drag.sustainHit.note - chart.getOffset();
        this.placeNoteAt(
          chart,
          lane as Note,
          drag.pointerTick,
          drag.shiftKey || event.altKey,
          drag.sustainHit,
        );
        changed = true;
      } else if (chart) {
        changed =
          this.cutSustainsAtTick(
            chart,
            drag.pointerTick,
            drag.shiftKey || event.altKey,
            drag.sustainHit,
          ) || changed;
      }
    }
    if (changed) this.onNotesChanged?.();
    if (drag.button === 2 && event.button === 2) {
      this.suppressNextClick = false;
    }
  };

  private readonly handleWheel = (event: WheelEvent): void => {
    event.preventDefault();
    const nextTick = getHighwayWheelTick(
      this.playheadTick,
      -event.deltaY,
      this.getPpqn(),
      wheelTicksPerPixel,
    );
    this.setPlayheadTick(nextTick);
    this.onSeekRequest?.(nextTick);
  };

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (!this.canEditNotes || event.target !== this.canvas) return;
    const key = event.key.toLowerCase();
    if ((event.ctrlKey || event.metaKey) && !event.altKey) {
      if (key === "c") this.copySelection();
      else if (key === "x") this.cutSelection();
      else if (key === "v") this.pasteClipboard();
      else return;
      event.preventDefault();
      return;
    }
    if (event.ctrlKey || event.metaKey) return;
    const chart = this.getCurrentChart();
    if (!chart) return;
    if (
      event.altKey &&
      (event.key === "ArrowUp" || event.key === "ArrowDown")
    ) {
      event.preventDefault();
      const track = chart.getTrack().getMidiTrack();
      const section = track
        ? findSection(
            track,
            this.playheadTick,
            event.key === "ArrowUp" ? 1 : -1,
          )
        : null;
      if (section) this.onSeekRequest?.(section.tick);
      return;
    }
    if (event.altKey) return;
    if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      if (this.phraseMode) {
        const track = chart.getTrack().getMidiTrack();
        const phrase = track
          ?.getNotes()
          .find((note) => note.noteOn === this.selectedPhraseNoteOn);
        const changed =
          phrase && track
            ? track.removeNote(phrase.noteOn, phrase.noteOff)
            : false;
        this.selectedPhraseNoteOn = null;
        if (changed) this.onNotesChanged?.();
        this.render();
        return;
      }
      let changed = false;
      const selectedNotes = chart
        .getNotes()
        .filter((note) => this.selectedNoteOns.has(note.noteOn));
      for (const note of selectedNotes) {
        changed = chart.removeNote(note) || changed;
      }
      this.selectedNoteOns.clear();
      if (changed) this.onNotesChanged?.();
      this.render();
      return;
    }
    const snap = this.getSnapTicks();
    if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      event.preventDefault();
      this.onSeekRequest?.(
        getHighwaySteppedTick(
          this.playheadTick,
          event.key === "ArrowUp" ? 1 : -1,
          snap,
          this.state.snap.enabled,
        ),
      );
      return;
    }
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      const next = getHighwaySnapDenominator(
        this.state.snap.denominator,
        event.key === "ArrowLeft" ? -1 : 1,
        SnapDenominators,
      );
      this.onSnapDenominatorChange?.(next);
      return;
    }
    if (/^[1-5]$/.test(event.key)) {
      event.preventDefault();
      const lane = Number(event.key) - 1;
      const note = chart
        .getNotes()
        .find(
          (candidate) =>
            candidate.start === this.playheadTick &&
            candidate.note - chart.getOffset() === lane,
        );
      if (note) chart.removeNote(note);
      else
        this.placeNoteAt(
          chart,
          lane as Note,
          this.playheadTick,
          event.shiftKey,
        );
      this.onNotesChanged?.();
      this.render();
      return;
    }
    if (event.key === "[" || event.key === "]") {
      const track = chart.getTrack().getMidiTrack();
      const section = track
        ? findSection(track, this.playheadTick, event.key === "]" ? 1 : -1)
        : null;
      if (section) this.onSeekRequest?.(section.tick);
    }
  };

  private updateHoveredNote(event: PointerEvent): void {
    const chart = this.getCurrentChart();
    const note = chart ? this.getNoteAt(chart, event) : undefined;
    const next = note?.noteOn ?? null;
    this.updateCanvasCursor(note !== undefined, event);
    if (next === this.hoveredNoteOn) return;
    this.hoveredNoteOn = next;
    this.render();
  }

  private updateCanvasCursor(
    hoveringNote: boolean,
    event?: PointerEvent,
  ): void {
    if (!this.canvas) return;
    if (!this.canEditNotes) {
      this.canvas.style.cursor = "default";
      return;
    }
    if (this.phraseMode) {
      const chart = event ? this.getCurrentChart() : null;
      const location = event ? this.getChartLocation(event) : null;
      const phrase =
        chart && event ? this.getPhraseAt(chart, event, this.phraseMode) : null;
      if (phrase && location) {
        const operation = this.getPhraseDragOperation(phrase, location.tick);
        const isDragging = Boolean(event && event.buttons & 1);
        this.canvas.style.cursor =
          operation === "move"
            ? isDragging
              ? "grabbing"
              : "grab"
            : "ns-resize";
      } else {
        this.canvas.style.cursor = "default";
      }
      return;
    }
    if (hoveringNote && this.tool === "select" && event?.buttons) {
      this.canvas.style.cursor = event.buttons & 2 ? "ns-resize" : "grabbing";
      return;
    }
    switch (this.tool) {
      case "select":
        this.canvas.style.cursor = hoveringNote ? "grab" : "default";
        break;
      case "place":
        this.canvas.style.cursor = "default";
        break;
      case "remove":
        this.canvas.style.cursor = hoveringNote ? "pointer" : "default";
        break;
    }
  }

  private updateGhostLocation(event: PointerEvent): void {
    if (!this.canEditNotes) {
      this.ghostNoteLocation = null;
      return;
    }
    const chart = this.getCurrentChart();
    const location = chart ? this.getChartLocation(event) : null;
    this.ghostNoteLocation = location
      ? {
          ...location,
          shiftKey: event.shiftKey || event.altKey,
          sustainHit: this.getSustainAt(chart!, event, location.tick) ?? null,
        }
      : null;
    this.render();
  }

  private readonly handleModifierKey = (event: KeyboardEvent): void => {
    if (
      (event.key !== "Shift" && event.key !== "Alt") ||
      !this.ghostNoteLocation
    )
      return;
    const allowSustainOverlap = event.shiftKey || event.altKey;
    if (this.ghostNoteLocation.shiftKey === allowSustainOverlap) return;
    this.ghostNoteLocation = {
      ...this.ghostNoteLocation,
      shiftKey: allowSustainOverlap,
    };
    this.render();
  };

  private getCurrentChart(): ChartView | null {
    return this.state.midi ? this.getActiveChart(this.state.midi) : null;
  }

  private placeNoteAt(
    chart: ChartView,
    lane: Note,
    tick: number,
    shiftKey: boolean,
    preferredSustain: MidiNote | null = null,
  ): void {
    const sameLanePlacement =
      preferredSustain !== null &&
      preferredSustain.note - chart.getOffset() === lane;
    this.cutSustainsAtTick(
      chart,
      tick,
      shiftKey,
      preferredSustain,
      sameLanePlacement,
    );
    chart.addNote(lane, tick, tick + minimumMidiNoteDurationTicks);
  }

  private cutSustainsAtTick(
    chart: ChartView,
    tick: number,
    shiftKey: boolean,
    preferredSustain: MidiNote | null = null,
    sameLanePlacement = false,
  ): boolean {
    const targets = getSustainCutTargets(
      chart.getNotes(),
      tick,
      shiftKey,
      preferredSustain?.noteOn ?? null,
      sameLanePlacement,
    );
    let changed = false;
    for (const note of targets) {
      changed = chart.setNoteEnd(note, tick) || changed;
    }
    return changed;
  }

  private getNoteAt(chart: ChartView, event: MouseEvent): MidiNote | undefined {
    const pointer = this.getCanvasPoint(event);
    if (!pointer) return undefined;
    let hit: MidiNote | undefined;
    let nearestDepth = Infinity;
    for (const note of chart.getNotes()) {
      const lane = note.note - chart.getOffset();
      const gemBounds = this.getGemScreenBounds(note, lane);
      const tailBounds = this.getTailScreenBounds(note, lane);
      if (
        (!gemBounds ||
          !this.containsScreenPoint(gemBounds, pointer.x, pointer.y)) &&
        (!tailBounds ||
          !this.containsScreenPoint(tailBounds, pointer.x, pointer.y))
      ) {
        continue;
      }
      const depth = note.start - this.playheadTick;
      if (depth < nearestDepth) {
        hit = note;
        nearestDepth = depth;
      }
    }
    return hit;
  }

  private getSustainAt(
    chart: ChartView,
    event: MouseEvent,
    tick: number,
  ): MidiNote | undefined {
    const pointer = this.getCanvasPoint(event);
    if (!pointer) return undefined;
    let hit: MidiNote | undefined;
    let nearestDepth = Infinity;
    for (const note of chart.getNotes()) {
      if (tick <= note.start || tick >= note.end) continue;
      const bounds = this.getTailScreenBounds(
        note,
        note.note - chart.getOffset(),
      );
      if (!bounds || !this.containsScreenPoint(bounds, pointer.x, pointer.y)) {
        continue;
      }
      const depth = note.start - this.playheadTick;
      if (depth < nearestDepth) {
        hit = note;
        nearestDepth = depth;
      }
    }
    return hit;
  }

  private getPhraseAt(
    chart: ChartView,
    event: MouseEvent,
    kind: EditablePhraseKind,
  ): MidiNotePhrase | undefined {
    const point = this.getCanvasPoint(event);
    const track = chart.getTrack().getMidiTrack();
    const descriptor = chart
      .getSong()
      .getTrackDescriptors()
      .find((item) => item.key === chart.getTrack().getKey());
    const pitch = descriptor ? getPhrasePitch(descriptor, kind) : null;
    if (!point || !track || pitch === null) return undefined;
    return getNotePhrases(track, pitch, kind).find((phrase) => {
      const bounds = this.getPhraseScreenBounds(phrase);
      return bounds && this.containsScreenPoint(bounds, point.x, point.y);
    });
  }

  private getPhraseDragOperation(
    phrase: MidiNotePhrase,
    tick: number,
  ): PhraseDragState["operation"] {
    const distanceToStart = Math.abs(tick - phrase.start);
    const distanceToEnd = Math.abs(tick - phrase.end);
    const edgeThreshold = this.getSnapTicks() * 2;
    return Math.min(distanceToStart, distanceToEnd) > edgeThreshold
      ? "move"
      : distanceToStart <= distanceToEnd
        ? "resize-start"
        : "resize-end";
  }

  private getPhraseScreenBounds(phrase: MidiNotePhrase): ScreenBounds | null {
    const points = [
      new THREE.Vector3(-3, -0.035, this.getNoteZ(phrase.start)),
      new THREE.Vector3(3, -0.035, this.getNoteZ(phrase.start)),
      new THREE.Vector3(-3, -0.035, this.getNoteZ(phrase.end)),
      new THREE.Vector3(3, -0.035, this.getNoteZ(phrase.end)),
    ]
      .map((point) => this.worldToScreen(point))
      .filter((value): value is THREE.Vector2 => value !== null);
    if (points.length === 0) return null;
    return {
      left: Math.min(...points.map((point) => point.x)),
      right: Math.max(...points.map((point) => point.x)),
      top: Math.min(...points.map((point) => point.y)) - 8,
      bottom: Math.max(...points.map((point) => point.y)) + 8,
    };
  }

  private getGemScreenBounds(
    note: MidiNote,
    lane: number,
  ): ScreenBounds | null {
    if (lane < 0 || lane >= laneCount) return null;
    const distance = (note.start - this.playheadTick) / this.getPpqn();
    const calibration = this.getEffectiveNoteCalibration();
    const position = noteWorldPosition(
      this.getLaneX(lane),
      strikeLineZ - distance * 3,
      calibration,
    );
    const corners: THREE.Vector3[] = [];
    for (const xSign of [-1, 1]) {
      for (const ySign of [-1, 1]) {
        for (const zSign of [-1, 1]) {
          corners.push(
            new THREE.Vector3(
              position.x + (xSign * calibration.width) / 2,
              position.y + ySign * Math.max(0.1, calibration.height / 2),
              position.z + zSign * Math.max(0.05, calibration.depth / 2),
            ),
          );
        }
      }
    }
    const projected = corners
      .map((corner) => this.worldToScreen(corner))
      .filter((value): value is THREE.Vector2 => value !== null);
    if (!projected.length) return null;
    return {
      left: Math.min(...projected.map((corner) => corner.x)),
      right: Math.max(...projected.map((corner) => corner.x)),
      top: Math.min(...projected.map((corner) => corner.y)),
      bottom: Math.max(...projected.map((corner) => corner.y)),
    };
  }

  private getTailScreenBounds(
    note: MidiNote,
    lane: number,
  ): ScreenBounds | null {
    if (lane < 0 || lane >= laneCount || note.end <= note.start) return null;
    const tailStart = Math.max(note.start, this.playheadTick);
    const tailEnd = Math.min(note.end, this.getTickAtDepth(farBoardZ));
    if (tailEnd <= tailStart) return null;
    const x = this.getLaneX(lane);
    const points = [
      new THREE.Vector3(x - 0.16, -0.01, this.getNoteZ(tailStart)),
      new THREE.Vector3(x + 0.16, -0.08, this.getNoteZ(tailStart)),
      new THREE.Vector3(x - 0.16, -0.01, this.getNoteZ(tailEnd)),
      new THREE.Vector3(x + 0.16, -0.08, this.getNoteZ(tailEnd)),
    ]
      .map((point) => this.worldToScreen(point))
      .filter((value): value is THREE.Vector2 => value !== null);
    if (!points.length) return null;
    return {
      left: Math.min(...points.map((point) => point.x)),
      right: Math.max(...points.map((point) => point.x)),
      top: Math.min(...points.map((point) => point.y)),
      bottom: Math.max(...points.map((point) => point.y)),
    };
  }

  private getCanvasPoint(event: MouseEvent): { x: number; y: number } | null {
    if (!this.canvas) return null;
    const bounds = this.canvas.getBoundingClientRect();
    if (bounds.width <= 0 || bounds.height <= 0) return null;
    return {
      x: ((event.clientX - bounds.left) / bounds.width) * this.viewportWidth,
      y: ((event.clientY - bounds.top) / bounds.height) * this.viewportHeight,
    };
  }

  private updateMarqueeOutline(marquee: MarqueeDragState): void {
    const left = Math.min(marquee.startX, marquee.currentX);
    const right = Math.max(marquee.startX, marquee.currentX);
    const top = Math.min(marquee.startY, marquee.currentY);
    const bottom = Math.max(marquee.startY, marquee.currentY);
    const corners = [
      this.screenToWorld(left, top),
      this.screenToWorld(right, top),
      this.screenToWorld(right, bottom),
      this.screenToWorld(left, bottom),
    ].filter((value): value is THREE.Vector3 => value !== null);
    if (corners.length !== 4) {
      this.marqueeOutline.visible = false;
      return;
    }
    this.marqueeOutline.geometry.dispose();
    this.marqueeOutline.geometry = new THREE.BufferGeometry().setFromPoints(
      corners,
    );
    this.marqueeOutline.visible = true;
  }

  private getChartLocation(
    event: MouseEvent,
  ): { lane: number; tick: number } | null {
    const point = this.getCanvasPoint(event);
    if (!point || !this.canvas) return null;
    const bounds = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
      -((event.clientY - bounds.top) / bounds.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(ndc, this.threeCamera);
    const hit = new THREE.Vector3();
    if (!this.raycaster.ray.intersectPlane(this.boardPlane, hit)) return null;
    const lane = Math.max(
      0,
      Math.min(laneCount - 1, Math.floor((hit.x + 3) / (6 / laneCount))),
    );
    const tick = this.snapTick(
      this.playheadTick + ((strikeLineZ - hit.z) / 3) * this.getPpqn(),
    );
    return { lane, tick };
  }

  private worldToScreen(position: THREE.Vector3): THREE.Vector2 | null {
    if (!this.canvas) return null;
    const projected = position.clone().project(this.threeCamera);
    return new THREE.Vector2(
      (projected.x + 1) * 0.5 * this.viewportWidth,
      (1 - projected.y) * 0.5 * this.viewportHeight,
    );
  }

  private screenToWorld(x: number, y: number): THREE.Vector3 | null {
    if (!this.canvas) return null;
    this.raycaster.setFromCamera(
      new THREE.Vector2(
        (x / this.viewportWidth) * 2 - 1,
        -(y / this.viewportHeight) * 2 + 1,
      ),
      this.threeCamera,
    );
    const hit = new THREE.Vector3();
    return this.raycaster.ray.intersectPlane(this.boardPlane, hit) ? hit : null;
  }

  private containsScreenPoint(
    bounds: ScreenBounds,
    x: number,
    y: number,
  ): boolean {
    return (
      x >= bounds.left &&
      x <= bounds.right &&
      y >= bounds.top &&
      y <= bounds.bottom
    );
  }

  private getLaneX(lane: number): number {
    return -2.4 + (4.8 * lane) / (laneCount - 1);
  }

  private getNoteZ(tick: number): number {
    return strikeLineZ - ((tick - this.playheadTick) / this.getPpqn()) * 3;
  }

  private getTickAtDepth(z: number): number {
    return this.playheadTick + ((strikeLineZ - z) / 3) * this.getPpqn();
  }

  private getSnapTicks(): number {
    return (this.getPpqn() * 4) / this.state.snap.denominator;
  }

  private snapTick(tick: number): number {
    if (!this.state.snap.enabled) return Math.max(0, Math.round(tick));
    const snapTicks = this.getSnapTicks();
    return snapTicks > 0
      ? Math.max(0, Math.floor(tick / snapTicks) * snapTicks)
      : Math.max(0, Math.round(tick));
  }
}
