import type { MidiNote } from "@midiedit/core";
import {
  getNotePhrases,
  getPhrasePitch,
  type EditablePhraseKind,
  type MidiNotePhrase,
  type ChartView,
} from "@midiedit/views";
import * as THREE from "three";
import type { ModelCalibration } from "./geometry";
import { noteWorldPosition } from "./geometry";
import { farBoardZ, laneCount, strikeLineZ } from "./constants";
import type { PhraseDragState, ScreenBounds } from "./types";
import { HighwayCoordinateSystem } from "./coordinates";

export class HighwayHitTester {
  private readonly coordinates: HighwayCoordinateSystem;
  private readonly getNoteCalibration: () => ModelCalibration;

  public constructor(
    coordinates: HighwayCoordinateSystem,
    getNoteCalibration: () => ModelCalibration,
  ) {
    this.coordinates = coordinates;
    this.getNoteCalibration = getNoteCalibration;
  }

  public getNoteAt(chart: ChartView, event: MouseEvent): MidiNote | undefined {
    const pointer = this.coordinates.getCanvasPoint(event);
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
    const pointer = this.coordinates.getCanvasPoint(event);
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
  ): PhraseDragState["operation"] {
    const distanceToStart = Math.abs(tick - phrase.start);
    const distanceToEnd = Math.abs(tick - phrase.end);
    const edgeThreshold = this.coordinates.getSnapTicks() * 2;
    return Math.min(distanceToStart, distanceToEnd) > edgeThreshold
      ? "move"
      : distanceToStart <= distanceToEnd
        ? "resize-start"
        : "resize-end";
  }

  public getPhraseScreenBounds(phrase: MidiNotePhrase): ScreenBounds | null {
    const points = [
      new THREE.Vector3(-3, -0.035, this.coordinates.getNoteZ(phrase.start)),
      new THREE.Vector3(3, -0.035, this.coordinates.getNoteZ(phrase.start)),
      new THREE.Vector3(-3, -0.035, this.coordinates.getNoteZ(phrase.end)),
      new THREE.Vector3(3, -0.035, this.coordinates.getNoteZ(phrase.end)),
    ]
      .map((point) => this.coordinates.worldToScreen(point))
      .filter((value): value is THREE.Vector2 => value !== null);
    if (points.length === 0) return null;
    return {
      left: Math.min(...points.map((point) => point.x)),
      right: Math.max(...points.map((point) => point.x)),
      top: Math.min(...points.map((point) => point.y)) - 8,
      bottom: Math.max(...points.map((point) => point.y)) + 8,
    };
  }

  public getGemScreenBounds(note: MidiNote, lane: number): ScreenBounds | null {
    if (lane < 0 || lane >= laneCount) return null;
    const calibration = this.getNoteCalibration();
    const position = noteWorldPosition(
      this.coordinates.getLaneX(lane),
      this.coordinates.getNoteZ(note.start),
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
