import type { MidiChannelEvent, MidiNote } from "@openchart/midi";
import {
  getSections,
  getSustainCutOptions,
  getSustainCutTargets,
  resolveThreshold,
  thresholdContext,
  type ChartView,
  type EditingSession,
  type EntityId,
} from "@openchart/views";
import * as THREE from "three";
import { ResourceRegistry } from "./assets";
import {
  farBoardZ,
  fallbackBarRgb,
  fallbackLaneRgbColors,
  instanceSizeBeatLines,
  instanceSizePhraseSpans,
  maxLaneColumns,
  nearBoardZ,
  phraseBoundaryIndicatorThickness,
  phraseEndBoundaryIndicatorColor,
  phrasePlacementIndicatorColor,
  phrasePlacementIndicatorThickness,
  phraseStartBoundaryIndicatorColor,
  strikeLineZ,
} from "../constants";
import type { HighwayContext } from "../context";
import { HighwayCoordinateSystem } from "../coordinates";
import { noteWorldPosition, sustainWorldTransform } from "./geometry";
import { chartHasSustains, HighwayHitTester } from "../hitTesting";
import {
  getHighwayNoteIndex,
  laneVisualFor,
  type IndexedNote,
} from "../noteIndex";
import {
  SHAPE_GHOST_GEOMETRY_IDS,
  HIGHWAY_GEOMETRY_CATALOG,
  HIGHWAY_RENDER_ORDER,
  type NoteShapeKind,
} from "./geometryCatalog";
import {
  createMaterialSet,
  rgbFromHex,
  setMaterialState,
  type MaterialSet,
  type Rgb,
} from "./materials";
import {
  createFretAssembly,
  createModelInstance,
  primitiveRolesForModel,
  type InstancedNote,
  type PrimitiveMaterialRole,
} from "./instances";
import { SustainTailBatch, type SustainInstanceData } from "./tailBatch";
import { NoteInstanceBatch, type NoteInstanceData } from "./instanceBatch";
import {
  getFiveFretNoteStyles,
  getTapSysExRanges,
  type GuitarNoteStyle,
} from "./noteStyles";
import type { HighwayPhraseEditingController } from "../editing/phraseEditing";
import type { HighwayMarqueeDragState } from "../types";

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

/** Lane colour from the ruleset (`#RRGGBB`), else a neutral fallback. */
function laneRgb(color: string | undefined, index: number): Rgb {
  const hex = color ? Number.parseInt(color.slice(1), 16) : Number.NaN;
  return Number.isFinite(hex)
    ? rgbFromHex(hex)
    : fallbackLaneRgbColors[index % fallbackLaneRgbColors.length]!;
}

/** Colours of the chart's visual columns, left to right. */
function columnColors(chart: ChartView): Rgb[] {
  return chart.getColumns().map((lane, index) => laneRgb(lane.color, index));
}

/** Colour of the chart's first bar lane (kick/open). */
function barColor(chart: ChartView): Rgb {
  const bar = chart.getBars()[0];
  return bar?.color ? laneRgb(bar.color, 0) : fallbackBarRgb;
}

/**
 * Whether a length is a sustain under the ruleset's `sustainCutoff` (strictly
 * longer when the threshold is inclusive). Tracks without one have none.
 */
function sustainLengthTest(
  chart: ChartView,
  session: EditingSession,
  ppqn: number,
): (length: number) => boolean {
  const cutoff = chart.getRules().mechanics?.sustainCutoff;
  if (!cutoff) return () => false;
  const resolved = resolveThreshold(
    cutoff,
    thresholdContext(session.rules, { ...session.getRulesContext(), ppqn }),
  );
  if (!resolved) return () => false;
  return (length) =>
    resolved.inclusive ? length > resolved.ticks : length >= resolved.ticks;
}

function fiveFretNoteStyles(
  chart: ChartView,
  session: EditingSession,
  ppqn: number,
): Map<MidiNote, GuitarNoteStyle> {
  const midiTrack = chart.getMidiTrack();
  if (!midiTrack) return new Map();
  const chartRules = chart.getChartRules();
  const mechanics = chart.getRules().mechanics;
  const forceHopoPitch = chartRules.pitchForMarker("forceHopo");
  const forceStrumPitch = chartRules.pitchForMarker("forceStrum");
  const tapMarkerPitch = chartRules.pitchForMarker("forceTap");
  const hopo = mechanics?.hopoThreshold;
  // Style only tracks that can have HOPOs or forced notes at all.
  if (
    forceHopoPitch === undefined &&
    forceStrumPitch === undefined &&
    tapMarkerPitch === undefined &&
    !hopo
  ) {
    return new Map();
  }
  const resolved = hopo
    ? resolveThreshold(
        hopo,
        thresholdContext(session.rules, {
          ...session.getRulesContext(),
          ppqn,
        }),
      )
    : null;

  return getFiveFretNoteStyles(
    chart.getNotes().filter((note) => chartRules.notes.has(note.pitch)),
    midiTrack.getNotes(),
    {
      ...(forceHopoPitch === undefined ? {} : { forceHopoPitch }),
      ...(forceStrumPitch === undefined ? {} : { forceStrumPitch }),
      tapMarkerPitches: tapMarkerPitch === undefined ? [] : [tapMarkerPitch],
      ...(resolved
        ? {
            hopoThresholdTicks: resolved.ticks,
            hopoInclusive: resolved.inclusive,
          }
        : {}),
      autoHopoExclusions: mechanics?.autoHopoExclusions ?? [],
      tapSysExRanges: getTapSysExRanges(midiTrack.events),
    },
  );
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
  private instancedTailBatch: SustainTailBatch | null = null;
  private instancedPreviewTailBatch: SustainTailBatch | null = null;
  private readonly instancedGemBatches: Partial<
    Record<"note" | NoteShapeKind, NoteInstanceBatch>
  > = {};
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
  private readonly beatLineInstances: InstancedBeatLine[] = [];
  private readonly phraseSpanInstances: THREE.Mesh[] = [];
  private readonly laneDividers: THREE.Mesh[] = [];
  private readonly sectionMarkers: SectionMarkerInstance[] = [];
  private readonly phraseSpanGeometry = new THREE.BoxGeometry(6, 0.018, 1);
  private readonly selectionRangeIndicator = new THREE.Mesh(
    new THREE.BoxGeometry(6, 0.025, 1),
    new THREE.MeshBasicMaterial({
      color: 0xff0000,
      transparent: true,
      opacity: 0.3,
      depthTest: false,
      depthWrite: false,
    }),
  );
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
    Record<NoteShapeKind, InstancedNote>
  > = {};
  /** Identity of the last palette applied to the board (colours + count). */
  private fretPaletteKey = "";
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
    this.selectionRangeIndicator.renderOrder = 3;
    this.selectionRangeIndicator.visible = false;
    this.scene.add(this.selectionRangeIndicator);
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
    const chart = this.context.getCurrentChart();
    const session = this.context.getEditingSession();
    if (!chart || !session) {
      this.scene.userData.visibleNotes = 0;
      this.scene.userData.visibleSustains = 0;
      this.hideAllObjects();
      this.hidePhraseSpans();
      this.selectionRangeIndicator.visible = false;
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
    this.drawSelectionRange();
    this.drawSectionMarkers(chart);
    if (!this.assetsReady || !this.materials) {
      this.scene.userData.visibleNotes = 0;
      this.scene.userData.visibleSustains = 0;
      this.hideAllObjects();
      recordDrawDuration();
      return;
    }

    const hasSustains = chartHasSustains(chart);
    this.drawBeatLines();
    const visibleStart = this.coordinates.getTickAtDepth(nearBoardZ);
    const visibleEnd = this.coordinates.getTickAtDepth(farBoardZ);
    const laneColors = columnColors(chart);
    const kickRgb = barColor(chart);
    this.updateFretboardPalette(laneColors);
    const visibleNotes: IndexedNote[] = [];
    getHighwayNoteIndex(chart).query(
      chart,
      session,
      this.context.getPreviewState(),
      visibleStart,
      visibleEnd,
      visibleNotes,
    );

    const tailData: SustainInstanceData[] = [];
    const visibleTailEnd = this.coordinates.getTickAtDepth(farBoardZ);
    const isSustain = sustainLengthTest(chart, session, this.context.getPpqn());
    for (const note of hasSustains
      ? visibleNotes.filter(
          (entry) =>
            entry.kind === "note" && isSustain(entry.end - entry.start),
        )
      : []) {
      const tailStart = Math.max(note.start, visibleStart);
      const tailEnd = Math.min(note.end, visibleTailEnd);
      if (tailEnd <= tailStart) continue;
      const cutTick =
        note.source && cutPreview.has(note.source.noteOn)
          ? (this.context.getGhostNoteLocation()?.tick ?? null)
          : null;
      const solidTailEnd =
        cutTick === null ? tailEnd : Math.min(tailEnd, cutTick);
      if (solidTailEnd <= tailStart) continue;
      const transform = sustainWorldTransform(
        this.coordinates.getLaneX(note.lane),
        this.coordinates.getNoteZ(tailStart),
        this.coordinates.getNoteZ(solidTailEnd),
      );
      const selected = session.selection.isSelected(note.id);
      tailData.push({
        x: transform.position.x,
        y: transform.position.y,
        z: 0,
        width: transform.scale.x,
        halfLength: transform.scale.y,
        color: laneColors[note.lane] ?? fallbackBarRgb,
        selected,
        startTick: tailStart,
        endTick: solidTailEnd,
        priority: Math.abs(
          note.start - this.coordinates.getTickAtDepth(strikeLineZ),
        ),
      });
    }
    let visibleTails = 0;
    if (hasSustains) {
      this.ensureInstancedTailBatches();
      this.instancedTailBatch!.updateScroll(
        this.context.getCameraTick(),
        this.context.getPpqn(),
        nearBoardZ,
        this.context.getScrollSpeedMultiplier?.() ?? 1,
      );
      visibleTails = this.instancedTailBatch!.write(tailData);
    } else {
      this.instancedTailBatch?.write([]);
      this.instancedPreviewTailBatch?.write([]);
    }
    const previewSustains = !hasSustains
      ? 0
      : this.drawSustainCutPreviewRemainders(
          chart,
          cutPreview,
          visibleStart,
          visibleTailEnd,
        );
    this.scene.userData.visibleNotes = visibleNotes.length;
    this.scene.userData.visibleSustains = visibleTails + previewSustains;

    const selection = session.selection;
    const chartRevision = chart.getNoteRevision();
    const selectionRevision = selection.getRevision();
    const noteBatchDirty =
      this.lastInstancedChart !== chart ||
      this.lastInstancedChartRevision !== chartRevision ||
      this.lastInstancedSelectionRevision !== selectionRevision ||
      this.lastInstancedVisibleEntries.length !== visibleNotes.length ||
      visibleNotes.some(
        (entry, index) => this.lastInstancedVisibleEntries[index] !== entry,
      );
    this.scene.userData.noteBatchDirty = noteBatchDirty;
    const noteData: Record<"note" | NoteShapeKind, NoteInstanceData[]> = {
      note: [],
      bar: [],
      cymbal: [],
      pad: [],
    };
    if (noteBatchDirty) {
      const noteStyles = fiveFretNoteStyles(
        chart,
        session,
        this.context.getPpqn(),
      );
      for (const note of visibleNotes) {
        if (note.kind === "phrase") continue;
        const instanceKind =
          note.kind === "bar" || note.kind === "cymbal" || note.kind === "pad"
            ? note.kind
            : undefined;
        const placement = HIGHWAY_GEOMETRY_CATALOG[instanceKind ?? "note"];
        const position = noteWorldPosition(
          note.kind === "bar" ? 0 : this.coordinates.getLaneX(note.lane),
          this.coordinates.getNoteZ(note.start),
          placement.transform,
          placement.placementOffset,
        );
        noteData[instanceKind ?? "note"].push({
          x: position.x,
          y: position.y,
          z: position.z - this.coordinates.getNoteZ(note.start),
          color:
            note.kind === "bar"
              ? kickRgb
              : (laneColors[note.lane] ?? fallbackBarRgb),
          selected: selection.isSelected(note.id),
          hopo: note.source ? noteStyles.get(note.source)?.hopo : undefined,
          tap: note.source ? noteStyles.get(note.source)?.tap : undefined,
          tick: note.start,
          priority: Math.abs(
            note.start - this.coordinates.getTickAtDepth(strikeLineZ),
          ),
        });
      }
    }
    for (const kind of ["note", "bar", "cymbal", "pad"] as const) {
      const instances = noteData[kind];
      const batch = this.instancedGemBatches[kind];
      if (instances.length > 0) this.ensureInstancedGemBatch(kind);
      const activeBatch = this.instancedGemBatches[kind] ?? batch;
      activeBatch?.updateScroll(
        this.context.getCameraTick(),
        this.context.getPpqn(),
        nearBoardZ,
        this.context.getScrollSpeedMultiplier?.() ?? 1,
      );
      if (!noteBatchDirty && activeBatch) activeBatch.lastWriteMs = 0;
      if (noteBatchDirty) activeBatch?.write(instances);
    }
    this.lastInstancedChart = chart;
    this.lastInstancedChartRevision = chartRevision;
    this.lastInstancedSelectionRevision = selectionRevision;
    if (noteBatchDirty) this.lastInstancedVisibleEntries = visibleNotes.slice();
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
    this.drawGhostGem();
    this.drawHoverOutline(chart);
    recordDrawDuration();
  }

  public updateMarqueeOutline(marquee: HighwayMarqueeDragState | null): void {
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
      delete this.instancedGemBatches[key as "note" | NoteShapeKind];
    });
    this.instancedTailBatch?.dispose();
    this.instancedPreviewTailBatch?.dispose();
    this.instancedTailBatch = null;
    this.instancedPreviewTailBatch = null;
    this.beatLineInstances.forEach(({ mesh, material }) => {
      mesh.geometry.dispose();
      material.dispose();
      mesh.removeFromParent();
    });
    this.beatLineInstances.length = 0;
    this.phraseSpanInstances.forEach((mesh) => mesh.removeFromParent());
    this.phraseSpanInstances.length = 0;
    this.phraseSpanGeometry.dispose();
    this.selectionRangeIndicator.geometry.dispose();
    (this.selectionRangeIndicator.material as THREE.Material).dispose();
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
      delete this.drumGhostGems[kind as NoteShapeKind];
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
        bar: this.assetRegistry.getMesh("kickNote"),
        cymbal: this.assetRegistry.getMesh("cymbalNote"),
        pad: this.assetRegistry.getMesh("roundNote"),
      };
      const drumPrimitiveRoles: Record<NoteShapeKind, PrimitiveMaterialRole[]> =
        {
          bar: primitiveRolesForModel(
            drumModels.bar.value!,
            drumModels.bar.definition.definition,
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
      for (const kind of ["bar", "cymbal", "pad"] as const) {
        const variants = this.materials.drum[kind];
        const ghostGeometry =
          HIGHWAY_GEOMETRY_CATALOG[SHAPE_GHOST_GEOMETRY_IDS[kind]];
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
            baseColor: fallbackBarRgb,
            emissionColor:
              drumPrimitiveRoles[kind][primitiveIndex] === "neutral"
                ? [1, 1, 1]
                : fallbackBarRgb,
            alpha: 0.35,
            ghost: true,
            tint: drumPrimitiveRoles[kind][primitiveIndex] === "tinted",
          }),
        );
        this.drumGhostGems[kind] = ghost;
        this.scene.add(ghost.object);
      }
      this.fretAssemblies = fallbackLaneRgbColors
        .slice(0, maxLaneColumns)
        .map((color, lane) => {
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
          const placement = HIGHWAY_GEOMETRY_CATALOG.fret.placementOffset ?? {
            x: 0,
            y: 0,
            z: 0,
          };
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
          baseColor: fallbackLaneRgbColors[0]!,
          emissionColor:
            noteRoles[primitiveIndex] === "neutral"
              ? [1, 1, 1]
              : fallbackLaneRgbColors[0]!,
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
    for (let lane = 0; lane <= maxLaneColumns; lane++) {
      const divider = new THREE.Mesh(
        new THREE.BoxGeometry(0.05, 0.08, boardDepth),
        new THREE.MeshBasicMaterial({ color: 0x64748b }),
      );
      divider.position.set(
        -3 + (6 * lane) / maxLaneColumns,
        -0.05,
        boardCenterZ,
      );
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
    const session = this.context.getEditingSession();
    if (!session) {
      this.hidePhraseSpans();
      return;
    }
    const visibleStart = Math.max(
      0,
      this.coordinates.getTickAtDepth(nearBoardZ),
    );
    const visibleEnd = this.coordinates.getTickAtDepth(farBoardZ);
    const visibleEntries: IndexedNote[] = [];
    getHighwayNoteIndex(chart).query(
      chart,
      session,
      this.context.getPreviewState(),
      visibleStart,
      visibleEnd,
      visibleEntries,
    );
    const phrases: Array<{
      id: EntityId | null;
      start: number;
      end: number;
      kind: string;
    }> = visibleEntries
      .filter(
        (entry) =>
          entry.kind === "phrase" &&
          entry.phraseKind !== null &&
          entry.id !== this.phraseEditing.getDragState()?.id,
      )
      .map((entry) => ({
        id: entry.id,
        start: entry.start,
        end: entry.end,
        kind: entry.phraseKind!,
      }));
    const phraseDrag = this.phraseEditing.getDragState();
    if (phraseDrag) {
      const start = Math.min(phraseDrag.startTick, phraseDrag.endTick);
      const end = Math.max(phraseDrag.startTick, phraseDrag.endTick);
      if (end >= visibleStart && start <= visibleEnd) {
        phrases.push({
          id: phraseDrag.id,
          kind: phraseDrag.kind,
          start,
          end,
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
        phrase.id !== null && session.selection.isSelected(phrase.id)
          ? this.selectedPhraseMaterial
          : phrase.id !== null &&
              phrase.id === this.context.getPhraseHoverState()?.id &&
              this.context.getPhraseHoverState()?.operation === "move"
            ? this.hoveredPhraseMaterial
            : this.phraseMaterialFor(chart, phrase.kind);
      mesh.visible = true;
    }
    for (; index < this.phraseSpanInstances.length; index++) {
      this.phraseSpanInstances[index].visible = false;
    }
    this.drawPhraseAffordances(phrases, phraseDrag);
  }

  /** Stage-power style phrases are gold; every other phrase effect is blue. */
  private phraseMaterialFor(chart: ChartView, phraseId: string) {
    const effect = chart.getPhrases().find((p) => p.id === phraseId)?.effect;
    return effect === "starPower" || effect === "starPowerActivation"
      ? this.stagepowerMaterial
      : this.soloMaterial;
  }

  private drawPhraseAffordances(
    phrases: Array<{
      id: string | null;
      start: number;
      end: number;
      kind: string;
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
    const activePhraseId = phraseDrag?.id ?? hover?.id;
    const phrase = phrases.find((item) => item.id === activePhraseId);
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

  private drawSelectionRange(): void {
    const range = this.context.getSelectionRange();
    if (!range) {
      this.selectionRangeIndicator.visible = false;
      return;
    }
    const visibleStart = Math.max(
      0,
      this.coordinates.getTickAtDepth(nearBoardZ),
    );
    const visibleEnd = this.coordinates.getTickAtDepth(farBoardZ);
    const start = Math.max(visibleStart, Math.min(range.start, range.end));
    const end = Math.min(visibleEnd, Math.max(range.start, range.end));
    if (end < start) {
      this.selectionRangeIndicator.visible = false;
      return;
    }
    const startZ = this.coordinates.getNoteZ(start);
    const endZ = this.coordinates.getNoteZ(end);
    this.selectionRangeIndicator.position.set(0, -0.035, (startZ + endZ) / 2);
    this.selectionRangeIndicator.scale.z = Math.max(
      0.03,
      Math.abs(startZ - endZ),
    );
    this.selectionRangeIndicator.visible = true;
  }

  private hidePhraseAffordances(): void {
    this.phrasePlacementIndicator.visible = false;
    this.phraseStartBoundaryIndicator.visible = false;
    this.phraseEndBoundaryIndicator.visible = false;
  }

  private drawSectionMarkers(chart: ChartView): void {
    const track = chart.getTrack()?.getMidiTrack();
    if (!track) {
      this.hideSectionMarkers();
      return;
    }
    const sections = getSections(track);
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

  private hideAllObjects(): void {
    Object.values(this.instancedGemBatches).forEach((batch) => batch.write([]));
    this.instancedTailBatch?.write([]);
    this.instancedPreviewTailBatch?.write([]);
    this.beatLineInstances.forEach(({ mesh }) => (mesh.visible = false));
    this.sustainCutPreviewLine.visible = false;
    if (this.ghostGem) this.ghostGem.object.visible = false;
    Object.values(this.drumGhostGems).forEach((gem) => {
      if (gem) gem.object.visible = false;
    });
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
    if (!chartHasSustains(chart)) return new Map();
    const location = this.context.getGhostNoteLocation();
    if (!location || !this.context.canShowNotePlacementPreview())
      return new Map();
    const sameLanePlacement =
      location.sustainHit !== null &&
      laneVisualFor(chart, location.sustainHit.pitch)?.lane === location.lane;
    const targets = getSustainCutTargets(
      chart.getNotes().filter((note) => laneVisualFor(chart, note.pitch)),
      location.tick,
      getSustainCutOptions(
        location.shiftKey,
        location.sustainHit?.noteOn ?? null,
        sameLanePlacement,
      ),
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
    this.ensureInstancedTailBatches();
    const previewData: SustainInstanceData[] = [];
    const cutTick = this.context.getGhostNoteLocation()?.tick;
    if (cutTick === undefined) return this.instancedPreviewTailBatch!.write([]);
    for (const note of cutPreview.values()) {
      const visual = laneVisualFor(chart, note.pitch);
      if (!visual || visual.kind === "bar") continue;
      const lane = visual.lane;
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
        color: columnColors(chart)[lane] ?? fallbackBarRgb,
        selected: false,
        startTick: start,
        endTick: end,
        priority: Math.abs(
          note.start - this.coordinates.getTickAtDepth(strikeLineZ),
        ),
      });
    }
    this.instancedPreviewTailBatch!.updateScroll(
      this.context.getCameraTick(),
      this.context.getPpqn(),
      nearBoardZ,
      this.context.getScrollSpeedMultiplier?.() ?? 1,
    );
    return this.instancedPreviewTailBatch!.write(previewData);
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

  private ensureInstancedGemBatch(kind: "note" | NoteShapeKind): void {
    if (this.instancedGemBatches[kind] || !this.materials) return;
    const meshKey =
      kind === "bar"
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
    const session = this.context.getEditingSession();
    const chart = this.context.getCurrentChart();
    if (this.ghostGem) this.ghostGem.object.visible = false;
    Object.values(this.drumGhostGems).forEach((gem) => {
      if (gem) gem.object.visible = false;
    });
    if (
      !location ||
      !session ||
      !chart ||
      !this.context.canShowNotePlacementPreview()
    ) {
      return;
    }

    // What would be written here? The mode's projection resolves the pitch
    // for the current placement; the ruleset says what that pitch looks like.
    const projection = session.getProjection();
    const row = projection
      .getRows()
      .find(
        (candidate) =>
          candidate.kind === "lane" && candidate.index === location.lane,
      );
    const pitch = row
      ? projection.pitchForRow(row, session.getToolState())
      : null;
    const visual = pitch === null ? null : laneVisualFor(chart, pitch);
    if (!visual) return;

    const shape: NoteShapeKind | null =
      visual.kind === "note" ? null : visual.kind;
    const ghostGem = shape ? this.drumGhostGems[shape] : this.ghostGem;
    if (!ghostGem) return;
    const placement =
      HIGHWAY_GEOMETRY_CATALOG[
        shape ? SHAPE_GHOST_GEOMETRY_IDS[shape] : "ghost"
      ];
    const position = noteWorldPosition(
      visual.kind === "bar" ? 0 : this.coordinates.getLaneX(location.lane),
      this.coordinates.getNoteZ(location.tick),
      placement.transform,
      placement.placementOffset,
    );
    const laneColor =
      visual.kind === "bar"
        ? barColor(chart)
        : (columnColors(chart)[location.lane] ?? fallbackBarRgb);
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

  /** Lays out dividers and fret caps for the chart's columns and colours. */
  private updateFretboardPalette(colors: readonly Rgb[]): void {
    const activeLaneCount = Math.max(
      1,
      Math.min(colors.length, maxLaneColumns),
    );
    const key = colors.map((color) => color.join(",")).join("|");
    const paletteChanged = this.fretPaletteKey !== key;
    this.fretPaletteKey = key;
    this.laneDividers.forEach((divider, index) => {
      divider.visible = index <= activeLaneCount;
      if (divider.visible) {
        divider.position.x = -3 + (6 * index) / activeLaneCount;
      }
    });
    this.fretAssemblies.forEach((assembly, lane) => {
      assembly.visible = lane < activeLaneCount;
      assembly.position.x = this.coordinates.getLaneX(lane);
      const color = colors[lane];
      if (!paletteChanged || lane >= activeLaneCount || !color) return;
      assembly.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        setMaterialState(object, {
          baseColor: color,
          emissionColor: color,
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
    const visual = laneVisualFor(chart, note.pitch);
    const bounds = !visual
      ? null
      : visual.kind === "bar"
        ? this.hitTesting.getBarScreenBounds(note)
        : this.hitTesting.getGemScreenBounds(note, visual.lane, visual.kind);
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
