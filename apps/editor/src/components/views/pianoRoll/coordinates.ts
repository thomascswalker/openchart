import type { TempoChange } from "@openchart/core";
import { msToTicks, ticksToMs } from "@openchart/core";
import { clamp } from "es-toolkit";
import type { CanvasPoint, CanvasRect } from "../../../rendering/geometry";
import {
  HeaderHeight,
  MaximumPixelsPerQuarter,
  MaximumPixelsPerSemitone,
  MinimumPixelsPerQuarter,
  MinimumPixelsPerSemitone,
  ZoomSensitivity,
} from "./constants";
import type { ChartViewState } from "../AbstractChartView";
import {
  GENERIC_PROFILE,
  gridTopFor,
  type LaneDef,
  type PianoRollProfile,
} from "./profile";
import type { PianoRollCamera, PianoRollNote } from "./types";

export interface CoordinateSystemContext {
  getPpqn(): number;
  getTempoChanges(): TempoChange[];
  getState(): ChartViewState;
  getViewport?(): { height: number };
  /** Optional so callers without a profile keep the generic 0-127 grid. */
  getProfile?(): PianoRollProfile;
}

/** Tempo-aware conversion and camera math used by every piano-roll surface. */
export class CoordinateSystem {
  private readonly context: CoordinateSystemContext;
  private readonly camera: PianoRollCamera;
  private readonly keyboardWidth: number;

  public constructor(
    context: CoordinateSystemContext,
    camera: PianoRollCamera,
    keyboardWidth: number,
  ) {
    this.context = context;
    this.camera = camera;
    this.keyboardWidth = keyboardWidth;
  }

  public getProfile(): PianoRollProfile {
    return this.context.getProfile?.() ?? GENERIC_PROFILE;
  }

  /** Inclusive pitch range the camera, pointer and transpose clamp to. */
  public getPitchRange(): { low: number; high: number } {
    return this.getProfile().pitchRange;
  }

  /**
   * Screen Y where the scrolling pitch grid starts: below the header and any
   * pinned lanes. `HeaderHeight` remains the header's own hit-test bound.
   */
  public getGridTop(): number {
    return gridTopFor(this.getProfile(), HeaderHeight, this.camera.v);
  }

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
    const minimumY = Math.min(
      range.high,
      Math.max(range.low, range.low - 1 + visiblePitchRows),
    );
    return clamp(y, minimumY, range.high);
  }

  /** The pinned lane under a screen Y, or null for the header and grid. */
  public laneAtScreenY(y: number): LaneDef | null {
    const profile = this.getProfile();
    if (y < HeaderHeight || y >= this.getGridTop()) return null;
    return (
      profile.pinnedLanes[Math.floor((y - HeaderHeight) / this.camera.v)] ??
      null
    );
  }

  /** Screen-space top and height of a pinned lane. */
  public laneRect(lane: LaneDef): { y: number; height: number } {
    const profile = this.getProfile();
    const index = profile.pinnedLanes.indexOf(lane);
    return {
      y: HeaderHeight + Math.max(0, index) * this.camera.v,
      height: this.camera.v,
    };
  }

  /** Screen rect of a pitch drawn in a pinned lane, or null for grid notes. */
  public pinnedRectForPitch(
    pitch: number,
  ): { y: number; height: number } | null {
    const lane = this.getProfile().laneForPitch(pitch);
    return lane ? this.laneRect(lane) : null;
  }

  public getZoomFactor(value: number): number {
    return Math.exp(value * ZoomSensitivity);
  }

  public getCamera(): PianoRollCamera {
    return this.camera;
  }

  public getKeyboardWidth(): number {
    return this.keyboardWidth;
  }

  public getVisibleTickSpan(width: number): number {
    const viewWidth = Math.max(1, width - this.keyboardWidth);
    return this.tickAtScreenX(this.keyboardWidth + viewWidth) - this.camera.x;
  }

  public setCameraTick(tick: number): void {
    this.camera.x = Math.max(0, tick);
  }

  public getSnapTicks(): number {
    const snap = this.context.getState().snap;
    return (this.context.getPpqn() * 4) / snap.denominator;
  }

  public snapTick(tick: number): number {
    const snap = this.context.getState().snap;
    if (!snap.enabled) {
      return Math.max(0, Math.round(tick));
    }

    const ticksPerSnap = this.getSnapTicks();
    if (!Number.isFinite(ticksPerSnap) || ticksPerSnap <= 0) {
      return Math.max(0, Math.round(tick));
    }

    return Math.max(0, Math.floor(tick / ticksPerSnap) * ticksPerSnap);
  }

  public snapTickToNearest(tick: number): number {
    const snap = this.context.getState().snap;
    if (!snap.enabled) {
      return Math.max(0, Math.round(tick));
    }

    const ticksPerSnap = this.getSnapTicks();
    if (!Number.isFinite(ticksPerSnap) || ticksPerSnap <= 0) {
      return Math.max(0, Math.round(tick));
    }

    return Math.max(0, Math.round(tick / ticksPerSnap) * ticksPerSnap);
  }

  public tickAtScreenX(x: number): number {
    const timelineMs =
      ticksToMs(
        this.camera.x,
        this.context.getPpqn(),
        this.context.getTempoChanges(),
      ) +
      ((x - this.keyboardWidth) / this.camera.h) * 500;

    return msToTicks(
      timelineMs,
      this.context.getPpqn(),
      this.context.getTempoChanges(),
    );
  }

  public pitchAtScreenY(y: number): number {
    const pitch = Math.ceil(
      this.camera.y - (y - this.getGridTop()) / this.camera.v,
    );
    return this.clampPitch(pitch);
  }

  public timelineUnitsAtTick(tick: number): number {
    return (
      ticksToMs(tick, this.context.getPpqn(), this.context.getTempoChanges()) /
      500
    );
  }

  public screenXForTick(tick: number): number {
    return (
      this.keyboardWidth +
      (this.timelineUnitsAtTick(tick) -
        this.timelineUnitsAtTick(this.camera.x)) *
        this.camera.h
    );
  }

  public toScreenSpace(value: CanvasPoint): CanvasPoint;
  public toScreenSpace(value: CanvasRect): CanvasRect;
  public toScreenSpace(
    value: CanvasPoint | CanvasRect,
  ): CanvasPoint | CanvasRect {
    const screenX =
      value.x - this.timelineUnitsAtTick(this.camera.x) * this.camera.h;
    const screenY = value.y + this.camera.y * this.camera.v + this.getGridTop();

    if (!("width" in value)) {
      return { x: screenX, y: screenY };
    }

    return {
      x: screenX,
      y: screenY,
      width: value.width,
      height: value.height,
    };
  }

  public pan(dx: number, dy: number): void {
    const tempoChanges = this.context.getTempoChanges();
    const cameraMs = ticksToMs(
      this.camera.x,
      this.context.getPpqn(),
      tempoChanges,
    );
    this.camera.x = msToTicks(
      cameraMs - (dx / this.camera.h) * 500,
      this.context.getPpqn(),
      tempoChanges,
    );
    this.camera.y += dy / this.camera.v;
    this.camera.x = Math.max(0, this.camera.x);
    this.camera.y = this.clampCameraY(this.camera.y);
  }

  public zoomHorizontal(zoomFactor: number, mouseX: number): void {
    const rollX = mouseX - this.keyboardWidth;
    const anchorX = Math.max(0, rollX);
    const anchorTick = this.tickAtScreenX(this.keyboardWidth + anchorX);
    const anchorMs = ticksToMs(
      anchorTick,
      this.context.getPpqn(),
      this.context.getTempoChanges(),
    );
    this.camera.h = clamp(
      this.camera.h * zoomFactor,
      MinimumPixelsPerQuarter,
      MaximumPixelsPerQuarter,
    );
    this.camera.x = Math.max(
      0,
      msToTicks(
        anchorMs - (anchorX / this.camera.h) * 500,
        this.context.getPpqn(),
        this.context.getTempoChanges(),
      ),
    );
  }

  public zoomAtCursor(zoomFactor: number, cursor: CanvasPoint): void {
    const rollX = cursor.x - this.keyboardWidth;
    const anchorX = Math.max(0, rollX);
    const anchorY = cursor.y - this.getGridTop();
    const anchorPitch = this.camera.y - anchorY / this.camera.v;
    const anchorTick = this.tickAtScreenX(this.keyboardWidth + anchorX);
    const anchorMs = ticksToMs(
      anchorTick,
      this.context.getPpqn(),
      this.context.getTempoChanges(),
    );

    this.camera.h = clamp(
      this.camera.h * zoomFactor,
      MinimumPixelsPerQuarter,
      MaximumPixelsPerQuarter,
    );
    this.camera.v = clamp(
      this.camera.v * zoomFactor,
      MinimumPixelsPerSemitone,
      MaximumPixelsPerSemitone,
    );
    this.camera.x = Math.max(
      0,
      msToTicks(
        anchorMs - (anchorX / this.camera.h) * 500,
        this.context.getPpqn(),
        this.context.getTempoChanges(),
      ),
    );
    this.camera.y = this.clampCameraY(anchorPitch + anchorY / this.camera.v);
  }

  public zoomVertical(zoomFactor: number, mouseY: number): void {
    const anchorPitch = this.camera.y - mouseY / this.camera.v;
    this.camera.v = clamp(
      this.camera.v * zoomFactor,
      MinimumPixelsPerSemitone,
      MaximumPixelsPerSemitone,
    );
    this.camera.y = this.clampCameraY(anchorPitch + mouseY / this.camera.v);
  }

  public focusSelection(
    notes: PianoRollNote[],
    width: number,
    height: number,
  ): void {
    if (notes.length === 0) {
      return;
    }

    const minTick = Math.min(...notes.map((note) => note.tick));
    const maxTick = Math.max(
      ...notes.map((note) => note.tick + note.durationTicks),
    );
    const minPitch = Math.min(...notes.map((note) => note.pitch));
    const maxPitch = Math.max(...notes.map((note) => note.pitch));
    const viewWidth = Math.max(1, width - this.keyboardWidth);
    const viewHeight = Math.max(1, height - this.getGridTop());
    const padding = 1.2;
    const pitchSpan = Math.max(1, maxPitch - minPitch + 1) * padding;
    const tempoChanges = this.context.getTempoChanges();
    const selectionStartMs = ticksToMs(
      minTick,
      this.context.getPpqn(),
      tempoChanges,
    );
    const selectionEndMs = ticksToMs(
      maxTick,
      this.context.getPpqn(),
      tempoChanges,
    );
    const timelineSpanMs =
      Math.max(1, selectionEndMs - selectionStartMs) * padding;

    this.camera.h = clamp(
      (viewWidth * 500) / timelineSpanMs,
      MinimumPixelsPerQuarter,
      MaximumPixelsPerQuarter,
    );
    this.camera.v = clamp(
      viewHeight / pitchSpan,
      MinimumPixelsPerSemitone,
      MaximumPixelsPerSemitone,
    );

    const visibleTimelineSpanMs = (viewWidth / this.camera.h) * 500;
    this.camera.x = Math.max(
      0,
      msToTicks(
        (selectionStartMs + selectionEndMs) / 2 - visibleTimelineSpanMs / 2,
        this.context.getPpqn(),
        tempoChanges,
      ),
    );
    this.camera.y = this.clampCameraY(
      maxPitch + 1 + (viewHeight / this.camera.v - pitchSpan) / 2,
    );
  }

  /** Fits the profile's whole pitch range into the visible grid height. */
  public fitPitchRange(height: number): void {
    const range = this.getPitchRange();
    const rows = range.high - range.low + 1;
    const viewHeight = Math.max(1, height - HeaderHeight);
    this.camera.v = clamp(
      viewHeight / (rows + this.getProfile().pinnedLanes.length),
      MinimumPixelsPerSemitone,
      MaximumPixelsPerSemitone,
    );
    this.camera.y = range.high;
  }
}
