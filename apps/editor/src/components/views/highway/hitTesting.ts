import type { MidiNote } from "@midiedit/core";
import {
  getNotePhrases,
  getPhrasePitch,
  type EditablePhraseKind,
  type MidiNotePhrase,
  type ChartView,
} from "@midiedit/views";
import * as THREE from "three";
import { HIGHWAY_GEOMETRY_CATALOG, type GeometryId } from "./geometryCatalog";
import type { MeshKey } from "../../../rendering/registry";
import { noteWorldPosition } from "./geometry";
import { farBoardZ, laneCount, nearBoardZ, strikeLineZ } from "./constants";
import type { PhraseDragState, ScreenBounds } from "./types";
import { HighwayCoordinateSystem } from "./coordinates";
import { getDrumNoteProfile } from "./drumProfile";

function physicalLaneForNote(chart: ChartView, note: MidiNote): number {
  if (chart.getTrack().getKey() === "drums") {
    const profile = getDrumNoteProfile(note.note, chart.getOffset());
    return profile?.kind === "kick" ? 0 : (profile?.lane ?? -1);
  }
  return note.note - chart.getOffset();
}

export interface PhraseBoundaryProjection {
  worldStart: THREE.Vector3;
  worldEnd: THREE.Vector3;
  screenStart: THREE.Vector2;
  screenEnd: THREE.Vector2;
}

export function getPhraseBoundaryHitOperation(
  point: THREE.Vector2,
  start: PhraseBoundaryProjection,
  end: PhraseBoundaryProjection,
  threshold: number,
): "resize-start" | "resize-end" | null {
  const startDistance = distanceToSegment(
    point,
    start.screenStart,
    start.screenEnd,
  );
  const endDistance = distanceToSegment(point, end.screenStart, end.screenEnd);
  if (startDistance > threshold && endDistance > threshold) return null;
  return startDistance <= endDistance ? "resize-start" : "resize-end";
}

function distanceToSegment(
  point: THREE.Vector2,
  start: THREE.Vector2,
  end: THREE.Vector2,
): number {
  const segment = end.clone().sub(start);
  const lengthSquared = segment.lengthSq();
  const projection =
    lengthSquared === 0
      ? 0
      : Math.max(
          0,
          Math.min(1, point.clone().sub(start).dot(segment) / lengthSquared),
        );
  return point.distanceTo(start.clone().addScaledVector(segment, projection));
}

export class HighwayHitTester {
  private readonly coordinates: HighwayCoordinateSystem;
  private readonly modelBounds = new Map<MeshKey, THREE.Box3>();

  public constructor(coordinates: HighwayCoordinateSystem) {
    this.coordinates = coordinates;
  }

  public setModelBounds(meshKey: MeshKey, bounds: THREE.Box3): void {
    this.modelBounds.set(meshKey, bounds.clone());
  }

  public getNoteAt(chart: ChartView, event: MouseEvent): MidiNote | undefined {
    const pointer = this.coordinates.getCanvasPoint(event);
    if (!pointer) return undefined;
    let hit: MidiNote | undefined;
    let nearestDepth = Infinity;
    for (const note of chart.getNotes()) {
      const profile =
        chart.getTrack().getKey() === "drums"
          ? getDrumNoteProfile(note.note, chart.getOffset())
          : null;
      const lane = physicalLaneForNote(chart, note);
      const gemBounds =
        profile?.kind === "kick"
          ? this.getKickScreenBounds(note)
          : this.getGemScreenBounds(
              note,
              lane,
              profile?.kind === "pad" || profile?.kind === "cymbal"
                ? profile.kind
                : "note",
            );
      const tailBounds = profile ? null : this.getTailScreenBounds(note, lane);
      if (
        (!gemBounds ||
          !this.containsScreenPoint(gemBounds, pointer.x, pointer.y)) &&
        (!tailBounds ||
          !this.containsScreenPoint(tailBounds, pointer.x, pointer.y))
      ) {
        continue;
      }
      const depth = note.start - this.coordinates.getTickAtDepth(strikeLineZ);
      if (depth < nearestDepth) {
        hit = note;
        nearestDepth = depth;
      }
    }
    return hit;
  }

  public getSustainAt(
    chart: ChartView,
    event: MouseEvent,
    tick: number,
  ): MidiNote | undefined {
    if (chart.getTrack().getKey() === "drums") return undefined;
    const pointer = this.coordinates.getCanvasPoint(event);
    if (!pointer) return undefined;
    let hit: MidiNote | undefined;
    let nearestDepth = Infinity;
    for (const note of chart.getNotes()) {
      if (tick <= note.start || tick >= note.end) continue;
      const bounds = this.getTailScreenBounds(
        note,
        physicalLaneForNote(chart, note),
      );
      if (!bounds || !this.containsScreenPoint(bounds, pointer.x, pointer.y)) {
        continue;
      }
      const depth = note.start - this.coordinates.getTickAtDepth(strikeLineZ);
      if (depth < nearestDepth) {
        hit = note;
        nearestDepth = depth;
      }
    }
    return hit;
  }

  public getPhraseAt(
    chart: ChartView,
    event: MouseEvent,
    kind: EditablePhraseKind,
  ): MidiNotePhrase | undefined {
    const point = this.coordinates.getCanvasPoint(event);
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

  public getPhraseDragOperation(
    phrase: MidiNotePhrase,
    tick: number,
    event?: MouseEvent,
  ): PhraseDragState["operation"] {
    if (event) {
      const point = this.coordinates.getCanvasPoint(event);
      const start = this.getPhraseBoundaryProjection(phrase, "start");
      const end = this.getPhraseBoundaryProjection(phrase, "end");
      if (point && start && end) {
        return (
          getPhraseBoundaryHitOperation(
            new THREE.Vector2(point.x, point.y),
            start,
            end,
            9,
          ) ?? "move"
        );
      }
    }
    const distanceToStart = Math.abs(tick - phrase.start);
    const distanceToEnd = Math.abs(tick - phrase.end);
    const edgeThreshold = this.coordinates.getSnapTicks() * 2;
    return Math.min(distanceToStart, distanceToEnd) > edgeThreshold
      ? "move"
      : distanceToStart <= distanceToEnd
        ? "resize-start"
        : "resize-end";
  }

  public getPhraseBoundaryProjection(
    phrase: Pick<MidiNotePhrase, "start" | "end">,
    boundary: "start" | "end",
  ): PhraseBoundaryProjection | null {
    const tick = boundary === "start" ? phrase.start : phrase.end;
    const worldStart = new THREE.Vector3(
      -3,
      -0.035,
      this.coordinates.getNoteZ(tick),
    );
    const worldEnd = new THREE.Vector3(
      3,
      -0.035,
      this.coordinates.getNoteZ(tick),
    );
    const screenStart = this.coordinates.worldToScreen(worldStart);
    const screenEnd = this.coordinates.worldToScreen(worldEnd);
    if (!screenStart || !screenEnd) return null;
    return { worldStart, worldEnd, screenStart, screenEnd };
  }

  public getPhraseScreenBounds(
    phrase: Pick<MidiNotePhrase, "start" | "end">,
  ): ScreenBounds | null {
    const visibleStart = Math.max(
      0,
      this.coordinates.getTickAtDepth(nearBoardZ),
    );
    const visibleEnd = this.coordinates.getTickAtDepth(farBoardZ);
    const start = Math.max(phrase.start, visibleStart);
    const end = Math.min(phrase.end, visibleEnd);
    if (end < start) return null;

    const points = (["start", "end"] as const).flatMap((boundary) => {
      const projection = this.getPhraseBoundaryProjection(
        { start, end },
        boundary,
      );
      return projection ? [projection.screenStart, projection.screenEnd] : [];
    });
    if (points.length === 0) return null;
    return {
      left: Math.min(...points.map((point) => point.x)),
      right: Math.max(...points.map((point) => point.x)),
      top: Math.min(...points.map((point) => point.y)) - 8,
      bottom: Math.max(...points.map((point) => point.y)) + 8,
    };
  }

  public getGemScreenBounds(
    note: MidiNote,
    lane: number,
    geometryId: GeometryId = "note",
  ): ScreenBounds | null {
    if (lane < 0 || lane >= this.coordinates.getPhysicalLaneCount()) {
      return null;
    }
    const entry = HIGHWAY_GEOMETRY_CATALOG[geometryId];
    const transform = entry.transform;
    const position = noteWorldPosition(
      this.coordinates.getLaneX(lane),
      this.coordinates.getNoteZ(note.start),
      transform,
      entry.placementOffset,
    );
    const fallbackHalfExtents = entry.fallbackHalfExtents ?? {
      x: 0.5,
      y: 0.5,
      z: 0.5,
    };
    const bounds =
      (entry.meshKey && this.modelBounds.get(entry.meshKey)) ??
      new THREE.Box3(
        new THREE.Vector3(
          -fallbackHalfExtents.x,
          -fallbackHalfExtents.y,
          -fallbackHalfExtents.z,
        ),
        new THREE.Vector3(
          fallbackHalfExtents.x,
          fallbackHalfExtents.y,
          fallbackHalfExtents.z,
        ),
      );
    const corners: THREE.Vector3[] = [];
    for (const x of [bounds.min.x, bounds.max.x]) {
      for (const y of [bounds.min.y, bounds.max.y]) {
        for (const z of [bounds.min.z, bounds.max.z]) {
          corners.push(
            new THREE.Vector3(
              position.x + x * transform.scale.x,
              position.y + y * transform.scale.y,
              position.z + z * transform.scale.z,
            ),
          );
        }
      }
    }
    const projected = corners
      .map((corner) => this.coordinates.worldToScreen(corner))
      .filter((value): value is THREE.Vector2 => value !== null);
    if (!projected.length) return null;
    return {
      left: Math.min(...projected.map((corner) => corner.x)),
      right: Math.max(...projected.map((corner) => corner.x)),
      top: Math.min(...projected.map((corner) => corner.y)),
      bottom: Math.max(...projected.map((corner) => corner.y)),
    };
  }

  public getKickScreenBounds(note: MidiNote): ScreenBounds | null {
    return this.getGemScreenBounds(note, 0, "kick");
  }

  public getTailScreenBounds(
    note: MidiNote,
    lane: number,
  ): ScreenBounds | null {
    if (lane < 0 || lane >= laneCount || note.end <= note.start) return null;
    const tailStart = Math.max(
      note.start,
      this.coordinates.getTickAtDepth(strikeLineZ),
    );
    const tailEnd = Math.min(
      note.end,
      this.coordinates.getTickAtDepth(farBoardZ),
    );
    if (tailEnd <= tailStart) return null;
    const x = this.coordinates.getLaneX(lane);
    const points = [
      new THREE.Vector3(x - 0.16, -0.01, this.coordinates.getNoteZ(tailStart)),
      new THREE.Vector3(x + 0.16, -0.08, this.coordinates.getNoteZ(tailStart)),
      new THREE.Vector3(x - 0.16, -0.01, this.coordinates.getNoteZ(tailEnd)),
      new THREE.Vector3(x + 0.16, -0.08, this.coordinates.getNoteZ(tailEnd)),
    ]
      .map((point) => this.coordinates.worldToScreen(point))
      .filter((value): value is THREE.Vector2 => value !== null);
    if (!points.length) return null;
    return {
      left: Math.min(...points.map((point) => point.x)),
      right: Math.max(...points.map((point) => point.x)),
      top: Math.min(...points.map((point) => point.y)),
      bottom: Math.max(...points.map((point) => point.y)),
    };
  }

  public containsScreenPoint(
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
}
