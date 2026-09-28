import type { MidiChannelEvent, MidiNote } from "@midiedit/core";
import {
  extractSections,
  getNotePhrases,
  getPhrasePitch,
  type ChartView,
  type EditablePhraseKind,
} from "@midiedit/views";
import * as THREE from "three";
import { ResourceRegistry } from "./assets";
import {
  farBoardZ,
  instanceSizeBeatLines,
  instanceSizePerLane,
  instanceSizePhraseSpans,
  instanceSizePreviewSustainPerLane,
  laneCount,
  laneRgbColors,
  nearBoardZ,
  strikeLineZ,
  visibleQuarterNotes,
} from "./constants";
import type { HighwayContext } from "./context";
import { HighwayCoordinateSystem } from "./coordinates";
import {
  applyModelCalibration,
  calibrationFromModel,
  DEFAULT_NOTE_CALIBRATION,
  DEFAULT_NOTE_SCALE_MULTIPLIER,
  noteWorldPosition,
  scaleNoteCalibration,
  setModelState,
  sustainWorldTransform,
  type ModelCalibration,
} from "./geometry";
import { HighwayHitTester } from "./hitTesting";
import { HIGHWAY_GEOMETRY_CATALOG } from "./geometryCatalog";
import { getSustainCutTargets } from "./interaction";
import {
  createMaterialSet,
  setMaterialState,
  type MaterialSet,
} from "./materials";
import {
  createFretAssembly,
  createModelInstance,
  createNoteInstances,
  createSustainInstance,
  destroyInstancedObjects,
  type InstancedNote,
  type InstancedTail,
} from "./instances";
import type { HighwayPhraseEditingController } from "./phraseEditing";
import type { MarqueeDragState } from "./types";
import { primitiveRoles } from "../../../rendering/registry";
import type { NoteSizeDebugState } from "../AbstractChartView";

interface InstancedBeatLine {
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
}

interface SectionMarkerInstance {
  tick: number;
  name: string;
  line: THREE.Mesh;
  label: THREE.Sprite;
}

export class HighwayRenderer {
  private readonly context: HighwayContext;
  private readonly coordinates: HighwayCoordinateSystem;
  private readonly hitTesting: HighwayHitTester;
  private readonly phraseEditing: HighwayPhraseEditingController;
  private readonly assetRegistry: ResourceRegistry;
  private readonly ownsAssetRegistry: boolean;
  private readonly scene = new THREE.Scene();
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
  private readonly beatLineInstances: InstancedBeatLine[] = [];
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
  private sceneReady = false;
  private assetsReady = false;
  private materials: MaterialSet | null = null;
  private noteCalibration: ModelCalibration = DEFAULT_NOTE_CALIBRATION;
  private noteSizeDebugState: NoteSizeDebugState = {
    ...DEFAULT_NOTE_SCALE_MULTIPLIER,
  };
  private fretAssemblies: THREE.Group[] = [];
  private ghostGem: InstancedNote | null = null;

  public constructor(
    context: HighwayContext,
    coordinates: HighwayCoordinateSystem,
    hitTesting: HighwayHitTester,
    phraseEditing: HighwayPhraseEditingController,
    registry?: ResourceRegistry,
  ) {
    this.context = context;
    this.coordinates = coordinates;
    this.hitTesting = hitTesting;
    this.phraseEditing = phraseEditing;
    this.assetRegistry = registry ?? new ResourceRegistry();
    this.ownsAssetRegistry = !registry;
  }

  public getScene(): THREE.Scene {
    return this.scene;
  }

  public isReady(): boolean {
    return this.sceneReady;
  }

  public mount(): void {
    this.scene.add(this.hoverOutline);
    this.scene.add(this.marqueeOutline);
    this.sustainCutPreviewLine.computeLineDistances();
    this.sustainCutPreviewLine.renderOrder = 15;
    this.sustainCutPreviewLine.visible = false;
    this.scene.add(this.sustainCutPreviewLine);
    this.createFretboard();
    this.createBeatLineInstances();
    this.createPhraseSpanInstances();
    this.sceneReady = true;
    void this.loadResources();
  }

  public draw(): void {
    const chart = this.context.getCurrentChart();
    if (!chart) {
      this.scene.userData.visibleNotes = 0;
      this.scene.userData.visibleSustains = 0;
      this.hideAllObjects();
      this.hidePhraseSpans();
      this.hideSectionMarkers();
      return;
    }

    const cutPreview = this.getSustainCutPreview(chart);
    this.updateSustainCutPreviewLine(
      cutPreview.size > 0
        ? (this.context.getGhostNoteLocation()?.tick ?? null)
        : null,
    );
    this.drawPhraseSpans(chart);
    this.drawSectionMarkers(chart);
    if (!this.assetsReady || !this.materials) {
      this.scene.userData.visibleNotes = 0;
      this.scene.userData.visibleSustains = 0;
      this.hideAllObjects();
      return;
    }

    this.drawBeatLines();
    const visibleStart = this.coordinates.getTickAtDepth(nearBoardZ);
    const visibleEnd =
      this.context.getPlayheadTick() +
      this.context.getPpqn() * visibleQuarterNotes;
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
    const visibleTailEnd = this.coordinates.getTickAtDepth(farBoardZ);
    for (const { note, lane } of visibleNotes) {
      const tailStart = Math.max(note.start, visibleStart);
      const tailEnd = Math.min(note.end, visibleTailEnd);
      if (tailEnd <= tailStart) continue;
      const cutTick = cutPreview.has(note.noteOn)
        ? (this.context.getGhostNoteLocation()?.tick ?? null)
        : null;
      const solidTailEnd =
        cutTick === null ? tailEnd : Math.min(tailEnd, cutTick);
      if (solidTailEnd <= tailStart) continue;
      const instancedTail = this.acquireTail(note.noteOn, usedTails);
      if (!instancedTail) continue;
      usedTails.add(instancedTail);
      const transform = sustainWorldTransform(
        this.coordinates.getLaneX(lane),
        this.coordinates.getNoteZ(tailStart),
        this.coordinates.getNoteZ(solidTailEnd),
      );
      const selected = this.context
        .getSelectionContext()
        .isSelected(note.noteOn);
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
    this.scene.userData.visibleNotes = visibleNotes.length;
    this.scene.userData.visibleSustains = usedTails.size + previewSustains;

    const usedGems = new Set<InstancedNote>();
    for (const { note, lane } of visibleNotes) {
      const instancedGem = this.acquireGem(note.noteOn, usedGems);
      if (!instancedGem) continue;
      usedGems.add(instancedGem);
      const position = noteWorldPosition(
        this.coordinates.getLaneX(lane),
        this.coordinates.getNoteZ(note.start),
        this.getEffectiveNoteCalibration(),
      );
      instancedGem.object.position.set(position.x, position.y, position.z);
      instancedGem.object.renderOrder = 20;
      instancedGem.object.visible = true;
      instancedGem.selected = this.context
        .getSelectionContext()
        .isSelected(note.noteOn);
      setModelState(instancedGem.object, this.materials, laneRgbColors[lane], {
        selected: instancedGem.selected,
        passed: note.start <= this.context.getPlayheadTick() + 0.001,
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

  public getNoteSizeDebugState(): NoteSizeDebugState | null {
    return this.sceneReady ? structuredClone(this.noteSizeDebugState) : null;
  }

  public applyNoteSizeDebugState(state: NoteSizeDebugState): boolean {
    if (!this.sceneReady) return false;
    this.noteSizeDebugState = structuredClone(state);
    this.applyNoteCalibrationToInstances();
    return true;
  }

  public getEffectiveNoteCalibration(): ModelCalibration {
    return scaleNoteCalibration(this.noteCalibration, this.noteSizeDebugState);
  }

  public updateMarqueeOutline(marquee: MarqueeDragState | null): void {
    if (!marquee) {
      this.marqueeOutline.visible = false;
      return;
    }
    const left = Math.min(marquee.startX, marquee.currentX);
    const right = Math.max(marquee.startX, marquee.currentX);
    const top = Math.min(marquee.startY, marquee.currentY);
    const bottom = Math.max(marquee.startY, marquee.currentY);
    const corners = [
      this.coordinates.screenToWorld(left, top),
      this.coordinates.screenToWorld(right, top),
      this.coordinates.screenToWorld(right, bottom),
      this.coordinates.screenToWorld(left, bottom),
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

  public clearHoverOutline(): void {
    this.hoverOutline.visible = false;
  }

  public dispose(): void {
    destroyInstancedObjects(this.gemInstances, this.tailInstances);
    destroyInstancedObjects([], this.previewTailInstances);
    this.gemInstances.length = 0;
    this.tailInstances.length = 0;
    this.previewTailInstances.length = 0;
    this.gemBindings.clear();
    this.tailBindings.clear();
    this.beatLineInstances.forEach(({ mesh, material }) => {
      mesh.geometry.dispose();
      material.dispose();
      mesh.removeFromParent();
    });
    this.beatLineInstances.length = 0;
    this.phraseSpanInstances.forEach((mesh) => mesh.removeFromParent());
    this.phraseSpanInstances.length = 0;
    this.phraseSpanGeometry.dispose();
    this.starpowerMaterial.dispose();
    this.soloMaterial.dispose();
    this.selectedPhraseMaterial.dispose();
    this.hoverOutline.geometry.dispose();
    (this.hoverOutline.material as THREE.Material).dispose();
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
    this.scene.clear();
    this.assetsReady = false;
    this.sceneReady = false;
  }

  private async loadResources(): Promise<void> {
    try {
      await this.assetRegistry.loadResources();
      if (!this.sceneReady) return;
      this.materials = createMaterialSet(this.assetRegistry.textures);
      const { note, fretTop, fretBase } = this.assetRegistry.meshes;
      this.noteCalibration = calibrationFromModel(note.value!);
      this.gemInstances.push(
        ...createNoteInstances(
          this.scene,
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
          this.scene,
          this.materials.sustain,
          laneRgbColors,
          instanceSizePerLane,
        ),
      );
      this.previewTailInstances.push(
        ...createSustainInstance(
          this.scene,
          this.materials.sustain,
          laneRgbColors,
          instanceSizePreviewSustainPerLane,
        ),
      );
      this.fretAssemblies = laneRgbColors.map((color, lane) => {
        const assembly = createFretAssembly(
          this.scene,
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
          this.coordinates.getLaneX(lane) + transform.position.x,
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
      this.scene.add(this.ghostGem.object);
      this.assetsReady = true;
      this.context.requestRender();
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
    this.scene.add(board);
    for (let lane = 0; lane <= laneCount; lane++) {
      const divider = new THREE.Mesh(
        new THREE.BoxGeometry(0.05, 0.08, boardDepth),
        new THREE.MeshBasicMaterial({ color: 0x64748b }),
      );
      divider.position.set(-3 + (6 * lane) / laneCount, -0.05, boardCenterZ);
      divider.renderOrder = 2;
      this.scene.add(divider);
    }
    const strike = new THREE.Mesh(
      new THREE.BoxGeometry(6, 0.03, 0.12),
      new THREE.MeshBasicMaterial({ color: 0xf8fafc }),
    );
    strike.position.set(0, -0.04, strikeLineZ);
    strike.renderOrder = 3;
    this.scene.add(strike);
  }

  private createBeatLineInstances(): void {
    for (let index = 0; index < instanceSizeBeatLines; index++) {
      const material = new THREE.MeshBasicMaterial({ color: 0x64748b });
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(6, 0.016, 1), material);
      mesh.visible = false;
      mesh.renderOrder = 3;
      this.scene.add(mesh);
      this.beatLineInstances.push({ mesh, material });
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
      this.scene.add(mesh);
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
    const visibleStart = Math.max(
      0,
      this.coordinates.getTickAtDepth(nearBoardZ),
    );
    const visibleEnd = this.coordinates.getTickAtDepth(farBoardZ);
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
    const phraseDrag = this.phraseEditing.getDragState();
    if (phraseDrag) {
      phrases.push({
        kind: phraseDrag.kind,
        start: Math.min(phraseDrag.startTick, phraseDrag.endTick),
        end: Math.max(phraseDrag.startTick, phraseDrag.endTick),
        noteOn: phraseDrag.note?.noteOn ?? null,
      });
    }
    let index = 0;
    for (const phrase of phrases) {
      const mesh = this.phraseSpanInstances[index++];
      if (!mesh) break;
      const start = Math.max(visibleStart, phrase.start);
      const end = Math.min(visibleEnd, phrase.end);
      const startZ = this.coordinates.getNoteZ(start);
      const endZ = this.coordinates.getNoteZ(end);
      mesh.position.set(0, -0.045, (startZ + endZ) / 2);
      mesh.scale.z = Math.max(0.03, Math.abs(startZ - endZ));
      mesh.material =
        phrase.noteOn === this.phraseEditing.getSelectedPhraseNoteOn()
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
    const visibleStart = Math.max(
      0,
      this.coordinates.getTickAtDepth(nearBoardZ),
    );
    const visibleEnd = this.coordinates.getTickAtDepth(farBoardZ);
    for (const marker of this.sectionMarkers) {
      const visible = marker.tick >= visibleStart && marker.tick <= visibleEnd;
      const z = this.coordinates.getNoteZ(marker.tick);
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
    this.scene.add(line);
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
    this.scene.add(label);
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
    const ppqn = Math.max(1, this.context.getPpqn());
    const playheadTick = this.context.getPlayheadTick();
    const minTick = Math.max(0, playheadTick - Math.floor(ppqn * 2));
    const maxTick = playheadTick + Math.ceil(ppqn * (visibleQuarterNotes + 2));
    const startQuarterTick = Math.ceil(minTick / ppqn) * ppqn;
    let instanceIndex = 0;
    for (let tick = startQuarterTick; tick <= maxTick; tick += ppqn) {
      const z = this.coordinates.getNoteZ(tick);
      if (z < farBoardZ || z > nearBoardZ) continue;
      const instanced = this.beatLineInstances[instanceIndex++];
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
      index < this.beatLineInstances.length;
      index++
    ) {
      this.beatLineInstances[index].mesh.visible = false;
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
    this.beatLineInstances.forEach(({ mesh }) => (mesh.visible = false));
    this.sustainCutPreviewLine.visible = false;
    if (this.ghostGem) this.ghostGem.object.visible = false;
    this.gemBindings.clear();
    this.tailBindings.clear();
  }

  private getSustainCutPreview(
    chart: ChartView,
  ): Map<MidiChannelEvent, MidiNote> {
    const location = this.context.getGhostNoteLocation();
    if (!location || !this.context.canShowNotePlacementPreview())
      return new Map();
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
    if (tick === null || !this.context.canShowNotePlacementPreview()) {
      this.sustainCutPreviewLine.visible = false;
      return;
    }
    this.sustainCutPreviewLine.position.set(
      0,
      -0.005,
      this.coordinates.getNoteZ(tick),
    );
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
    const cutTick = this.context.getGhostNoteLocation()?.tick;
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
        this.coordinates.getLaneX(lane),
        this.coordinates.getNoteZ(start),
        this.coordinates.getNoteZ(end),
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

  private applyNoteCalibrationToInstances(): void {
    const calibration = this.getEffectiveNoteCalibration();
    this.gemInstances
      .flat()
      .forEach(({ object }) => applyModelCalibration(object, calibration));
    if (this.ghostGem) applyModelCalibration(this.ghostGem.object, calibration);
  }

  private drawGhostGem(): void {
    if (!this.ghostGem) return;
    const location = this.context.getGhostNoteLocation();
    if (!location || !this.context.canShowNotePlacementPreview()) {
      this.ghostGem.object.visible = false;
      return;
    }
    const position = noteWorldPosition(
      this.coordinates.getLaneX(location.lane),
      this.coordinates.getNoteZ(location.tick),
      this.getEffectiveNoteCalibration(),
    );
    this.ghostGem.object.position.set(position.x, position.y, position.z);
    this.ghostGem.object.renderOrder = 30;
    this.ghostGem.object.visible = true;
  }

  private drawHoverOutline(chart: ChartView): void {
    const hoveredNoteOn = this.context.getHoveredNoteOn();
    const note = hoveredNoteOn
      ? chart.getNotes().find((value) => value.noteOn === hoveredNoteOn)
      : null;
    if (!note) {
      this.hoverOutline.visible = false;
      return;
    }
    const lane = note.note - chart.getOffset();
    const bounds = this.hitTesting.getGemScreenBounds(note, lane);
    if (!bounds) {
      this.hoverOutline.visible = false;
      return;
    }
    const corners = [
      this.coordinates.screenToWorld(bounds.left, bounds.top),
      this.coordinates.screenToWorld(bounds.right, bounds.top),
      this.coordinates.screenToWorld(bounds.right, bounds.bottom),
      this.coordinates.screenToWorld(bounds.left, bounds.bottom),
    ].filter((value): value is THREE.Vector3 => value !== null);
    if (corners.length !== 4) return;
    this.hoverOutline.geometry.dispose();
    this.hoverOutline.geometry = new THREE.BufferGeometry().setFromPoints(
      corners,
    );
    this.hoverOutline.visible = true;
  }
}
