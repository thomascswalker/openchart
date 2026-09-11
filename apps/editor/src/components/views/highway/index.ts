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
  StandardMaterialAlphaMode,
} from "pixi3d/pixi7";
import {
  AbstractChartView,
  type CameraDebugState,
  type CameraDebugView,
} from "../AbstractChartView";

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

const laneColors = [0x00a651, 0xdc2626, 0xfacc15, 0x2563eb, 0xf97316];
const laneCount = laneColors.length;
const poolSizePerLane = 128;
const poolSizeBeatLines = 64;
const visibleQuarterNotes = 16;
const strikeLineZ = -3.5;
const farBoardZ = -44;
const nearBoardZ = 0.5;
const laneMaterialColors = laneColors.map((color) => Color.fromHex(color));
const laneTailColors = laneColors.map((color) => {
  const tailColor = Color.fromHex(color);
  tailColor.a = 0.65;
  return tailColor;
});
const laneGhostColors = laneColors.map((color) => {
  const ghostColor = Color.fromHex(color);
  ghostColor.a = 0.35;
  return ghostColor;
});
const selectedGemColor = Color.fromHex(0xffffff);

interface PooledGem {
  mesh: Mesh3D;
  material: StandardMaterial;
  selected: boolean;
}

interface PooledTail {
  mesh: Mesh3D;
  material: StandardMaterial;
}

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
  implements CameraDebugView
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
  private readonly gemPools: PooledGem[][] = [];
  private readonly tailPools: PooledTail[][] = [];
  private readonly beatLinePool: PooledBeatLine[] = [];
  private readonly hoverOutline = new Graphics();
  private ghostGemMesh: Mesh3D | null = null;
  private ghostGemMaterial: StandardMaterial | null = null;
  private ghostNoteLocation: { lane: number; tick: number } | null = null;

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
    this.createGemPools();
    this.createTailPools();
    this.createBeatLinePool();
    this.createGhostGem();

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

  protected override draw(): void {
    const midi = this.state.midi;
    const chart = midi ? this.getActiveChart(midi) : null;
    if (!chart) {
      this.hideAllGems();
      this.hoverOutline.clear();
      if (this.ghostGemMesh) {
        this.ghostGemMesh.visible = false;
      }
      return;
    }

    this.drawBeatLines();

    const visibleStart = this.playheadTick - this.getPpqn();
    const visibleEnd = this.playheadTick + this.getPpqn() * visibleQuarterNotes;
    const nextPoolIndex = Array.from({ length: laneCount }, () => 0);
    const nextTailPoolIndex = Array.from({ length: laneCount }, () => 0);

    for (const note of chart.getNotes()) {
      if (note.end < visibleStart || note.start > visibleEnd) {
        continue;
      }

      const lane = note.note - chart.getOffset();
      if (lane < 0 || lane >= laneCount) {
        continue;
      }

      const poolIndex = nextPoolIndex[lane]++;
      const pooledGem = this.gemPools[lane]?.[poolIndex];
      if (!pooledGem) {
        continue;
      }

      const distance = (note.start - this.playheadTick) / this.getPpqn();
      pooledGem.mesh.position.set(
        this.getLaneX(lane),
        0.05,
        strikeLineZ - distance * 3,
      );
      const selected = note.noteOn === this.selectedNoteOn;
      if (pooledGem.selected !== selected) {
        pooledGem.selected = selected;
        pooledGem.material.baseColor = selected
          ? selectedGemColor
          : laneMaterialColors[lane];
      }
      pooledGem.mesh.visible = true;

      const tailStart = Math.max(note.start, this.playheadTick);
      const tailEnd = Math.min(note.end, this.getTickAtDepth(farBoardZ));
      if (tailEnd <= tailStart) {
        continue;
      }

      const pooledTail = this.tailPools[lane]?.[nextTailPoolIndex[lane]++];
      if (!pooledTail) {
        continue;
      }

      const tailStartZ = this.getNoteZ(tailStart);
      const tailEndZ = this.getNoteZ(tailEnd);
      pooledTail.mesh.position.set(
        this.getLaneX(lane),
        -0.04,
        (tailStartZ + tailEndZ) / 2,
      );
      pooledTail.mesh.scale.set(0.16, 0.035, (tailStartZ - tailEndZ) / 2);
      pooledTail.mesh.visible = true;
    }

    this.gemPools.forEach((pool, lane) => {
      for (let index = nextPoolIndex[lane]; index < pool.length; index++) {
        pool[index].mesh.visible = false;
      }
    });
    this.tailPools.forEach((pool, lane) => {
      for (let index = nextTailPoolIndex[lane]; index < pool.length; index++) {
        pool[index].mesh.visible = false;
      }
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

    this.gemPools.forEach((pool) => {
      pool.forEach(({ mesh, material }) => {
        mesh.destroy({ children: true });
        material.destroy();
      });
    });
    this.gemPools.length = 0;
    this.tailPools.forEach((pool) => {
      pool.forEach(({ mesh, material }) => {
        mesh.destroy({ children: true });
        material.destroy();
      });
    });
    this.tailPools.length = 0;
    this.beatLinePool.forEach(({ mesh, material }) => {
      mesh.destroy({ children: true });
      material.destroy();
    });
    this.beatLinePool.length = 0;
    this.ghostGemMesh?.destroy({ children: true });
    this.ghostGemMesh = null;
    this.ghostGemMaterial?.destroy();
    this.ghostGemMaterial = null;
    this.ghostNoteLocation = null;
    this.scene = null;

    this.camera?.destroy();
    this.camera = null;
    this.cameraDebugDefaultsQuaternion = null;
    this.cameraDebugDefaults = null;
    this.cameraDebugState = null;
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
    board.position.set(0, -0.25, boardCenterZ);
    board.scale.set(3.25, 0.15, boardHalfDepthZ);
    this.scene.addChild(board);

    for (let lane = 0; lane <= laneCount; lane++) {
      const dividerMaterial = new StandardMaterial();
      dividerMaterial.unlit = true;
      dividerMaterial.baseColor = Color.fromHex(0x64748b);
      const divider = Mesh3D.createCube(dividerMaterial);
      divider.position.set(-3 + (6 * lane) / laneCount, -0.05, boardCenterZ);
      divider.scale.set(0.025, 0.04, boardHalfDepthZ);
      this.scene.addChild(divider);
    }

    const strikeLineMaterial = new StandardMaterial();
    strikeLineMaterial.unlit = true;
    strikeLineMaterial.baseColor = Color.fromHex(0xf8fafc);
    const strikeLineBar = Mesh3D.createCube(strikeLineMaterial);
    strikeLineBar.position.set(0, -0.04, strikeLineZ);
    strikeLineBar.scale.set(3.0, 0.015, 0.06);
    this.scene.addChild(strikeLineBar);

    for (let lane = 0; lane < laneCount; lane++) {
      const padMaterial = new StandardMaterial();
      padMaterial.unlit = true;
      padMaterial.baseColor = laneMaterialColors[lane];
      const pad = Mesh3D.createCube(padMaterial);
      pad.position.set(this.getLaneX(lane), -0.035, strikeLineZ);
      pad.scale.set(0.48, 0.012, 0.2);
      this.scene.addChild(pad);
    }
  }

  private createGemPools(): void {
    if (!this.scene) {
      return;
    }

    for (const color of laneColors) {
      const pool: PooledGem[] = [];
      for (let index = 0; index < poolSizePerLane; index++) {
        const material = new StandardMaterial();
        material.unlit = true;
        material.baseColor = Color.fromHex(color);
        const mesh = Mesh3D.createCube(material);
        mesh.scale.set(0.48, 0.16, 0.42);
        mesh.visible = false;
        this.scene.addChild(mesh);
        pool.push({ mesh, material, selected: false });
      }
      this.gemPools.push(pool);
    }
  }

  private createTailPools(): void {
    if (!this.scene) {
      return;
    }

    for (const color of laneTailColors) {
      const pool: PooledTail[] = [];
      for (let index = 0; index < poolSizePerLane; index++) {
        const material = new StandardMaterial();
        material.unlit = true;
        material.alphaMode = StandardMaterialAlphaMode.blend;
        material.baseColor = color;
        material.depthMask = false;
        const mesh = Mesh3D.createCube(material);
        mesh.visible = false;
        this.scene.addChild(mesh);
        pool.push({ mesh, material });
      }
      this.tailPools.push(pool);
    }
  }

  private createGhostGem(): void {
    if (!this.scene) {
      return;
    }

    const material = new StandardMaterial();
    material.unlit = true;
    material.alphaMode = StandardMaterialAlphaMode.blend;
    material.depthMask = false;
    material.baseColor = laneGhostColors[0];
    const mesh = Mesh3D.createCube(material);
    mesh.scale.set(0.48, 0.16, 0.42);
    mesh.visible = false;
    this.scene.addChild(mesh);
    this.ghostGemMesh = mesh;
    this.ghostGemMaterial = material;
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
      pooled.mesh.position.set(0, -0.065, z);
      pooled.mesh.scale.set(3.0, 0.008, thicknessZ);
      pooled.mesh.visible = true;
    }

    for (let i = poolIndex; i < this.beatLinePool.length; i++) {
      this.beatLinePool[i].mesh.visible = false;
    }
  }

  private hideAllGems(): void {
    this.gemPools.forEach((pool) => {
      pool.forEach(({ mesh }) => {
        mesh.visible = false;
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
    const mesh = this.ghostGemMesh;
    const material = this.ghostGemMaterial;
    if (!mesh || !material) {
      return;
    }

    const location = this.ghostNoteLocation;
    if (!location || this.drag) {
      mesh.visible = false;
      return;
    }

    const distance = (location.tick - this.playheadTick) / this.getPpqn();
    mesh.position.set(
      this.getLaneX(location.lane),
      0.05,
      strikeLineZ - distance * 3,
    );
    material.baseColor = laneGhostColors[location.lane];
    mesh.visible = true;
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
    const x = this.getLaneX(lane);
    const z = strikeLineZ - distance * 3;
    const topLeft = this.camera.worldToScreen(x - 0.48, 0.21, z);
    const bottomRight = this.camera.worldToScreen(x + 0.48, -0.11, z);

    return {
      left: Math.min(topLeft.x, bottomRight.x),
      right: Math.max(topLeft.x, bottomRight.x),
      top: Math.min(topLeft.y, bottomRight.y),
      bottom: Math.max(topLeft.y, bottomRight.y),
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
