import type { Midi, MidiChannelEvent, MidiNote } from "@midiedit/core";
import { ChartView, Note, SongView } from "@midiedit/views";
import * as THREE from "three";
import {
  AbstractChartView,
  type CameraDebugState,
  type CameraDebugView,
  type NoteSizeDebugState,
  type NoteSizeDebugView,
} from "../AbstractChartView";
import type { ThreeRenderEngine } from "../../../rendering/ThreeRenderEngine";
import { RenderAssetRegistry } from "./assets";
import { circularHighwayPrimitiveRoles } from "../../../assets/highway/circular";
import {
  createCircularMaterialSet,
  rgbFromHex,
  setCircularMaterialState,
  type CircularMaterialSet,
} from "./circularMaterials";
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
} from "./highwayGeometry";
import {
  createModelInstance,
  createNotePools,
  createFretAssembly,
  createSustainPool,
  destroyPooledObjects,
  type PooledNote,
  type PooledTail,
} from "./highwayPools";
import { HIGHWAY_GEOMETRY_CATALOG } from "./highwayGeometryCatalog";

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
const poolSizePerLane = 128;
const poolSizeBeatLines = 64;
const visibleQuarterNotes = 16;
const strikeLineZ = -3.5;
const farBoardZ = -44;
const nearBoardZ = 0.5;
const laneRgbColors = laneColors.map(rgbFromHex);

interface PooledBeatLine {
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
}

interface DragState {
  pointerId: number;
  noteOn: MidiChannelEvent;
  initialLane: number;
  initialTick: number;
  pointerLane: number;
  pointerTick: number;
  resizing: boolean;
  changed: boolean;
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
  private readonly gemPools: PooledNote[][] = [];
  private readonly tailPools: PooledTail[][] = [];
  private readonly gemBindings = new Map<MidiChannelEvent, PooledNote>();
  private readonly tailBindings = new Map<MidiChannelEvent, PooledTail>();
  private readonly beatLinePool: PooledBeatLine[] = [];
  private readonly assetRegistry: RenderAssetRegistry;
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
  private materialSet: CircularMaterialSet | null = null;
  private noteCalibration: ModelCalibration = DEFAULT_NOTE_CALIBRATION;
  private fretAssemblies: THREE.Group[] = [];
  private ghostGem: PooledNote | null = null;
  private ghostNoteLocation: { lane: number; tick: number } | null = null;
  private playheadTick = 0;
  private selectedNoteOn: MidiChannelEvent | null = null;
  private hoveredNoteOn: MidiChannelEvent | null = null;
  private drag: DragState | null = null;
  private suppressNextClick = false;

  public constructor(assetRegistry?: RenderAssetRegistry) {
    super();
    this.assetRegistry = assetRegistry ?? new RenderAssetRegistry();
    this.ownsAssetRegistry = !assetRegistry;
  }

  protected override get renderScene(): THREE.Scene {
    return this.threeScene;
  }

  protected override get renderCamera(): THREE.Camera {
    return this.threeCamera;
  }

  protected override onMounted(engine: ThreeRenderEngine): void {
    this.canvas = engine.canvas;
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
    this.createFretboard();
    this.createBeatLinePool();
    this.sceneReady = true;
    void this.loadHighwayAssets();

    this.canvas.style.touchAction = "none";
    this.canvas.addEventListener("click", this.handleClick);
    this.canvas.addEventListener("contextmenu", this.handleContextMenu);
    this.canvas.addEventListener("wheel", this.handleWheel, { passive: false });
    this.canvas.addEventListener("pointerdown", this.handlePointerDown);
    this.canvas.addEventListener("pointermove", this.handlePointerMove);
    this.canvas.addEventListener("pointerleave", this.handlePointerLeave);
    this.canvas.addEventListener("pointerup", this.handlePointerUp);
    this.canvas.addEventListener("pointercancel", this.handlePointerUp);
    window.addEventListener("pointerup", this.handlePointerUp);
  }

  protected override onResized(width: number, height: number): void {
    this.threeCamera.aspect = width / Math.max(1, height);
    this.threeCamera.updateProjectionMatrix();
  }

  public override setPlayheadTick(tick: number): void {
    this.playheadTick = Math.max(0, tick);
    this.render();
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

  protected override draw(engine: ThreeRenderEngine): void {
    const { width, height } = engine.getSize();
    this.viewportWidth = width;
    this.viewportHeight = height;
    this.threeCamera.aspect = width / Math.max(1, height);
    this.threeCamera.updateProjectionMatrix();
    const midi = this.state.midi;
    const chart = midi ? this.getActiveChart(midi) : null;
    if (!chart || !this.assetsReady || !this.materialSet) {
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

    const usedTails = new Set<PooledTail>();
    for (const { note, lane } of visibleNotes) {
      const tailStart = Math.max(note.start, visibleStart);
      const tailEnd = Math.min(note.end, this.getTickAtDepth(farBoardZ));
      if (tailEnd <= tailStart) continue;
      const pooledTail = this.acquireTail(note.noteOn, usedTails);
      if (!pooledTail) continue;
      usedTails.add(pooledTail);
      const transform = sustainWorldTransform(
        this.getLaneX(lane),
        this.getNoteZ(tailStart),
        this.getNoteZ(tailEnd),
      );
      const selected = note.noteOn === this.selectedNoteOn;
      pooledTail.mesh.position.set(
        transform.position.x,
        transform.position.y,
        transform.position.z,
      );
      pooledTail.mesh.scale.set(
        transform.scale.x,
        transform.scale.y,
        transform.scale.z,
      );
      pooledTail.mesh.renderOrder = 10;
      pooledTail.mesh.visible = true;
      setCircularMaterialState(pooledTail.mesh, {
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

    const usedGems = new Set<PooledNote>();
    for (const { note, lane } of visibleNotes) {
      const pooledGem = this.acquireGem(note.noteOn, usedGems);
      if (!pooledGem) continue;
      usedGems.add(pooledGem);
      const distance = (note.start - this.playheadTick) / this.getPpqn();
      const position = noteWorldPosition(
        this.getLaneX(lane),
        strikeLineZ - distance * 3,
        this.getEffectiveNoteCalibration(),
      );
      pooledGem.object.position.set(position.x, position.y, position.z);
      pooledGem.object.renderOrder = 20;
      pooledGem.object.visible = true;
      pooledGem.selected = note.noteOn === this.selectedNoteOn;
      setModelState(pooledGem.object, this.materialSet, laneRgbColors[lane], {
        selected: pooledGem.selected,
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
    this.canvas?.removeEventListener("contextmenu", this.handleContextMenu);
    this.canvas?.removeEventListener("wheel", this.handleWheel);
    this.canvas?.removeEventListener("pointerdown", this.handlePointerDown);
    this.canvas?.removeEventListener("pointermove", this.handlePointerMove);
    this.canvas?.removeEventListener("pointerleave", this.handlePointerLeave);
    this.canvas?.removeEventListener("pointerup", this.handlePointerUp);
    this.canvas?.removeEventListener("pointercancel", this.handlePointerUp);
    window.removeEventListener("pointerup", this.handlePointerUp);
    this.canvas = null;
    this.drag = null;
    destroyPooledObjects(this.gemPools, this.tailPools);
    this.gemPools.length = 0;
    this.tailPools.length = 0;
    this.gemBindings.clear();
    this.tailBindings.clear();
    this.beatLinePool.forEach(({ mesh, material }) => {
      mesh.geometry.dispose();
      material.dispose();
      mesh.removeFromParent();
    });
    this.beatLinePool.length = 0;
    this.fretAssemblies.forEach((assembly) => {
      assembly.traverse((object) => {
        const mesh = object as THREE.Mesh;
        mesh.geometry?.dispose();
        mesh.material?.dispose();
      });
      assembly.removeFromParent();
    });
    this.fretAssemblies.length = 0;
    this.ghostGem = null;
    this.materialSet?.destroy();
    this.materialSet = null;
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

  private async loadHighwayAssets(): Promise<void> {
    try {
      const bundle = await this.assetRegistry.preloadHighway();
      if (!this.sceneReady || !this.cameraReady) return;
      this.materialSet = createCircularMaterialSet(bundle.textures);
      this.noteCalibration = calibrationFromModel(bundle.note);
      this.gemPools.push(
        ...createNotePools(
          this.threeScene,
          bundle.note,
          this.materialSet,
          laneRgbColors,
          poolSizePerLane,
          this.getEffectiveNoteCalibration(),
          circularHighwayPrimitiveRoles.note,
        ),
      );
      this.tailPools.push(
        ...createSustainPool(
          this.threeScene,
          this.materialSet.sustain,
          laneRgbColors,
          poolSizePerLane,
        ),
      );
      this.fretAssemblies = laneRgbColors.map((color, lane) => {
        const assembly = createFretAssembly(
          this.threeScene,
          bundle.fretTop,
          bundle.fretBase,
          this.materialSet!.fretColor,
          color,
          circularHighwayPrimitiveRoles.fretTop,
          this.materialSet!.fretNeutral,
          circularHighwayPrimitiveRoles.fretBase,
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
        return assembly;
      });
      this.ghostGem = createModelInstance(
        bundle.note,
        (primitiveIndex) =>
          (circularHighwayPrimitiveRoles.note[primitiveIndex] === "tinted"
            ? this.materialSet!.noteGhostColor
            : this.materialSet!.noteGhostNeutral
          ).clone(),
        this.getEffectiveNoteCalibration(),
      );
      this.ghostGem.meshes.forEach((mesh, primitiveIndex) =>
        setCircularMaterialState(mesh, {
          baseColor: laneRgbColors[0],
          emissionColor:
            circularHighwayPrimitiveRoles.note[primitiveIndex] === "neutral"
              ? [1, 1, 1]
              : laneRgbColors[0],
          alpha: 0.35,
          ghost: true,
          tint: circularHighwayPrimitiveRoles.note[primitiveIndex] === "tinted",
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

  private createBeatLinePool(): void {
    for (let index = 0; index < poolSizeBeatLines; index++) {
      const material = new THREE.MeshBasicMaterial({ color: 0x64748b });
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(6, 0.016, 1), material);
      mesh.visible = false;
      mesh.renderOrder = 3;
      this.threeScene.add(mesh);
      this.beatLinePool.push({ mesh, material });
    }
  }

  private drawBeatLines(): void {
    const ppqn = Math.max(1, this.getPpqn());
    const minTick = Math.max(0, this.playheadTick - Math.floor(ppqn * 2));
    const maxTick =
      this.playheadTick + Math.ceil(ppqn * (visibleQuarterNotes + 2));
    const startQuarterTick = Math.ceil(minTick / ppqn) * ppqn;
    let poolIndex = 0;
    for (let tick = startQuarterTick; tick <= maxTick; tick += ppqn) {
      const z = this.getNoteZ(tick);
      if (z < farBoardZ || z > nearBoardZ) continue;
      const pooled = this.beatLinePool[poolIndex++];
      if (!pooled) break;
      const q = Math.round(tick / ppqn);
      const thicknessZ = q % 4 === 0 ? 0.07 : q % 2 === 0 ? 0.045 : 0.025;
      pooled.material.color.setHex(
        q % 4 === 0 ? 0xf1f5f9 : q % 2 === 0 ? 0x94a3b8 : 0x64748b,
      );
      pooled.mesh.position.set(0, -0.065, z);
      pooled.mesh.scale.z = thicknessZ;
      pooled.mesh.visible = true;
    }
    for (let index = poolIndex; index < this.beatLinePool.length; index++) {
      this.beatLinePool[index].mesh.visible = false;
    }
  }

  private acquireGem(
    key: MidiChannelEvent,
    used: Set<PooledNote>,
  ): PooledNote | null {
    const existing = this.gemBindings.get(key);
    if (existing) return existing;
    const bound = new Set(this.gemBindings.values());
    const candidate = this.gemPools
      .flat()
      .find((item) => !bound.has(item) && !used.has(item));
    if (!candidate) return null;
    this.gemBindings.set(key, candidate);
    return candidate;
  }

  private acquireTail(
    key: MidiChannelEvent,
    used: Set<PooledTail>,
  ): PooledTail | null {
    const existing = this.tailBindings.get(key);
    if (existing) return existing;
    const bound = new Set(this.tailBindings.values());
    const candidate = this.tailPools
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
    this.gemPools.flat().forEach(({ object }) => (object.visible = false));
    this.tailPools.flat().forEach(({ mesh }) => (mesh.visible = false));
    this.beatLinePool.forEach(({ mesh }) => (mesh.visible = false));
    if (this.ghostGem) this.ghostGem.object.visible = false;
    this.gemBindings.clear();
    this.tailBindings.clear();
  }

  private getEffectiveNoteCalibration(): ModelCalibration {
    return scaleNoteCalibration(this.noteCalibration, this.noteSizeDebugState);
  }

  private applyNoteCalibrationToInstances(): void {
    const calibration = this.getEffectiveNoteCalibration();
    this.gemPools
      .flat()
      .forEach(({ object }) => applyModelCalibration(object, calibration));
    if (this.ghostGem) applyModelCalibration(this.ghostGem.object, calibration);
  }

  private drawGhostGem(): void {
    if (!this.ghostGem) return;
    const location = this.ghostNoteLocation;
    if (!location || this.drag) {
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
    if (this.suppressNextClick) {
      this.suppressNextClick = false;
      return;
    }
    const chart = this.getCurrentChart();
    const location = this.getChartLocation(event);
    if (!chart || !location) return;
    const durationTicks = Math.max(1, this.getSnapTicks());
    chart.addNote(
      location.lane as Note,
      location.tick,
      location.tick + durationTicks,
    );
    this.onNotesChanged?.();
    this.render();
  };

  private readonly handleContextMenu = (event: MouseEvent): void => {
    event.preventDefault();
    const chart = this.getCurrentChart();
    const note = chart ? this.getNoteAt(chart, event) : undefined;
    if (!chart || !note || !chart.removeNote(note)) return;
    if (note.noteOn === this.selectedNoteOn) this.selectedNoteOn = null;
    this.onNotesChanged?.();
    this.render();
  };

  private readonly handlePointerDown = (event: PointerEvent): void => {
    if (event.button !== 0) return;
    const chart = this.getCurrentChart();
    const location = this.getChartLocation(event);
    if (!chart || !location) return;
    const note = this.getNoteAt(chart, event);
    if (!note) {
      this.selectedNoteOn = null;
      this.render();
      return;
    }
    event.preventDefault();
    this.suppressNextClick = true;
    this.selectedNoteOn = note.noteOn;
    this.ghostNoteLocation = null;
    this.drag = {
      pointerId: event.pointerId,
      noteOn: note.noteOn,
      initialLane: note.note - chart.getOffset(),
      initialTick: note.start,
      pointerLane: location.lane,
      pointerTick: location.tick,
      resizing: this.isTailEndHit(note, chart, event),
      changed: false,
    };
    this.canvas?.setPointerCapture(event.pointerId);
    this.render();
  };

  private readonly handlePointerMove = (event: PointerEvent): void => {
    const drag = this.drag;
    if (!drag || drag.pointerId !== event.pointerId) {
      this.updateHoveredNote(event);
      this.updateGhostLocation(event);
      return;
    }
    this.ghostNoteLocation = null;
    const chart = this.getCurrentChart();
    const location = this.getChartLocation(event);
    const note = chart
      ?.getNotes()
      .find((value) => value.noteOn === drag.noteOn);
    if (!chart || !location || !note) return;
    const changed = drag.resizing
      ? chart.setNoteEnd(note, Math.max(note.start + 1, location.tick))
      : chart.moveNote(
          note,
          Math.max(
            Note.Green,
            Math.min(
              Note.Orange,
              drag.initialLane + location.lane - drag.pointerLane,
            ),
          ) as Note,
          this.snapTick(drag.initialTick + location.tick - drag.pointerTick),
        );
    drag.changed ||= changed;
    if (changed) this.render();
  };

  private readonly handlePointerLeave = (): void => {
    this.hoveredNoteOn = null;
    this.ghostNoteLocation = null;
    this.hoverOutline.visible = false;
    this.render();
  };

  private readonly handlePointerUp = (event: PointerEvent): void => {
    const drag = this.drag;
    if (!drag || drag.pointerId !== event.pointerId) return;
    this.canvas?.releasePointerCapture(event.pointerId);
    this.drag = null;
    if (drag.changed) this.onNotesChanged?.();
  };

  private readonly handleWheel = (event: WheelEvent): void => {
    event.preventDefault();
    const nextTick = Math.max(
      0,
      this.playheadTick + event.deltaY * this.getPpqn() * wheelTicksPerPixel,
    );
    this.setPlayheadTick(nextTick);
    this.onSeekRequest?.(nextTick);
  };

  private updateHoveredNote(event: PointerEvent): void {
    const chart = this.getCurrentChart();
    const note = chart ? this.getNoteAt(chart, event) : undefined;
    const next = note?.noteOn ?? null;
    if (next === this.hoveredNoteOn) return;
    this.hoveredNoteOn = next;
    if (this.canvas) this.canvas.style.cursor = note ? "pointer" : "default";
    this.render();
  }

  private updateGhostLocation(event: PointerEvent): void {
    const chart = this.getCurrentChart();
    this.ghostNoteLocation = chart ? this.getChartLocation(event) : null;
    this.render();
  }

  private getCurrentChart(): ChartView | null {
    return this.state.midi ? this.getActiveChart(this.state.midi) : null;
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

  private isTailEndHit(
    note: MidiNote,
    chart: ChartView,
    event: MouseEvent,
  ): boolean {
    if (note.end <= note.start) return false;
    const pointer = this.getCanvasPoint(event);
    if (!pointer) return false;
    const end = this.worldToScreen(
      new THREE.Vector3(
        this.getLaneX(note.note - chart.getOffset()),
        -0.04,
        this.getNoteZ(note.end),
      ),
    );
    return end ? Math.hypot(pointer.x - end.x, pointer.y - end.y) <= 12 : false;
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
