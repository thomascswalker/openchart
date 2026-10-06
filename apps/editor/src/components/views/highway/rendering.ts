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
  drumLaneRgbColors,
  kickColor,
  instanceSizeBeatLines,
  instanceSizePerLane,
  instanceSizePhraseSpans,
  instanceSizePreviewSustainPerLane,
  laneCount,
  laneRgbColors,
  nearBoardZ,
  phraseBoundaryIndicatorThickness,
  phraseEndBoundaryIndicatorColor,
  phrasePlacementIndicatorColor,
  phrasePlacementIndicatorThickness,
  phraseStartBoundaryIndicatorColor,
  strikeLineZ,
} from "./constants";
import type { HighwayContext } from "./context";
import { HighwayCoordinateSystem } from "./coordinates";
import {
  noteWorldPosition,
  setModelState,
  sustainWorldTransform,
} from "./geometry";
import { HighwayHitTester } from "./hitTesting";
import { getHighwayNoteIndex, type IndexedNote } from "./noteIndex";
import {
  DRUM_GHOST_GEOMETRY_IDS,
  HIGHWAY_GEOMETRY_CATALOG,
  HIGHWAY_RENDER_ORDER,
} from "./geometryCatalog";
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
  primitiveRolesForModel,
  type InstancedNote,
  type InstancedTail,
  type PrimitiveMaterialRole,
} from "./instances";
import { SustainTailBatch, type SustainInstanceData } from "./tailBatch";
import { NoteInstanceBatch, type NoteInstanceData } from "./instanceBatch";
import type { HighwayPhraseEditingController } from "./phraseEditing";
import type { MarqueeDragState } from "./types";
import {
  drumLaneCount,
  getDrumNoteProfile,
  getDrumPitchForPlacement,
  type DrumPlacementKind,
} from "./drumProfile";

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

export interface HighwayRenderDiagnostics {
  visibleNotes: number;
  visibleSustains: number;
  droppedNotes: number;
  droppedSustains: number;
  batchCapacities: Record<string, number>;
}

const indicatorAxis = new THREE.Vector3(1, 0, 0);
const indicatorDirection = new THREE.Vector3();

function setIndicatorSegment(
  mesh: THREE.Mesh,
  start: THREE.Vector3,
  end: THREE.Vector3,
  thickness: number,
): void {
  indicatorDirection.subVectors(end, start);
  const length = indicatorDirection.length();
  if (length === 0) {
    mesh.visible = false;
    return;
  }

  mesh.position.copy(start).add(end).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(
    indicatorAxis,
    indicatorDirection.multiplyScalar(1 / length),
  );
  mesh.scale.set(length, thickness, thickness);
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
  private readonly drumGemInstances: Record<
    DrumPlacementKind,
    InstancedNote[][]
  > = {
    kick: [],
    cymbal: [],
    pad: [],
  };
  private readonly tailInstances: InstancedTail[][] = [];
  private readonly previewTailInstances: InstancedTail[][] = [];
  private instancedTailBatch: SustainTailBatch | null = null;
  private instancedPreviewTailBatch: SustainTailBatch | null = null;
  private readonly instancedGemBatches: Partial<
    Record<"note" | DrumPlacementKind, NoteInstanceBatch>
  > = {};
  private pooledNotesReady = false;
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
  private readonly phrasePlacementIndicator = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshBasicMaterial({
      color: phrasePlacementIndicatorColor,
      depthTest: false,
      depthWrite: false,
    }),
  );
  private readonly phraseStartBoundaryIndicator = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshBasicMaterial({
      color: phraseStartBoundaryIndicatorColor,
      depthTest: false,
      depthWrite: false,
    }),
  );
  private readonly phraseEndBoundaryIndicator = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshBasicMaterial({
      color: phraseEndBoundaryIndicatorColor,
      depthTest: false,
      depthWrite: false,
    }),
  );
  private readonly gemBindings = new Map<MidiChannelEvent, InstancedNote>();
  private readonly freeGemInstances: Record<
    "note" | DrumPlacementKind,
    InstancedNote[]
  > = { note: [], kick: [], cymbal: [], pad: [] };
  private readonly gemKinds = new WeakMap<
    InstancedNote,
    DrumPlacementKind | undefined
  >();
  private readonly tailBindings = new Map<MidiChannelEvent, InstancedTail>();
  private readonly freeTailInstances: InstancedTail[] = [];
  private readonly beatLineInstances: InstancedBeatLine[] = [];
  private readonly phraseSpanInstances: THREE.Mesh[] = [];
  private readonly laneDividers: THREE.Mesh[] = [];
  private readonly sectionMarkers: SectionMarkerInstance[] = [];
  private readonly phraseSpanGeometry = new THREE.BoxGeometry(6, 0.018, 1);
  private readonly stagepowerMaterial = new THREE.MeshBasicMaterial({
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
  private readonly hoveredPhraseMaterial = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.38,
    depthWrite: false,
  });
  private sceneReady = false;
  private assetsReady = false;
  private materials: MaterialSet | null = null;
  private fretAssemblies: THREE.Group[] = [];
  private ghostGem: InstancedNote | null = null;
  private readonly drumGhostGems: Partial<
    Record<DrumPlacementKind, InstancedNote>
  > = {};
  private fretPaletteIsDrums = false;
  private instancedNotesWereEnabled = false;
  private lastInstancedChart: ChartView | null = null;
  private lastInstancedChartRevision = -1;
  private lastInstancedSelectionRevision = -1;
  private lastInstancedVisibleEntries: IndexedNote[] = [];

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

  public getPerformanceDiagnostics(): HighwayRenderDiagnostics {
    return {
      visibleNotes: this.scene.userData.visibleNotes ?? 0,
      visibleSustains: this.scene.userData.visibleSustains ?? 0,
      droppedNotes: this.scene.userData.droppedNotes ?? 0,
      droppedSustains: this.scene.userData.droppedSustains ?? 0,
      batchCapacities: this.scene.userData.batchCapacities ?? {},
    };
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
    this.phrasePlacementIndicator.renderOrder = 30;
    this.phraseStartBoundaryIndicator.renderOrder = 29;
    this.phraseEndBoundaryIndicator.renderOrder = 29;
    this.phrasePlacementIndicator.visible = false;
    this.phraseStartBoundaryIndicator.visible = false;
    this.phraseEndBoundaryIndicator.visible = false;
    this.scene.add(this.phrasePlacementIndicator);
    this.scene.add(this.phraseStartBoundaryIndicator);
    this.scene.add(this.phraseEndBoundaryIndicator);
    this.createFretboard();
    this.createBeatLineInstances();
    this.createPhraseSpanInstances();
    this.sceneReady = true;
    void this.loadResources();
  }

  public draw(): void {
    const drawStartedAt = performance.now();
    const recordDrawDuration = () => {
      this.scene.userData.highwayDrawMs = performance.now() - drawStartedAt;
    };
    this.phraseEditing.getSelectedPhraseNoteOns();
    const chart = this.context.getCurrentChart();
    if (!chart) {
      this.scene.userData.visibleNotes = 0;
      this.scene.userData.visibleSustains = 0;
      this.hideAllObjects();
      this.hidePhraseSpans();
      this.hidePhraseAffordances();
      this.hideSectionMarkers();
      recordDrawDuration();
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
      recordDrawDuration();
      return;
    }

    const isDrumChart = chart.getTrack().getKey() === "drums";
    if (this.context.getInstancingEnabled()) {
      this.disposePooledNoteObjects();
    } else {
      this.ensurePooledNoteObjects();
    }
    this.drawBeatLines();
    const visibleStart = this.coordinates.getTickAtDepth(nearBoardZ);
    const visibleEnd = this.coordinates.getTickAtDepth(farBoardZ);
    const laneColors = isDrumChart ? drumLaneRgbColors : laneRgbColors;
    this.updateFretboardPalette(isDrumChart);
    const visibleNotes: IndexedNote[] = [];
    getHighwayNoteIndex(chart).query(
      chart,
      visibleStart,
      visibleEnd,
      visibleNotes,
    );

    const useInstancedTails = this.context.getInstancingEnabled();
    const tailData: SustainInstanceData[] = [];
    const usedTails = new Set<InstancedTail>();
    const visibleTailEnd = this.coordinates.getTickAtDepth(farBoardZ);
    for (const { note, lane } of isDrumChart ? [] : visibleNotes) {
      const tailStart = Math.max(note.start, visibleStart);
      const tailEnd = Math.min(note.end, visibleTailEnd);
      if (tailEnd <= tailStart) continue;
      const cutTick = cutPreview.has(note.noteOn)
        ? (this.context.getGhostNoteLocation()?.tick ?? null)
        : null;
      const solidTailEnd =
        cutTick === null ? tailEnd : Math.min(tailEnd, cutTick);
      if (solidTailEnd <= tailStart) continue;
      const transform = sustainWorldTransform(
        this.coordinates.getLaneX(lane),
        this.coordinates.getNoteZ(tailStart),
        this.coordinates.getNoteZ(solidTailEnd),
      );
      const selected = this.context
        .getSelectionContext()
        .isSelected(note.noteOn);
      if (useInstancedTails) {
        tailData.push({
          x: transform.position.x,
          y: transform.position.y,
          z: 0,
          width: transform.scale.x,
          halfLength: transform.scale.y,
          color: laneRgbColors[lane],
          selected,
          startTick: tailStart,
          endTick: solidTailEnd,
          priority: Math.abs(
            note.start - this.coordinates.getTickAtDepth(strikeLineZ),
          ),
        });
        continue;
      }
      const instancedTail = this.acquireTail(note.noteOn);
      if (!instancedTail) continue;
      usedTails.add(instancedTail);
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
    let visibleTails = usedTails.size;
    if (useInstancedTails) {
      this.ensureInstancedTailBatches();
      this.instancedTailBatch!.updateScroll(
        this.context.getCameraTick(),
        this.context.getPpqn(),
        nearBoardZ,
      );
      visibleTails = this.instancedTailBatch!.write(tailData);
    } else {
      this.instancedTailBatch?.write([]);
      this.releaseUnusedBindings(this.tailBindings, usedTails, (item) => {
        item.mesh.visible = false;
        this.freeTailInstances.push(item);
      });
    }
    const previewSustains = isDrumChart
      ? 0
      : this.drawSustainCutPreviewRemainders(
          chart,
          cutPreview,
          visibleStart,
          visibleTailEnd,
        );
    this.scene.userData.visibleNotes = visibleNotes.length;
    this.scene.userData.visibleSustains = visibleTails + previewSustains;

    const usedGems = new Set<InstancedNote>();
    const useInstancedNotes = this.context.getInstancingEnabled();
    const selection = this.context.getSelectionContext();
    const chartRevision = chart.getNoteRevision();
    const selectionRevision = selection.getRevision();
    const noteBatchDirty =
      useInstancedNotes &&
      (!this.instancedNotesWereEnabled ||
        this.lastInstancedChart !== chart ||
        this.lastInstancedChartRevision !== chartRevision ||
        this.lastInstancedSelectionRevision !== selectionRevision ||
        this.lastInstancedVisibleEntries.length !== visibleNotes.length ||
        visibleNotes.some(
          (entry, index) => this.lastInstancedVisibleEntries[index] !== entry,
        ));
    this.scene.userData.noteBatchDirty = noteBatchDirty;
    const noteData: Record<"note" | DrumPlacementKind, NoteInstanceData[]> = {
      note: [],
      kick: [],
      cymbal: [],
      pad: [],
    };
    if (!useInstancedNotes || noteBatchDirty) {
      for (const { note, lane, kind } of visibleNotes) {
      const instanceKind =
        kind === "kick" || kind === "cymbal" || kind === "pad"
          ? kind
          : undefined;
      const placement = HIGHWAY_GEOMETRY_CATALOG[instanceKind ?? "note"];
      const position = noteWorldPosition(
        kind === "kick" ? 0 : this.coordinates.getLaneX(lane),
        this.coordinates.getNoteZ(note.start),
        placement.transform,
        placement.placementOffset,
      );
      const selected = selection.isSelected(note.noteOn);
      if (useInstancedNotes) {
        noteData[instanceKind ?? "note"].push({
          x: position.x,
          y: position.y,
          z: position.z - this.coordinates.getNoteZ(note.start),
          color: kind === "kick" ? kickColor : laneColors[lane],
          selected,
          tick: note.start,
          priority: Math.abs(
            note.start - this.coordinates.getTickAtDepth(strikeLineZ),
          ),
        });
        continue;
      }
      const instancedGem = this.acquireGem(note.noteOn, instanceKind);
      if (!instancedGem) continue;
      usedGems.add(instancedGem);
      instancedGem.object.position.set(position.x, position.y, position.z);
      instancedGem.object.renderOrder =
        HIGHWAY_RENDER_ORDER[placement.renderPass];
      instancedGem.object.visible = true;
      instancedGem.selected = selected;
      setModelState(
        instancedGem.object,
        this.materials,
        kind === "kick" ? kickColor : laneColors[lane],
        {
          selected: instancedGem.selected,
          passed: note.start <= this.context.getPlayheadTick() + 0.001,
        },
      );
      }
    }
    if (useInstancedNotes) {
      for (const kind of ["note", "kick", "cymbal", "pad"] as const) {
        const instances = noteData[kind];
        const batch = this.instancedGemBatches[kind];
        if (instances.length > 0) this.ensureInstancedGemBatch(kind);
        const activeBatch = this.instancedGemBatches[kind] ?? batch;
        activeBatch?.updateScroll(
          this.context.getCameraTick(),
          this.context.getPpqn(),
          nearBoardZ,
        );
        if (!noteBatchDirty && activeBatch) activeBatch.lastWriteMs = 0;
        if (noteBatchDirty) activeBatch?.write(instances);
      }
      this.instancedNotesWereEnabled = true;
      this.lastInstancedChart = chart;
      this.lastInstancedChartRevision = chartRevision;
      this.lastInstancedSelectionRevision = selectionRevision;
      if (noteBatchDirty) this.lastInstancedVisibleEntries = visibleNotes.slice();
    } else {
      Object.values(this.instancedGemBatches).forEach((batch) =>
        batch.write([]),
      );
      this.instancedNotesWereEnabled = false;
    }
    this.scene.userData.instancedNoteCounts = Object.fromEntries(
      Object.entries(this.instancedGemBatches).map(([kind, batch]) => [
        kind,
        batch?.meshes[0]?.count ?? 0,
      ]),
    );
    this.scene.userData.instanceBufferWriteMs =
      Object.values(this.instancedGemBatches).reduce(
        (total, batch) => total + (batch?.lastWriteMs ?? 0),
        0,
      ) +
      (this.instancedTailBatch?.lastWriteMs ?? 0) +
      (this.instancedPreviewTailBatch?.lastWriteMs ?? 0);
    this.updateBatchDiagnostics();
    this.releaseUnusedBindings(this.gemBindings, usedGems, (item) => {
      item.object.visible = false;
      this.recycleGem(item);
    });
    this.drawGhostGem();
    this.drawHoverOutline(chart);
    recordDrawDuration();
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
    Object.values(this.instancedGemBatches).forEach((batch) => batch.dispose());
    Object.keys(this.instancedGemBatches).forEach((key) => {
      delete this.instancedGemBatches[key as "note" | DrumPlacementKind];
    });
    this.instancedTailBatch?.dispose();
    this.instancedPreviewTailBatch?.dispose();
    this.instancedTailBatch = null;
    this.instancedPreviewTailBatch = null;
    destroyInstancedObjects(this.gemInstances, this.tailInstances);
    Object.values(this.drumGemInstances).forEach((instances) =>
      destroyInstancedObjects(instances, []),
    );
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
    this.stagepowerMaterial.dispose();
    this.soloMaterial.dispose();
    this.selectedPhraseMaterial.dispose();
    this.hoveredPhraseMaterial.dispose();
    this.hoverOutline.geometry.dispose();
    (this.hoverOutline.material as THREE.Material).dispose();
    this.marqueeOutline.geometry.dispose();
    (this.marqueeOutline.material as THREE.Material).dispose();
    this.sustainCutPreviewLine.geometry.dispose();
    (this.sustainCutPreviewLine.material as THREE.Material).dispose();
    this.phrasePlacementIndicator.geometry.dispose();
    (this.phrasePlacementIndicator.material as THREE.Material).dispose();
    this.phraseStartBoundaryIndicator.geometry.dispose();
    (this.phraseStartBoundaryIndicator.material as THREE.Material).dispose();
    this.phraseEndBoundaryIndicator.geometry.dispose();
    (this.phraseEndBoundaryIndicator.material as THREE.Material).dispose();
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
    Object.keys(this.drumGhostGems).forEach((kind) => {
      delete this.drumGhostGems[kind as DrumPlacementKind];
    });
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
      this.materials = createMaterialSet(this.assetRegistry);
      const note = this.assetRegistry.getMesh("roundNote");
      const fret = this.assetRegistry.getMesh("fret");
      for (const meshKey of ["roundNote", "kickNote", "cymbalNote"] as const) {
        const bounds = this.assetRegistry.getMesh(meshKey).bounds;
        if (bounds) this.hitTesting.setModelBounds(meshKey, bounds);
      }
      const noteRoles = primitiveRolesForModel(
        note.value!,
        note.definition.definition,
      );
      const drumModels = {
        kick: this.assetRegistry.getMesh("kickNote"),
        cymbal: this.assetRegistry.getMesh("cymbalNote"),
        pad: this.assetRegistry.getMesh("roundNote"),
      };
      const drumPrimitiveRoles: Record<
        DrumPlacementKind,
        PrimitiveMaterialRole[]
      > = {
        kick: primitiveRolesForModel(
          drumModels.kick.value!,
          drumModels.kick.definition.definition,
        ),
        cymbal: primitiveRolesForModel(
          drumModels.cymbal.value!,
          drumModels.cymbal.definition.definition,
        ),
        pad: primitiveRolesForModel(
          drumModels.pad.value!,
          drumModels.pad.definition.definition,
        ),
      };
      for (const kind of ["kick", "cymbal", "pad"] as const) {
        const variants = this.materials.drum[kind];
        const ghostGeometry =
          HIGHWAY_GEOMETRY_CATALOG[DRUM_GHOST_GEOMETRY_IDS[kind]];
        const ghost = createModelInstance(
          drumModels[kind].value!,
          (primitiveIndex) =>
            (drumPrimitiveRoles[kind][primitiveIndex] === "tinted"
              ? variants.noteGhostTinted
              : variants.noteGhostGrayscale
            ).clone(),
          ghostGeometry.transform,
        );
        ghost.meshes.forEach((mesh, primitiveIndex) =>
          setMaterialState(mesh, {
            baseColor: kind === "kick" ? kickColor : drumLaneRgbColors[0],
            emissionColor:
              drumPrimitiveRoles[kind][primitiveIndex] === "neutral"
                ? [1, 1, 1]
                : kind === "kick"
                  ? kickColor
                  : drumLaneRgbColors[0],
            alpha: 0.35,
            ghost: true,
            tint: drumPrimitiveRoles[kind][primitiveIndex] === "tinted",
          }),
        );
        this.drumGhostGems[kind] = ghost;
        this.scene.add(ghost.object);
      }
      this.fretAssemblies = laneRgbColors.map((color, lane) => {
        const fretRoles = primitiveRolesForModel(
          fret.value!,
          fret.definition.definition,
        );
        const assembly = createFretAssembly(
          this.scene,
          fret.value!,
          this.materials!.fretTinted,
          color,
          fretRoles,
          this.materials!.fretGrayscale,
          HIGHWAY_GEOMETRY_CATALOG.fret.transform,
        );
        const placement = HIGHWAY_GEOMETRY_CATALOG.fret.placementOffset!;
        assembly.position.set(
          this.coordinates.getLaneX(lane) + placement.x,
          placement.y,
          strikeLineZ + placement.z,
        );
        return assembly;
      });
      this.ghostGem = createModelInstance(
        note.value!,
        (primitiveIndex) =>
          (noteRoles[primitiveIndex] === "tinted"
            ? this.materials!.noteGhostTinted
            : this.materials!.noteGhostGrayscale
          ).clone(),
        HIGHWAY_GEOMETRY_CATALOG.ghost.transform,
      );
      this.ghostGem.meshes.forEach((mesh, primitiveIndex) =>
        setMaterialState(mesh, {
          baseColor: laneRgbColors[0],
          emissionColor:
            noteRoles[primitiveIndex] === "neutral"
              ? [1, 1, 1]
              : laneRgbColors[0],
          alpha: 0.35,
          ghost: true,
          tint: noteRoles[primitiveIndex] === "tinted",
        }),
      );
      this.scene.add(this.ghostGem.object);
      this.assetsReady = true;
      this.context.requestRender();
    } catch (error) {
      console.error("Circular highway assets failed to load", error);
    }
  }

  private ensurePooledNoteObjects(): void {
    if (this.pooledNotesReady || !this.materials) return;
    const note = this.assetRegistry.getMesh("roundNote");
    const noteRoles = primitiveRolesForModel(
      note.value!,
      note.definition.definition,
    );
    this.gemInstances.push(
      ...createNoteInstances(
        this.scene,
        note.value!,
        this.materials,
        laneRgbColors,
        instanceSizePerLane,
        HIGHWAY_GEOMETRY_CATALOG.note.transform,
        noteRoles,
      ),
    );
    const drumModels = {
      kick: this.assetRegistry.getMesh("kickNote"),
      cymbal: this.assetRegistry.getMesh("cymbalNote"),
      pad: note,
    };
    for (const kind of ["kick", "cymbal", "pad"] as const) {
      const roles = primitiveRolesForModel(
        drumModels[kind].value!,
        drumModels[kind].definition.definition,
      );
      this.drumGemInstances[kind].push(
        ...createNoteInstances(
          this.scene,
          drumModels[kind].value!,
          this.materials.drum[kind],
          kind === "kick" ? [kickColor] : drumLaneRgbColors,
          instanceSizePerLane,
          HIGHWAY_GEOMETRY_CATALOG[kind].transform,
          roles,
        ),
      );
    }
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
    this.resetFreeLists();
    this.pooledNotesReady = true;
  }

  private disposePooledNoteObjects(): void {
    if (!this.pooledNotesReady) return;
    destroyInstancedObjects(this.gemInstances, this.tailInstances);
    Object.values(this.drumGemInstances).forEach((instances) =>
      destroyInstancedObjects(instances, []),
    );
    destroyInstancedObjects([], this.previewTailInstances);
    this.gemInstances.length = 0;
    Object.values(this.drumGemInstances).forEach((instances) => {
      instances.length = 0;
    });
    this.tailInstances.length = 0;
    this.previewTailInstances.length = 0;
    this.gemBindings.clear();
    this.tailBindings.clear();
    this.resetFreeLists();
    this.pooledNotesReady = false;
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
      this.laneDividers.push(divider);
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
        this.stagepowerMaterial,
      );
      mesh.visible = false;
      mesh.renderOrder = 4;
      this.scene.add(mesh);
      this.phraseSpanInstances.push(mesh);
    }
  }

  private drawPhraseSpans(chart: ChartView): void {
    const selectedPhraseNoteOns = new Set(
      this.phraseEditing.getSelectedPhraseNoteOns(),
    );
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
    }> = (["stagepower", "solo"] as const).flatMap((kind) => {
      const pitch = getPhrasePitch(descriptor, kind);
      return pitch === null
        ? []
        : getNotePhrases(track, pitch, kind)
            .filter(
              (phrase) =>
                phrase.note.noteOn !==
                  this.phraseEditing.getDragState()?.note?.noteOn &&
                phrase.end >= visibleStart &&
                phrase.start <= visibleEnd,
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
      const start = Math.min(phraseDrag.startTick, phraseDrag.endTick);
      const end = Math.max(phraseDrag.startTick, phraseDrag.endTick);
      if (end >= visibleStart && start <= visibleEnd) {
        phrases.push({
          kind: phraseDrag.kind,
          start,
          end,
          noteOn: phraseDrag.note?.noteOn ?? null,
        });
      }
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
        phrase.noteOn !== null && selectedPhraseNoteOns.has(phrase.noteOn)
          ? this.selectedPhraseMaterial
          : phrase.noteOn !== null &&
              phrase.noteOn === this.context.getPhraseHoverState()?.noteOn &&
              this.context.getPhraseHoverState()?.operation === "move"
            ? this.hoveredPhraseMaterial
            : phrase.kind === "stagepower"
              ? this.stagepowerMaterial
              : this.soloMaterial;
      mesh.visible = true;
    }
    for (; index < this.phraseSpanInstances.length; index++) {
      this.phraseSpanInstances[index].visible = false;
    }
    this.drawPhraseAffordances(phrases, phraseDrag);
  }

  private drawPhraseAffordances(
    phrases: Array<{
      start: number;
      end: number;
      kind: EditablePhraseKind;
      noteOn: MidiChannelEvent | null;
    }>,
    phraseDrag: ReturnType<HighwayPhraseEditingController["getDragState"]>,
  ): void {
    const hover = this.context.getPhraseHoverState();
    const placementTick =
      phraseDrag?.operation === "create"
        ? Math.min(phraseDrag.startTick, phraseDrag.endTick)
        : hover?.operation === "create"
          ? hover.placementTick
          : null;
    const phraseMode = this.context.getPhraseMode();
    this.phrasePlacementIndicator.visible =
      phraseMode !== null && placementTick !== null;
    if (this.phrasePlacementIndicator.visible && placementTick !== null) {
      this.phrasePlacementIndicator.position.set(
        0,
        -0.045,
        this.coordinates.getNoteZ(placementTick),
      );
      this.phrasePlacementIndicator.scale.set(
        6,
        phrasePlacementIndicatorThickness,
        phrasePlacementIndicatorThickness,
      );
    }

    const activeBoundary =
      phraseDrag?.operation === "resize-start" ||
      phraseDrag?.operation === "resize-end"
        ? phraseDrag.operation
        : hover?.operation === "resize-start" ||
            hover?.operation === "resize-end"
          ? hover.operation
          : null;
    const activeNoteOn = phraseDrag?.note?.noteOn ?? hover?.noteOn;
    const phrase = phrases.find((item) => item.noteOn === activeNoteOn);
    this.phraseStartBoundaryIndicator.visible =
      phraseMode !== null &&
      activeBoundary === "resize-start" &&
      phrase !== undefined;
    this.phraseEndBoundaryIndicator.visible =
      phraseMode !== null &&
      activeBoundary === "resize-end" &&
      phrase !== undefined;
    if (!phrase || !activeBoundary) return;

    const boundary = activeBoundary === "resize-start" ? "start" : "end";
    const projection = this.hitTesting.getPhraseBoundaryProjection(
      phrase,
      boundary,
    );
    if (!projection) return;
    const indicator =
      activeBoundary === "resize-start"
        ? this.phraseStartBoundaryIndicator
        : this.phraseEndBoundaryIndicator;
    setIndicatorSegment(
      indicator,
      projection.worldStart,
      projection.worldEnd,
      phraseBoundaryIndicatorThickness,
    );
  }

  private hidePhraseSpans(): void {
    this.phraseSpanInstances.forEach((mesh) => (mesh.visible = false));
    this.hidePhraseAffordances();
  }

  private hidePhraseAffordances(): void {
    this.phrasePlacementIndicator.visible = false;
    this.phraseStartBoundaryIndicator.visible = false;
    this.phraseEndBoundaryIndicator.visible = false;
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
    const minTick = Math.max(
      0,
      this.coordinates.getTickAtDepth(nearBoardZ) - ppqn,
    );
    const maxTick = this.coordinates.getTickAtDepth(farBoardZ) + ppqn;
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
    kind?: DrumPlacementKind,
  ): InstancedNote | null {
    const existing = this.gemBindings.get(key);
    if (existing && this.gemKinds.get(existing) === kind) return existing;
    if (existing) {
      existing.object.visible = false;
      this.gemBindings.delete(key);
      this.recycleGem(existing);
    }
    const candidate = this.freeGemInstances[kind ?? "note"].pop();
    if (!candidate) return null;
    this.gemBindings.set(key, candidate);
    this.gemKinds.set(candidate, kind);
    return candidate;
  }

  private acquireTail(key: MidiChannelEvent): InstancedTail | null {
    const existing = this.tailBindings.get(key);
    if (existing) return existing;
    const candidate = this.freeTailInstances.pop();
    if (!candidate) return null;
    this.tailBindings.set(key, candidate);
    return candidate;
  }

  private recycleGem(instance: InstancedNote): void {
    this.freeGemInstances[this.gemKinds.get(instance) ?? "note"].push(instance);
  }

  private resetFreeLists(): void {
    for (const free of Object.values(this.freeGemInstances)) free.length = 0;
    this.freeGemInstances.note.push(...this.gemInstances.flat());
    for (const kind of ["kick", "cymbal", "pad"] as const) {
      this.freeGemInstances[kind].push(...this.drumGemInstances[kind].flat());
    }
    this.freeTailInstances.length = 0;
    this.freeTailInstances.push(...this.tailInstances.flat());
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
    Object.values(this.instancedGemBatches).forEach((batch) => batch.write([]));
    this.instancedTailBatch?.write([]);
    this.instancedPreviewTailBatch?.write([]);
    this.gemInstances.flat().forEach(({ object }) => (object.visible = false));
    Object.values(this.drumGemInstances)
      .flat(2)
      .forEach(({ object }) => (object.visible = false));
    this.tailInstances.flat().forEach(({ mesh }) => (mesh.visible = false));
    this.previewTailInstances
      .flat()
      .forEach(({ mesh }) => (mesh.visible = false));
    this.beatLineInstances.forEach(({ mesh }) => (mesh.visible = false));
    this.sustainCutPreviewLine.visible = false;
    if (this.ghostGem) this.ghostGem.object.visible = false;
    Object.values(this.drumGhostGems).forEach((gem) => {
      if (gem) gem.object.visible = false;
    });
    this.gemBindings.clear();
    this.tailBindings.clear();
    this.resetFreeLists();
    this.updateBatchDiagnostics();
  }

  private updateBatchDiagnostics(): void {
    const batches = [
      ...Object.entries(this.instancedGemBatches),
      ["sustain", this.instancedTailBatch],
      ["sustainPreview", this.instancedPreviewTailBatch],
    ] as const;
    const capacities: Record<string, number> = {};
    for (const [key, batch] of batches) {
      if (batch) capacities[key] = batch.capacity;
    }
    this.scene.userData.droppedNotes = Object.values(
      this.instancedGemBatches,
    ).reduce((total, batch) => total + (batch?.droppedNotes ?? 0), 0);
    this.scene.userData.droppedSustains =
      (this.instancedTailBatch?.droppedNotes ?? 0) +
      (this.instancedPreviewTailBatch?.droppedNotes ?? 0);
    this.scene.userData.batchCapacities = capacities;
  }

  private getSustainCutPreview(
    chart: ChartView,
  ): Map<MidiChannelEvent, MidiNote> {
    if (chart.getTrack().getKey() === "drums") return new Map();
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
    if (this.context.getInstancingEnabled()) {
      const previewData: SustainInstanceData[] = [];
      const cutTick = this.context.getGhostNoteLocation()?.tick;
      if (cutTick === undefined) {
        this.instancedPreviewTailBatch?.write([]);
        return 0;
      }
      for (const note of cutPreview.values()) {
        const lane = note.note - chart.getOffset();
        if (lane < 0 || lane >= laneCount) continue;
        const start = Math.max(note.start, visibleStart, cutTick);
        const end = Math.min(note.end, visibleEnd);
        if (end <= start) continue;
        const transform = sustainWorldTransform(
          this.coordinates.getLaneX(lane),
          this.coordinates.getNoteZ(start),
          this.coordinates.getNoteZ(end),
        );
        previewData.push({
          x: transform.position.x,
          y: transform.position.y,
          z: 0,
          width: transform.scale.x,
          halfLength: transform.scale.y,
          color: laneRgbColors[lane],
          selected: false,
          startTick: start,
          endTick: end,
          priority: Math.abs(
            note.start - this.coordinates.getTickAtDepth(strikeLineZ),
          ),
        });
      }
      this.ensureInstancedTailBatches();
      return this.instancedPreviewTailBatch!.write(previewData);
    }
    this.instancedPreviewTailBatch?.write([]);
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

  private ensureInstancedTailBatches(): void {
    if (this.instancedTailBatch || !this.materials) return;
    this.instancedTailBatch = new SustainTailBatch(
      this.scene,
      this.materials.sustain,
      256,
      10,
      { alpha: 0.65, useStrikeLine: true, strikeLineZ },
    );
    this.instancedPreviewTailBatch = new SustainTailBatch(
      this.scene,
      this.materials.sustain,
      256,
      11,
      {
        alpha: 0.18,
        ghost: true,
        useStrikeLine: true,
        strikeLineZ,
      },
    );
  }

  private ensureInstancedGemBatch(kind: "note" | DrumPlacementKind): void {
    if (this.instancedGemBatches[kind] || !this.materials) return;
    const meshKey =
      kind === "kick"
        ? "kickNote"
        : kind === "cymbal"
          ? "cymbalNote"
          : "roundNote";
    const model = this.assetRegistry.getMesh(meshKey);
    const materialSet =
      kind === "note" ? this.materials : this.materials.drum[kind];
    const placement = HIGHWAY_GEOMETRY_CATALOG[kind];
    this.instancedGemBatches[kind] = new NoteInstanceBatch(
      this.scene,
      model.value!,
      primitiveRolesForModel(model.value!, model.definition.definition),
      materialSet,
      256,
      placement.transform,
      HIGHWAY_RENDER_ORDER[placement.renderPass],
    );
  }

  private drawGhostGem(): void {
    const location = this.context.getGhostNoteLocation();
    const chart = this.context.getCurrentChart();
    const isDrumChart = chart?.getTrack().getKey() === "drums";
    const drumKind = isDrumChart
      ? this.context.getDrumPlacementKind()
      : undefined;
    const ghostGem = drumKind ? this.drumGhostGems[drumKind] : this.ghostGem;
    if (this.ghostGem) this.ghostGem.object.visible = false;
    Object.values(this.drumGhostGems).forEach((gem) => {
      if (gem) gem.object.visible = false;
    });
    if (!ghostGem) return;
    if (!location || !this.context.canShowNotePlacementPreview()) {
      ghostGem.object.visible = false;
      return;
    }
    if (
      chart?.getTrack().getKey() === "drums" &&
      getDrumPitchForPlacement(
        this.context.getDrumPlacementKind(),
        location.lane,
        chart.getOffset(),
      ) === null
    ) {
      ghostGem.object.visible = false;
      return;
    }
    const isDrumKick = isDrumChart && drumKind === "kick";
    const placement =
      HIGHWAY_GEOMETRY_CATALOG[
        drumKind ? DRUM_GHOST_GEOMETRY_IDS[drumKind] : "ghost"
      ];
    const position = noteWorldPosition(
      isDrumKick ? 0 : this.coordinates.getLaneX(location.lane),
      this.coordinates.getNoteZ(location.tick),
      placement.transform,
      placement.placementOffset,
    );
    const laneColor = isDrumKick
      ? kickColor
      : chart?.getTrack().getKey() === "drums"
        ? drumLaneRgbColors[location.lane]
        : laneRgbColors[location.lane];
    ghostGem.meshes.forEach((mesh) =>
      setMaterialState(mesh, {
        baseColor: laneColor,
        emissionColor: laneColor,
      }),
    );
    ghostGem.object.position.set(position.x, position.y, position.z);
    ghostGem.object.renderOrder = HIGHWAY_RENDER_ORDER[placement.renderPass];
    ghostGem.object.visible = true;
  }

  private updateFretboardPalette(isDrums: boolean): void {
    const paletteChanged = this.fretPaletteIsDrums !== isDrums;
    this.fretPaletteIsDrums = isDrums;
    const colors = isDrums ? drumLaneRgbColors : laneRgbColors;
    const activeLaneCount = isDrums ? drumLaneCount : laneCount;
    this.laneDividers.forEach((divider, index) => {
      divider.visible = index <= activeLaneCount;
      if (divider.visible) {
        divider.position.x = -3 + (6 * index) / activeLaneCount;
      }
    });
    this.fretAssemblies.forEach((assembly, lane) => {
      assembly.visible = lane < activeLaneCount;
      assembly.position.x = this.coordinates.getLaneX(lane);
      if (!paletteChanged || lane >= activeLaneCount) return;
      assembly.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        setMaterialState(object, {
          baseColor: colors[lane],
          emissionColor: colors[lane],
        });
      });
    });
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
    const profile =
      chart.getTrack().getKey() === "drums"
        ? getDrumNoteProfile(note.note, chart.getOffset())
        : null;
    const lane = profile?.lane ?? (profile?.kind === "kick" ? 0 : -1);
    const bounds =
      profile?.kind === "kick"
        ? this.hitTesting.getKickScreenBounds(note)
        : this.hitTesting.getGemScreenBounds(
            note,
            profile ? lane : note.note - chart.getOffset(),
            profile?.kind === "pad" || profile?.kind === "cymbal"
              ? profile.kind
              : "note",
          );
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
