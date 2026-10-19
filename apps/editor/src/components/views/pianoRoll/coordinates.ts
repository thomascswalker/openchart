import type { TempoEvent } from "@openchart/core";
import { msToTicks, ticksToMs } from "@openchart/core";
import { clamp } from "es-toolkit";
import { Box2, Vector2 } from "three";
import {
  HeaderHeight,
  KeyboardWidth,
  MaximumPixelsPerQuarter,
  MaximumPixelsPerSemitone,
  MillisecondsPerTimelineUnit,
  MinimumPixelsPerQuarter,
  MinimumPixelsPerSemitone,
  ZoomSensitivity,
} from "./constants";
import type { ChartViewState } from "../AbstractChartView";
import {
  DefaultProfile,
  gridTopFor,
  type LaneDef,
  type PianoRollProfile,
  type PitchRange,
} from "./profile";
import type { PianoRollCamera, PianoRollNote, ScreenBand } from "./types";

/** What the coordinate system needs to know about the surrounding view. */
export interface CoordinateSystemContext {
  /** Ticks per quarter note of the loaded document. */
  getPpqn(): number;

  /** Tempo changes of the document, ordered by tick. */
  getTempoEvents(): TempoEvent[];

  /** Current chart view state; supplies the snap settings. */
  getState(): ChartViewState;

  /** Canvas size, needed to clamp the camera. Treated as 0 when omitted. */
  getViewport?(): { height: number };

  /** Optional so callers without a profile keep the default 0-127 grid. */
  getProfile?(): PianoRollProfile;
}

/** Tick extents and pitch extents of a set of notes. */
interface NoteExtents {
  /** Earliest start tick. */
  minTick: number;

  /** Latest end tick. */
  maxTick: number;

  /** Lowest pitch. */
  minPitch: number;

  /** Highest pitch. */
  maxPitch: number;
}

/** A horizontal position under the cursor that zooming keeps fixed. */
interface HorizontalAnchor {
  /** Pixels from the left edge of the note area. */
  offsetX: number;

  /** Timeline position, in milliseconds, under that pixel. */
  timeMs: number;
}

/** Padding factor applied around a selection when focusing it. */
const FocusPadding = 1.2;

/** Rounds to a whole, non-negative tick. */
function roundToWholeTick(tick: number): number {
  return Math.max(0, Math.round(tick));
}

/** Finds the tick and pitch extents of a non-empty set of notes. */
function measureNotes(notes: readonly PianoRollNote[]): NoteExtents {
  const extents: NoteExtents = {
    minTick: Infinity,
    maxTick: -Infinity,
    minPitch: Infinity,
    maxPitch: -Infinity,
  };

  for (const note of notes) {
    extents.minTick = Math.min(extents.minTick, note.tick);
    extents.maxTick = Math.max(extents.maxTick, note.tick + note.durationTicks);
    extents.minPitch = Math.min(extents.minPitch, note.pitch);
    extents.maxPitch = Math.max(extents.maxPitch, note.pitch);
  }

  return extents;
}

/** Tempo-aware conversion and camera math used by every piano-roll surface. */
export class CoordinateSystem {
  /** Supplies document, tempo, profile and viewport information. */
  private readonly context: CoordinateSystemContext;

  /** The live camera that panning and zooming mutate. */
  private readonly camera: PianoRollCamera;

  public constructor(
    context: CoordinateSystemContext,
    camera: PianoRollCamera,
  ) {
    this.context = context;
    this.camera = camera;
  }

  /** Active profile, or the default one when the context supplies none. */
  public getProfile(): PianoRollProfile {
    return this.context.getProfile?.() ?? DefaultProfile;
  }

  /** Inclusive pitch range the camera, pointer and transpose clamp to. */
  public getPitchRange(): PitchRange {
    return this.getProfile().pitchRange;
  }

  /**
   * Screen Y where the scrolling pitch grid starts: below the header and any
   * pinned lanes. `HeaderHeight` remains the header's own hit-test bound.
   */
  public getGridTop(): number {
    return gridTopFor(this.getProfile(), HeaderHeight, this.camera.v);
  }

  /** Clamps a pitch into the profile's pitch range. */
  public clampPitch(pitch: number): number {
    const range = this.getPitchRange();
    return clamp(pitch, range.low, range.high);
  }

  /** Clamps the camera so the keyboard's lowest pitch stays in view. */
  public clampCameraY(y: number): number {
    const range = this.getPitchRange();
    const viewportHeight = this.context.getViewport?.().height ?? 0;
    const visiblePitchRows = Math.max(
      0,
      (viewportHeight - this.getGridTop()) / this.camera.v,
    );

    // Lowest camera.y that still keeps range.low on screen.
    const minimumY = Math.min(
      range.high,
      Math.max(range.low, range.low - 1 + visiblePitchRows),
    );

    return clamp(y, minimumY, range.high);
  }

  /** The pinned lane under a screen Y, or null for the header and grid. */
  public laneAtScreenY(y: number): LaneDef | null {
    if (y < HeaderHeight || y >= this.getGridTop()) return null;

    const laneIndex = Math.floor((y - HeaderHeight) / this.camera.v);
    return this.getProfile().pinnedLanes[laneIndex] ?? null;
  }

  /** Screen-space top and height of a pinned lane. */
  public laneRect(lane: LaneDef): ScreenBand {
    const index = this.getProfile().pinnedLanes.indexOf(lane);

    return {
      y: HeaderHeight + Math.max(0, index) * this.camera.v,
      height: this.camera.v,
    };
  }

  /** Screen rect of a pitch drawn in a pinned lane, or null for grid notes. */
  public pinnedRectForPitch(pitch: number): ScreenBand | null {
    const lane = this.getProfile().laneForPitch(pitch);
    return lane ? this.laneRect(lane) : null;
  }

  /** Converts a wheel delta into a multiplicative zoom factor. */
  public getZoomFactor(value: number): number {
    return Math.exp(value * ZoomSensitivity);
  }

  /** The live camera. */
  public getCamera(): PianoRollCamera {
    return this.camera;
  }

  /** Number of ticks visible across a viewport `width` pixels wide. */
  public getVisibleTickSpan(width: number): number {
    const noteAreaWidth = Math.max(1, width - KeyboardWidth);
    return this.tickAtScreenX(KeyboardWidth + noteAreaWidth) - this.camera.x;
  }

  /** Scrolls so `tick` is at the left edge; never scrolls before tick 0. */
  public setCameraTick(tick: number): void {
    this.camera.x = Math.max(0, tick);
  }

  /** Length, in ticks, of one snap step at the current snap denominator. */
  public getSnapTicks(): number {
    const snap = this.context.getState().snap;
    return (this.context.getPpqn() * 4) / snap.denominator;
  }

  /** Snaps down to the start of the snap step containing `tick`. */
  public snapTick(tick: number): number {
    return this.snapTickWith(tick, Math.floor);
  }

  /** Snaps to the closest snap step. */
  public snapTickToNearest(tick: number): number {
    return this.snapTickWith(tick, Math.round);
  }

  /**
   * Snaps `tick` to the snap grid, using `roundToStep` to choose a whole step
   * count. Falls back to plain rounding when snapping is off or unusable.
   */
  private snapTickWith(
    tick: number,
    roundToStep: (steps: number) => number,
  ): number {
    if (!this.context.getState().snap.enabled) return roundToWholeTick(tick);

    const ticksPerSnap = this.getSnapTicks();
    if (!Number.isFinite(ticksPerSnap) || ticksPerSnap <= 0) {
      return roundToWholeTick(tick);
    }

    return Math.max(0, roundToStep(tick / ticksPerSnap) * ticksPerSnap);
  }

  /** Tick under a screen X, accounting for tempo changes. */
  public tickAtScreenX(x: number): number {
    const cameraMs = this.ticksToMilliseconds(this.camera.x);
    const offsetMs = this.pixelsToMilliseconds(x - KeyboardWidth);
    return this.millisecondsToTicks(cameraMs + offsetMs);
  }

  /** Pitch row under a screen Y, clamped to the profile's pitch range. */
  public pitchAtScreenY(y: number): number {
    const pitch = Math.ceil(
      this.camera.y - (y - this.getGridTop()) / this.camera.v,
    );
    return this.clampPitch(pitch);
  }

  /** Horizontal timeline position of a tick, in 500 ms timeline units. */
  public timelineUnitsAtTick(tick: number): number {
    return this.ticksToMilliseconds(tick) / MillisecondsPerTimelineUnit;
  }

  /** Screen X of a tick. */
  public screenXForTick(tick: number): number {
    const unitsFromCamera =
      this.timelineUnitsAtTick(tick) - this.timelineUnitsAtTick(this.camera.x);

    return KeyboardWidth + unitsFromCamera * this.camera.h;
  }

  /** Converts a point or rect from grid space to screen space. */
  public toScreenSpace(value: Vector2): Vector2;
  public toScreenSpace(value: Box2): Box2;
  public toScreenSpace(value: Vector2 | Box2): Vector2 | Box2;
  public toScreenSpace(value: Vector2 | Box2): Vector2 | Box2 {
    if (value instanceof Box2) {
      return new Box2(
        this.projectToScreen(value.min),
        this.projectToScreen(value.max),
      );
    }

    return this.projectToScreen(value);
  }

  /** Projects one grid-space point to a new screen-space point. */
  private projectToScreen(point: Vector2): Vector2 {
    const screenX =
      point.x - this.timelineUnitsAtTick(this.camera.x) * this.camera.h;
    const screenY = point.y + this.camera.y * this.camera.v + this.getGridTop();

    return new Vector2(screenX, screenY);
  }

  /** Scrolls the camera by a pixel delta, staying within the pitch range. */
  public pan(dx: number, dy: number): void {
    // Horizontal: move along the tempo-aware timeline.
    this.scrollToAnchor(this.ticksToMilliseconds(this.camera.x), dx);

    // Vertical: move by whole-pixel rows, then keep the keyboard in view.
    this.camera.y = this.clampCameraY(this.camera.y + dy / this.camera.v);
  }

  /** Zooms horizontally, keeping the timeline position under `mouseX` fixed. */
  public zoomHorizontal(zoomFactor: number, mouseX: number): void {
    const anchor = this.getHorizontalAnchor(mouseX);

    this.camera.h = this.clampHorizontalZoom(this.camera.h * zoomFactor);
    this.scrollToAnchor(anchor.timeMs, anchor.offsetX);
  }

  /** Zooms both axes, keeping the point under `cursor` fixed. */
  public zoomAtCursor(zoomFactor: number, cursor: Vector2): void {
    const horizontalAnchor = this.getHorizontalAnchor(cursor.x);
    const anchorY = cursor.y - this.getGridTop();
    const anchorPitch = this.camera.y - anchorY / this.camera.v;

    this.camera.h = this.clampHorizontalZoom(this.camera.h * zoomFactor);
    this.camera.v = this.clampVerticalZoom(this.camera.v * zoomFactor);

    this.scrollToAnchor(horizontalAnchor.timeMs, horizontalAnchor.offsetX);
    this.camera.y = this.clampCameraY(anchorPitch + anchorY / this.camera.v);
  }

  /** Zooms vertically, keeping the pitch under `mouseY` fixed. */
  public zoomVertical(zoomFactor: number, mouseY: number): void {
    const anchorPitch = this.camera.y - mouseY / this.camera.v;

    this.camera.v = this.clampVerticalZoom(this.camera.v * zoomFactor);
    this.camera.y = this.clampCameraY(anchorPitch + mouseY / this.camera.v);
  }

  /** Zooms and scrolls so `notes` fill the viewport with some padding. */
  public focusSelection(
    notes: PianoRollNote[],
    width: number,
    height: number,
  ): void {
    if (notes.length === 0) return;

    const extents = measureNotes(notes);
    const noteAreaWidth = Math.max(1, width - KeyboardWidth);
    const noteAreaHeight = Math.max(1, height - this.getGridTop());

    // Time extents of the selection, measured on the tempo-aware timeline.
    const selectionStartMs = this.ticksToMilliseconds(extents.minTick);
    const selectionEndMs = this.ticksToMilliseconds(extents.maxTick);
    const timelineSpanMs =
      Math.max(1, selectionEndMs - selectionStartMs) * FocusPadding;
    const pitchSpan =
      Math.max(1, extents.maxPitch - extents.minPitch + 1) * FocusPadding;

    // Choose the zoom that fits both spans.
    this.camera.h = this.clampHorizontalZoom(
      (noteAreaWidth * MillisecondsPerTimelineUnit) / timelineSpanMs,
    );
    this.camera.v = this.clampVerticalZoom(noteAreaHeight / pitchSpan);

    // Center the selection in the viewport.
    const visibleTimelineSpanMs = this.pixelsToMilliseconds(noteAreaWidth);
    this.camera.x = Math.max(
      0,
      this.millisecondsToTicks(
        (selectionStartMs + selectionEndMs) / 2 - visibleTimelineSpanMs / 2,
      ),
    );
    this.camera.y = this.clampCameraY(
      extents.maxPitch + 1 + (noteAreaHeight / this.camera.v - pitchSpan) / 2,
    );
  }

  /** Fits the profile's whole pitch range into the visible grid height. */
  public fitPitchRange(height: number): void {
    const range = this.getPitchRange();
    const pitchRows = range.high - range.low + 1;
    const rowCount = pitchRows + this.getProfile().pinnedLanes.length;
    const viewHeight = Math.max(1, height - HeaderHeight);

    this.camera.v = this.clampVerticalZoom(viewHeight / rowCount);
    this.camera.y = range.high;
  }

  /** Converts a tick to milliseconds along the document's tempo map. */
  private ticksToMilliseconds(tick: number): number {
    return ticksToMs(
      tick,
      this.context.getPpqn(),
      this.context.getTempoEvents(),
    );
  }

  /** Converts milliseconds along the document's tempo map to a tick. */
  private millisecondsToTicks(milliseconds: number): number {
    return msToTicks(
      milliseconds,
      this.context.getPpqn(),
      this.context.getTempoEvents(),
    );
  }

  /** Converts a horizontal pixel distance to timeline milliseconds. */
  private pixelsToMilliseconds(pixels: number): number {
    return (pixels / this.camera.h) * MillisecondsPerTimelineUnit;
  }

  /**
   * Scrolls so the timeline position `anchorMs` sits `anchorOffsetX` pixels
   * from the left edge of the note area. Never scrolls before tick 0.
   */
  private scrollToAnchor(anchorMs: number, anchorOffsetX: number): void {
    const leftEdgeMs = anchorMs - this.pixelsToMilliseconds(anchorOffsetX);
    this.camera.x = Math.max(0, this.millisecondsToTicks(leftEdgeMs));
  }

  /** Captures the timeline position under `mouseX` before a zoom changes it. */
  private getHorizontalAnchor(mouseX: number): HorizontalAnchor {
    const offsetX = Math.max(0, mouseX - KeyboardWidth);
    const anchorTick = this.tickAtScreenX(KeyboardWidth + offsetX);

    return { offsetX, timeMs: this.ticksToMilliseconds(anchorTick) };
  }

  /** Clamps a horizontal zoom to its allowed range. */
  private clampHorizontalZoom(zoom: number): number {
    return clamp(zoom, MinimumPixelsPerQuarter, MaximumPixelsPerQuarter);
  }

  /** Clamps a vertical zoom to its allowed range. */
  private clampVerticalZoom(zoom: number): number {
    return clamp(zoom, MinimumPixelsPerSemitone, MaximumPixelsPerSemitone);
  }
}
