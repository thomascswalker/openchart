import type { Midi, MidiChannelEvent, MidiNote } from "@midiedit/core";
import { ChartView, Note, SongView } from "@midiedit/views";
import { Application, Graphics, type Renderer } from "pixi.js";
import {
  Camera,
  Color,
  Container3D,
  LightingEnvironment,
  Mesh3D,
  Point3D,
  StandardMaterial,
} from "pixi3d/pixi7";
import {
  AbstractChartView,
  type CameraDebugState,
  type CameraDebugView,
  type NoteSizeDebugState,
  type NoteSizeDebugView,
} from "../AbstractChartView";
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
const defaultCameraFieldOfView = 45;
const minimumCameraFieldOfView = 1;
const maximumCameraFieldOfView = 179;
const wheelTicksPerPixel = 1 / 100;

function quaternionToEulerDegrees(x: number, y: number, z: number, w: number) {
  const sinX = 2 * (w * x + y * z);
  const cosX = 1 - 2 * (x * x + y * y);
  const sinY = 2 * (w * y - z * x);
  const sinZ = 2 * (w * z + x * y);
  const cosZ = 1 - 2 * (y * y + z * z);

  return {
    x: (Math.atan2(sinX, cosX) * 180) / Math.PI,
    y: (Math.asin(Math.max(-1, Math.min(1, sinY))) * 180) / Math.PI,
    z: (Math.atan2(sinZ, cosZ) * 180) / Math.PI,
  };
}

function isValidCameraDebugState(state: CameraDebugState): boolean {
  const values = [
    state.position.x,
    state.position.y,
    state.position.z,
    state.rotation.x,
    state.rotation.y,
    state.rotation.z,
    state.fieldOfView,
  ];

  return (
    values.every(Number.isFinite) &&
    state.fieldOfView >= minimumCameraFieldOfView &&
    state.fieldOfView <= maximumCameraFieldOfView
  );
}

const minimumNoteScale = 0.1;
const maximumNoteScale = 10;

function isValidNoteSizeDebugState(state: NoteSizeDebugState): boolean {
  return [state.x, state.y, state.z].every(
    (value) =>
      Number.isFinite(value) &&
      value >= minimumNoteScale &&
      value <= maximumNoteScale,
  );
}

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
  mesh: Mesh3D;
  material: StandardMaterial;
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

export class HighwayView
  extends AbstractChartView<MidiNote>
  implements CameraDebugView, NoteSizeDebugView
{
  private camera: Camera | null = null;
  private cameraDebugDefaultsQuaternion: {
    x: number;
    y: number;
    z: number;
    w: number;
  } | null = null;
  private cameraDebugDefaults: CameraDebugState | null = null;
  private cameraDebugState: CameraDebugState | null = null;
  private noteSizeDebugState: NoteSizeDebugState = {
    ...DEFAULT_NOTE_SCALE_MULTIPLIER,
  };
  private lighting: LightingEnvironment | null = null;
  private scene: Container3D | null = null;
  private songMidi: Midi | null = null;
  private song: SongView | null = null;
  private playheadTick = 0;
  private canvas: HTMLCanvasElement | null = null;
  private selectedNoteOn: MidiChannelEvent | null = null;
  private hoveredNoteOn: MidiChannelEvent | null = null;
  private drag: DragState | null = null;
  private suppressNextClick = false;
  private readonly gemPools: PooledNote[][] = [];
  private readonly tailPools: PooledTail[][] = [];
  private readonly gemBindings = new Map<MidiChannelEvent, PooledNote>();
  private readonly tailBindings = new Map<MidiChannelEvent, PooledTail>();
  private readonly beatLinePool: PooledBeatLine[] = [];
  private readonly hoverOutline = new Graphics();
  private ghostGem: PooledNote | null = null;
  private ghostNoteLocation: { lane: number; tick: number } | null = null;
  private readonly assetRegistry: RenderAssetRegistry;
  private readonly ownsAssetRegistry: boolean;
  private materialSet: CircularMaterialSet | null = null;
  private noteCalibration: ModelCalibration = DEFAULT_NOTE_CALIBRATION;
  private fretAssemblies: Container3D[] = [];
  private assetsReady = false;

  public constructor(assetRegistry?: RenderAssetRegistry) {
    super();
    this.assetRegistry = assetRegistry ?? new RenderAssetRegistry();
    this.ownsAssetRegistry = !assetRegistry;
  }

  public override setPlayheadTick(tick: number): void {
    this.playheadTick = Math.max(0, tick);
    this.render();
  }

  protected override onMounted(app: Application): void {
    const renderer = app.renderer as unknown as Renderer;
    this.lighting = new LightingEnvironment(renderer);
    LightingEnvironment.main = this.lighting;

    this.camera = new Camera(renderer);
    this.camera.position.set(0, 7, 7);
    this.camera.fieldOfView = 45;
    this.camera.near = 0.1;
    this.camera.far = 64;
    this.camera.transform.lookAt(new Point3D(0, 0, -20));
    const rotation = quaternionToEulerDegrees(
      this.camera.rotationQuaternion.x,
      this.camera.rotationQuaternion.y,
      this.camera.rotationQuaternion.z,
      this.camera.rotationQuaternion.w,
    );
    rotation.x = 200;
    this.camera.rotationQuaternion.setEulerAngles(
      rotation.x,
      rotation.y,
      rotation.z,
    );
    this.cameraDebugDefaults = {
      position: { ...defaultCameraPosition },
      rotation,
      fieldOfView: defaultCameraFieldOfView,
    };
    this.cameraDebugDefaultsQuaternion = {
      x: this.camera.rotationQuaternion.x,
      y: this.camera.rotationQuaternion.y,
      z: this.camera.rotationQuaternion.z,
      w: this.camera.rotationQuaternion.w,
    };
    this.cameraDebugState = structuredClone(this.cameraDebugDefaults);
    Camera.main = this.camera;

    this.scene = new Container3D();
    app.stage.addChild(this.scene);
    app.stage.addChild(this.hoverOutline);
    this.createFretboard();
    this.createBeatLinePool();
    void this.loadHighwayAssets();

    this.canvas = app.view as HTMLCanvasElement;
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

  public getCameraDebugState(): CameraDebugState | null {
    return this.cameraDebugState && structuredClone(this.cameraDebugState);
  }

  public applyCameraDebugState(state: CameraDebugState): boolean {
    if (!this.camera || !isValidCameraDebugState(state)) {
      return false;
    }

    this.camera.position.set(
      state.position.x,
      state.position.y,
      state.position.z,
    );
    this.camera.rotationQuaternion.setEulerAngles(
      state.rotation.x,
      state.rotation.y,
      state.rotation.z,
    );
    this.camera.fieldOfView = state.fieldOfView;
    this.cameraDebugState = structuredClone(state);
    this.render();
    return true;
  }

  public resetCameraDebugState(): boolean {
    if (!this.cameraDebugDefaults || !this.cameraDebugDefaultsQuaternion) {
      return false;
    }

    if (!this.applyCameraDebugState(this.cameraDebugDefaults)) {
      return false;
    }

    this.camera?.rotationQuaternion.set(
      this.cameraDebugDefaultsQuaternion.x,
      this.cameraDebugDefaultsQuaternion.y,
      this.cameraDebugDefaultsQuaternion.z,
      this.cameraDebugDefaultsQuaternion.w,
    );
    this.render();
    return true;
  }

  public getNoteSizeDebugState(): NoteSizeDebugState | null {
    return this.scene ? structuredClone(this.noteSizeDebugState) : null;
  }

  public applyNoteSizeDebugState(state: NoteSizeDebugState): boolean {
    if (!this.scene || !isValidNoteSizeDebugState(state)) {
      return false;
    }

    this.noteSizeDebugState = structuredClone(state);
    this.applyNoteCalibrationToInstances();
    this.render();
    return true;
  }

  public resetNoteSizeDebugState(): boolean {
    return this.applyNoteSizeDebugState({ ...DEFAULT_NOTE_SCALE_MULTIPLIER });
  }

  protected override draw(): void {
    const midi = this.state.midi;
    const chart = midi ? this.getActiveChart(midi) : null;
    if (!chart) {
      this.hideAllGems();
      this.hoverOutline.clear();
      if (this.ghostGem) {
        this.ghostGem.object.visible = false;
      }
      return;
    }

    if (!this.assetsReady) {
      this.hideAllGems();
      return;
    }

    this.drawBeatLines();

    const visibleStart = this.getTickAtDepth(nearBoardZ);
    const visibleEnd = this.playheadTick + this.getPpqn() * visibleQuarterNotes;
    const effectiveNoteCalibration = this.getEffectiveNoteCalibration();

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

    // Transparent sustain ribbons are submitted before note heads. The
    // heads then write depth and occlude any ribbon underneath their surface.
    const usedTails = new Set<PooledTail>();
    for (const { note, lane } of visibleNotes) {
      const tailStart = Math.max(note.start, this.getTickAtDepth(nearBoardZ));
      const tailEnd = Math.min(note.end, this.getTickAtDepth(farBoardZ));
      if (tailEnd <= tailStart) {
        continue;
      }
      const pooledTail = this.acquireTail(note.noteOn, usedTails);
      if (!pooledTail) continue;
      usedTails.add(pooledTail);
      const sustainTransform = sustainWorldTransform(
        this.getLaneX(lane),
        this.getNoteZ(tailStart),
        this.getNoteZ(tailEnd),
      );
      const tailSelected = note.noteOn === this.selectedNoteOn;
      setCircularMaterialState(pooledTail.mesh, {
        baseColor: laneRgbColors[lane],
        emissionColor: laneRgbColors[lane],
        emissionIntensity: tailSelected ? 1.7 : 1,
        alpha: 0.65,
        selected: tailSelected,
        ghost: false,
        tint: true,
        passed: false,
        useStrikeLine: true,
        strikeLineZ,
      });
      pooledTail.mesh.position.set(
        sustainTransform.position.x,
        sustainTransform.position.y,
        sustainTransform.position.z,
      );
      pooledTail.mesh.scale.set(
        sustainTransform.scale.x,
        sustainTransform.scale.y,
        sustainTransform.scale.z,
      );
      pooledTail.mesh.visible = true;
    }

    const usedGems = new Set<PooledNote>();
    for (const { note, lane } of visibleNotes) {
      const pooledGem = this.acquireGem(note.noteOn, usedGems);
      if (!pooledGem) continue;
      usedGems.add(pooledGem);
      const distance = (note.start - this.playheadTick) / this.getPpqn();
      const notePosition = noteWorldPosition(
        this.getLaneX(lane),
        strikeLineZ - distance * 3,
        effectiveNoteCalibration,
      );
      pooledGem.object.position.set(
        notePosition.x,
        notePosition.y,
        notePosition.z,
      );
      const selected = note.noteOn === this.selectedNoteOn;
      pooledGem.selected = selected;
      setModelState(pooledGem.object, this.materialSet!, laneRgbColors[lane], {
        selected,
        passed: note.start <= this.playheadTick + 0.001,
      });
      pooledGem.object.visible = true;
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
    this.selectedNoteOn = null;
    this.hoveredNoteOn = null;

    destroyPooledObjects(this.gemPools, this.tailPools);
    this.gemPools.length = 0;
    this.tailPools.length = 0;
    this.gemBindings.clear();
    this.tailBindings.clear();
    this.beatLinePool.forEach(({ mesh, material }) => {
      mesh.destroy({ children: true });
      material.destroy();
    });
    this.beatLinePool.length = 0;
    this.ghostGem?.object.destroy({
      children: true,
      geometry: false,
      material: false,
      texture: false,
      baseTexture: false,
    } as never);
    this.ghostGem = null;
    this.fretAssemblies.forEach((assembly) =>
      assembly.destroy({
        children: true,
        geometry: false,
        material: false,
        texture: false,
        baseTexture: false,
      } as never),
    );
    this.fretAssemblies.length = 0;
    this.materialSet?.destroy();
    this.materialSet = null;
    if (this.ownsAssetRegistry) {
      this.assetRegistry.dispose();
    }
    this.assetsReady = false;
    this.ghostNoteLocation = null;
    this.scene = null;

    this.camera?.destroy();
    this.camera = null;
    this.cameraDebugDefaultsQuaternion = null;
    this.cameraDebugDefaults = null;
    this.cameraDebugState = null;
    this.noteSizeDebugState = { ...DEFAULT_NOTE_SCALE_MULTIPLIER };
    this.lighting?.destroy();
    this.lighting = null;
    this.song = null;
    this.songMidi = null;

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

  private createFretboard(): void {
    if (!this.scene) {
      return;
    }

    const boardCenterZ = (nearBoardZ + farBoardZ) / 2;
    const boardHalfDepthZ = (nearBoardZ - farBoardZ) / 2;

    const material = new StandardMaterial();
    material.unlit = true;
    material.baseColor = Color.fromHex(0x1f2937);
    const board = Mesh3D.createCube(material);
    const boardTransform = HIGHWAY_GEOMETRY_CATALOG.board.transform;
    board.position.set(
      boardTransform.position.x,
      boardTransform.position.y,
      boardCenterZ + boardTransform.position.z,
    );
    board.scale.set(
      boardTransform.scale.x,
      boardTransform.scale.y,
      boardHalfDepthZ,
    );
    this.scene.addChild(board);

    for (let lane = 0; lane <= laneCount; lane++) {
      const dividerMaterial = new StandardMaterial();
      dividerMaterial.unlit = true;
      dividerMaterial.baseColor = Color.fromHex(0x64748b);
      const divider = Mesh3D.createCube(dividerMaterial);
      const dividerTransform = HIGHWAY_GEOMETRY_CATALOG.laneDivider.transform;
      divider.position.set(
        -3 + (6 * lane) / laneCount + dividerTransform.position.x,
        dividerTransform.position.y,
        boardCenterZ + dividerTransform.position.z,
      );
      divider.scale.set(
        dividerTransform.scale.x,
        dividerTransform.scale.y,
        boardHalfDepthZ,
      );
      this.scene.addChild(divider);
    }

    const strikeLineMaterial = new StandardMaterial();
    strikeLineMaterial.unlit = true;
    strikeLineMaterial.baseColor = Color.fromHex(0xf8fafc);
    const strikeLineBar = Mesh3D.createCube(strikeLineMaterial);
    const strikeTransform = HIGHWAY_GEOMETRY_CATALOG.strikeline.transform;
    strikeLineBar.position.set(
      strikeTransform.position.x,
      strikeTransform.position.y,
      strikeLineZ + strikeTransform.position.z,
    );
    strikeLineBar.scale.set(
      strikeTransform.scale.x,
      strikeTransform.scale.y,
      strikeTransform.scale.z,
    );
    this.scene.addChild(strikeLineBar);
  }

  private async loadHighwayAssets(): Promise<void> {
    try {
      const bundle = await this.assetRegistry.preloadHighway();
      if (!this.scene || !this.camera) {
        return;
      }

      const materialSet = createCircularMaterialSet(bundle.textures);
      this.materialSet = materialSet;
      // getBoundingBox() needs a transform root in Pixi3D. Parent the hidden
      // template just long enough to calculate its imported bounds, then keep
      // pooled instances as the only rendered note objects.
      bundle.note.visible = false;
      this.scene.addChild(bundle.note);
      try {
        this.noteCalibration = calibrationFromModel(bundle.note);
      } finally {
        this.scene.removeChild(bundle.note);
      }
      this.gemPools.push(
        ...createNotePools(
          this.scene,
          bundle.note,
          materialSet,
          laneRgbColors,
          poolSizePerLane,
          this.getEffectiveNoteCalibration(),
          circularHighwayPrimitiveRoles.note,
        ),
      );
      this.tailPools.push(
        ...createSustainPool(
          this.scene,
          materialSet.sustain,
          laneRgbColors.map(
            ([r, g, b]) => [r, g, b] as [number, number, number],
          ),
          poolSizePerLane,
        ),
      );
      this.fretAssemblies = laneRgbColors.map((color, lane) => {
        const assembly = createFretAssembly(
          this.scene!,
          bundle.fretTop,
          bundle.fretBase,
          materialSet.fretColor,
          color,
          circularHighwayPrimitiveRoles.fretTop,
          materialSet.fretNeutral,
          circularHighwayPrimitiveRoles.fretBase,
        );
        const topTransform = HIGHWAY_GEOMETRY_CATALOG.fretTop.transform;
        assembly.position.set(
          this.getLaneX(lane) + topTransform.position.x,
          topTransform.position.y,
          strikeLineZ + topTransform.position.z,
        );
        assembly.scale.set(
          topTransform.scale.x,
          topTransform.scale.y,
          topTransform.scale.z,
        );
        return assembly;
      });
      this.ghostGem = createModelInstance(
        bundle.note,
        (primitiveIndex) =>
          circularHighwayPrimitiveRoles.note[primitiveIndex] === "tinted"
            ? materialSet.noteGhostColor
            : materialSet.noteGhostNeutral,
        this.getEffectiveNoteCalibration(),
      );
      this.ghostGem.meshes.forEach((mesh, primitiveIndex) =>
        setCircularMaterialState(mesh, {
          baseColor: laneRgbColors[0],
          emissionColor:
            circularHighwayPrimitiveRoles.note[primitiveIndex] === "neutral"
              ? ([1, 1, 1] as [number, number, number])
              : laneRgbColors[0],
          alpha: 0.35,
          ghost: true,
          tint: circularHighwayPrimitiveRoles.note[primitiveIndex] === "tinted",
        }),
      );
      this.scene.addChild(this.ghostGem.object);
      this.assetsReady = true;
      this.render();
    } catch (error) {
      // The board remains usable when an optional visual asset fails.  This is
      // especially important in a Tauri webview where assets can be stale
      // while a new bundle is being installed.
      console.error("Circular highway assets failed to load", error);
    }
  }

  private getEffectiveNoteCalibration(): ModelCalibration {
    return scaleNoteCalibration(this.noteCalibration, this.noteSizeDebugState);
  }

  private applyNoteCalibrationToInstances(): void {
    const calibration = this.getEffectiveNoteCalibration();
    this.gemPools.flat().forEach(({ object }) => {
      applyModelCalibration(object, calibration);
    });
    if (this.ghostGem) {
      applyModelCalibration(this.ghostGem.object, calibration);
    }
  }

  private createBeatLinePool(): void {
    if (!this.scene) {
      return;
    }

    for (let index = 0; index < poolSizeBeatLines; index++) {
      const material = new StandardMaterial();
      material.unlit = true;
      const mesh = Mesh3D.createCube(material);
      mesh.visible = false;
      this.scene.addChild(mesh);
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
      if (z < farBoardZ || z > nearBoardZ) {
        continue;
      }

      const pooled = this.beatLinePool[poolIndex++];
      if (!pooled) {
        break;
      }

      const q = Math.round(tick / ppqn);
      let thicknessZ = 0.025;
      let colorHex = 0x64748b;

      if (q % 4 === 0) {
        thicknessZ = 0.07;
        colorHex = 0xf1f5f9;
      } else if (q % 2 === 0) {
        thicknessZ = 0.045;
        colorHex = 0x94a3b8;
      }

      pooled.material.baseColor = Color.fromHex(colorHex);
      const beatTransform = HIGHWAY_GEOMETRY_CATALOG.beatLine.transform;
      pooled.mesh.position.set(
        beatTransform.position.x,
        beatTransform.position.y,
        z + beatTransform.position.z,
      );
      pooled.mesh.scale.set(
        beatTransform.scale.x,
        beatTransform.scale.y,
        thicknessZ,
      );
      pooled.mesh.visible = true;
    }

    for (let i = poolIndex; i < this.beatLinePool.length; i++) {
      this.beatLinePool[i].mesh.visible = false;
    }
  }

  private hideAllGems(): void {
    this.gemPools.forEach((pool) => {
      pool.forEach(({ object }) => {
        object.visible = false;
      });
    });
    this.tailPools.forEach((pool) => {
      pool.forEach(({ mesh }) => {
        mesh.visible = false;
      });
    });
    this.beatLinePool.forEach(({ mesh }) => {
      mesh.visible = false;
    });
    this.gemBindings.clear();
    this.tailBindings.clear();
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

  private readonly handleClick = (event: MouseEvent): void => {
    if (this.suppressNextClick) {
      this.suppressNextClick = false;
      return;
    }

    const chart = this.getCurrentChart();
    const location = this.getChartLocation(event);
    if (!chart || !location) {
      return;
    }

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
    const location = this.getChartLocation(event);
    if (!chart || !location) {
      return;
    }

    const matchingNote = this.getNoteAt(chart, event);
    if (!matchingNote || !chart.removeNote(matchingNote)) {
      return;
    }

    if (matchingNote.noteOn === this.selectedNoteOn) {
      this.selectedNoteOn = null;
    }
    this.onNotesChanged?.();
    this.render();
  };

  private readonly handlePointerDown = (event: PointerEvent): void => {
    if (event.button !== 0) {
      return;
    }

    const chart = this.getCurrentChart();
    const location = this.getChartLocation(event);
    if (!chart || !location) {
      return;
    }

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
    if (!chart || !location || !note) {
      return;
    }

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
    if (changed) {
      this.render();
    }
  };

  private readonly handlePointerLeave = (): void => {
    if (this.hoveredNoteOn) {
      this.hoveredNoteOn = null;
      this.hoverOutline.clear();
    }
    if (this.ghostNoteLocation) {
      this.ghostNoteLocation = null;
      this.render();
    }
  };

  private readonly handlePointerUp = (event: PointerEvent): void => {
    const drag = this.drag;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }

    this.canvas?.releasePointerCapture(event.pointerId);
    this.drag = null;
    if (drag.changed) {
      this.onNotesChanged?.();
    }
  };

  private readonly handleWheel = (event: WheelEvent): void => {
    event.preventDefault();

    const ppqn = this.getPpqn();
    const nextTick = Math.max(
      0,
      this.playheadTick + event.deltaY * ppqn * wheelTicksPerPixel,
    );
    this.setPlayheadTick(nextTick);
    this.onSeekRequest?.(nextTick);
  };

  private getCurrentChart(): ChartView | null {
    return this.state.midi ? this.getActiveChart(this.state.midi) : null;
  }

  private getNoteAt(chart: ChartView, event: MouseEvent): MidiNote | undefined {
    const pointer = this.getCanvasPoint(event);
    if (!pointer) {
      return undefined;
    }

    let hit: MidiNote | undefined;
    let nearestDepth = Number.POSITIVE_INFINITY;
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
    if (!this.camera || note.end <= note.start) {
      return false;
    }

    const pointer = this.getCanvasPoint(event);
    if (!pointer) {
      return false;
    }

    const lane = note.note - chart.getOffset();
    const end = this.camera.worldToScreen(
      this.getLaneX(lane),
      -0.04,
      this.getNoteZ(note.end),
    );
    const radius = 12;
    return Math.hypot(pointer.x - end.x, pointer.y - end.y) <= radius;
  }

  private updateHoveredNote(event: PointerEvent): void {
    const chart = this.getCurrentChart();
    const note = chart ? this.getNoteAt(chart, event) : undefined;
    const hoveredNoteOn = note?.noteOn ?? null;
    if (hoveredNoteOn === this.hoveredNoteOn) {
      return;
    }

    this.hoveredNoteOn = hoveredNoteOn;
    this.canvas!.style.cursor = note ? "pointer" : "default";
    this.render();
  }

  private updateGhostLocation(event: PointerEvent): void {
    const chart = this.getCurrentChart();
    const location = chart ? this.getChartLocation(event) : null;
    const previous = this.ghostNoteLocation;
    if (
      previous &&
      location &&
      previous.lane === location.lane &&
      previous.tick === location.tick
    ) {
      return;
    }

    this.ghostNoteLocation = location;
    this.render();
  }

  private drawGhostGem(): void {
    const ghost = this.ghostGem;
    if (!ghost || !this.materialSet) {
      return;
    }

    const location = this.ghostNoteLocation;
    if (!location || this.drag) {
      ghost.object.visible = false;
      return;
    }

    const distance = (location.tick - this.playheadTick) / this.getPpqn();
    const position = noteWorldPosition(
      this.getLaneX(location.lane),
      strikeLineZ - distance * 3,
      this.getEffectiveNoteCalibration(),
    );
    ghost.object.position.set(position.x, position.y, position.z);
    setModelState(
      ghost.object,
      this.materialSet,
      laneRgbColors[location.lane],
      {
        alpha: 0.35,
        ghost: true,
      },
    );
    ghost.object.visible = true;
  }

  private drawHoverOutline(chart: ChartView): void {
    this.hoverOutline.clear();
    if (!this.hoveredNoteOn) {
      return;
    }

    const note = chart
      .getNotes()
      .find((value) => value.noteOn === this.hoveredNoteOn);
    if (!note) {
      return;
    }

    const lane = note.note - chart.getOffset();
    const bounds = this.getGemScreenBounds(note, lane);
    if (!bounds) {
      return;
    }

    this.hoverOutline.lineStyle(2, 0xffffff);
    this.hoverOutline.drawRect(
      bounds.left,
      bounds.top,
      bounds.right - bounds.left,
      bounds.bottom - bounds.top,
    );
  }

  private getGemScreenBounds(
    note: MidiNote,
    lane: number,
  ): ScreenBounds | null {
    if (!this.camera || lane < 0 || lane >= laneCount) {
      return null;
    }

    const distance = (note.start - this.playheadTick) / this.getPpqn();
    const calibration = this.getEffectiveNoteCalibration();
    const position = noteWorldPosition(
      this.getLaneX(lane),
      strikeLineZ - distance * 3,
      calibration,
    );
    const halfWidth = calibration.width / 2;
    const halfHeight = Math.max(0.1, calibration.height / 2);
    const halfDepth = Math.max(0.05, calibration.depth / 2);
    const projectedCorners = [-1, 1].flatMap((xSign) =>
      [-1, 1].flatMap((ySign) =>
        [-1, 1].map((zSign) =>
          this.camera!.worldToScreen(
            position.x + xSign * halfWidth,
            position.y + ySign * halfHeight,
            position.z + zSign * halfDepth,
          ),
        ),
      ),
    );

    return {
      left: Math.min(...projectedCorners.map((corner) => corner.x)),
      right: Math.max(...projectedCorners.map((corner) => corner.x)),
      top: Math.min(...projectedCorners.map((corner) => corner.y)),
      bottom: Math.max(...projectedCorners.map((corner) => corner.y)),
    };
  }

  private getTailScreenBounds(
    note: MidiNote,
    lane: number,
  ): ScreenBounds | null {
    if (
      !this.camera ||
      lane < 0 ||
      lane >= laneCount ||
      note.end <= note.start
    ) {
      return null;
    }

    const tailStart = Math.max(note.start, this.playheadTick);
    const tailEnd = Math.min(note.end, this.getTickAtDepth(farBoardZ));
    if (tailEnd <= tailStart) {
      return null;
    }

    const x = this.getLaneX(lane);
    const startLeft = this.camera.worldToScreen(
      x - 0.16,
      -0.01,
      this.getNoteZ(tailStart),
    );
    const startRight = this.camera.worldToScreen(
      x + 0.16,
      -0.08,
      this.getNoteZ(tailStart),
    );
    const endLeft = this.camera.worldToScreen(
      x - 0.16,
      -0.01,
      this.getNoteZ(tailEnd),
    );
    const endRight = this.camera.worldToScreen(
      x + 0.16,
      -0.08,
      this.getNoteZ(tailEnd),
    );

    return {
      left: Math.min(startLeft.x, startRight.x, endLeft.x, endRight.x),
      right: Math.max(startLeft.x, startRight.x, endLeft.x, endRight.x),
      top: Math.min(startLeft.y, startRight.y, endLeft.y, endRight.y),
      bottom: Math.max(startLeft.y, startRight.y, endLeft.y, endRight.y),
    };
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

  private getCanvasPoint(event: MouseEvent): { x: number; y: number } | null {
    if (!this.canvas || !this.camera) {
      return null;
    }

    const bounds = this.canvas.getBoundingClientRect();
    if (bounds.width <= 0 || bounds.height <= 0) {
      return null;
    }

    const screen = this.camera.renderer.screen;
    return {
      x: ((event.clientX - bounds.left) / bounds.width) * screen.width,
      y: ((event.clientY - bounds.top) / bounds.height) * screen.height,
    };
  }

  private getChartLocation(
    event: MouseEvent,
  ): { lane: number; tick: number } | null {
    if (!this.canvas || !this.camera) {
      return null;
    }

    const bounds = this.canvas.getBoundingClientRect();
    if (bounds.width <= 0 || bounds.height <= 0) {
      return null;
    }

    const ray = this.camera.screenToRay(
      event.clientX - bounds.left,
      event.clientY - bounds.top,
      { width: bounds.width, height: bounds.height },
    );
    if (!ray || Math.abs(ray.direction.y) < Number.EPSILON) {
      return null;
    }

    const distance = (0.05 - ray.origin.y) / ray.direction.y;
    if (distance < 0) {
      return null;
    }

    const point = ray.getPoint(distance);
    const lane = Math.max(
      0,
      Math.min(laneCount - 1, Math.floor((point.x + 3) / (6 / laneCount))),
    );
    const tick = this.snapTick(
      this.playheadTick + ((strikeLineZ - point.z) / 3) * this.getPpqn(),
    );

    return { lane, tick };
  }

  private getSnapTicks(): number {
    return (this.getPpqn() * 4) / this.state.snap.denominator;
  }

  private snapTick(tick: number): number {
    if (!this.state.snap.enabled) {
      return Math.max(0, Math.round(tick));
    }

    const snapTicks = this.getSnapTicks();
    return Math.max(0, Math.floor(tick / snapTicks) * snapTicks);
  }
}
