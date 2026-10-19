import type { MidiTrack, TempoEvent } from "@openchart/core";
import { Box2, Vector2 } from "three";
import {
  KeyboardWidth,
  MinimumNoteWidthPixels,
  NoteResizeHandleWidth,
} from "./constants";
import type { PianoRollCamera, PianoRollNote, ScreenBand } from "./types";
import type { PianoRollNoteIndex } from "./visibility";
import { getVisibleNoteRange } from "./visibility";

/** A note's rectangle in grid space, ready to be projected to the screen. */
export interface NoteGeometry {
  /** The note's rectangle in grid space. */
  bounds: Box2;

  /** The note this rectangle belongs to. */
  note: PianoRollNote;

  /** Pinned-lane band the note is drawn in; null for ordinary grid notes. */
  pinned: ScreenBand | null;
}

/** The coordinate services geometry building and hit-testing rely on. */
export interface NoteGeometryCoordinates {
  /** Live camera. */
  getCamera(): PianoRollCamera;

  /** Tick under a screen X. */
  tickAtScreenX(x: number): number;

  /** Screen X of a tick. */
  screenXForTick(tick: number): number;

  /** Horizontal timeline position of a tick. */
  timelineUnitsAtTick(tick: number): number;

  /** Converts a rect from grid space to screen space. */
  toScreenSpace(value: Box2): Box2;

  /** Optional: profiles with pinned lanes place special pitches there. */
  pinnedRectForPitch?(pitch: number): ScreenBand | null;

  /** Optional: grid notes are clipped below this Y. */
  getGridTop?(): number;
}

/** The inputs that decide whether cached geometry is still valid. */
export interface GeometryRebuildCheckParams {
  /** Track the notes belong to. */
  track: MidiTrack;

  /** Mapped notes of the track. */
  notes: PianoRollNote[];

  /** Tempo map in effect. */
  tempoEvents: TempoEvent[];

  /** Horizontal zoom in pixels per tick. */
  tickWidth: number;

  /** Vertical zoom in pixels per pitch row. */
  rowHeight: number;

  /** Canvas width in pixels. */
  width: number;

  /** Canvas height in pixels. */
  height: number;

  /** Tick at the right edge of the viewport. */
  visibleEnd: number;

  /** Coordinate services. */
  coordinates: NoteGeometryCoordinates;
}

/** The inputs needed to build note geometry. */
export interface GeometryRebuildParams {
  /** Track the notes belong to. */
  track: MidiTrack;

  /** Mapped notes of the track, sorted by start tick. */
  notes: PianoRollNote[];

  /** Visibility index over `notes`, if one has been built. */
  noteIndex: PianoRollNoteIndex | null;

  /** Tempo map in effect. */
  tempoEvents: TempoEvent[];

  /** Horizontal zoom in pixels per tick. */
  tickWidth: number;

  /** Vertical zoom in pixels per pitch row. */
  rowHeight: number;

  /** Canvas width in pixels. */
  width: number;

  /** Canvas height in pixels. */
  height: number;

  /** Drawn height of a note in pixels. */
  noteHeight: number;

  /** Coordinate services. */
  coordinates: NoteGeometryCoordinates;
}

/** Tick and pitch window covered by a built geometry cache. */
interface CachedWindow {
  /** First tick covered. */
  startTick: number;

  /** Last tick covered. */
  endTick: number;

  /** Lowest pitch covered. */
  minPitch: number;

  /** Highest pitch covered. */
  maxPitch: number;
}

/** Everything a built geometry cache remembers about how it was built. */
interface GeometryCache extends CachedWindow {
  /** Track the geometry was built for. */
  track: MidiTrack;

  /** Mapped notes the geometry was built from. */
  notes: PianoRollNote[];

  /** Tempo map the geometry was built with. */
  tempoEvents: TempoEvent[];

  /** Horizontal zoom in pixels per tick at build time. */
  tickWidth: number;

  /** Vertical zoom in pixels per pitch row at build time. */
  rowHeight: number;

  /** Canvas width at build time. */
  width: number;

  /** Canvas height at build time. */
  height: number;

  /** Rectangles of the notes inside the window. */
  geometry: NoteGeometry[];
}

/** True when `y` lies within the vertical extent of `rect`, edges included. */
function rectSpansY(rect: Box2, y: number): boolean {
  return y >= rect.min.y && y <= rect.max.y;
}

/**
 * Screen-space rectangle of a note, shared by drawing, hit-testing and
 * marquee selection. Grid notes are clipped to the grid so they never cover
 * the header or pinned lanes; null when fully clipped.
 */
export function screenRectOf(
  geometry: NoteGeometry,
  coordinates: NoteGeometryCoordinates,
): Box2 | null {
  const rect = coordinates.toScreenSpace(geometry.bounds);

  // Pinned notes fill their lane, inset by one pixel on each side.
  if (geometry.pinned) {
    const top = geometry.pinned.y + 1;
    const laneHeight = Math.max(1, geometry.pinned.height - 2);

    return new Box2(
      new Vector2(rect.min.x, top),
      new Vector2(rect.max.x, top + laneHeight),
    );
  }

  const gridTop = coordinates.getGridTop?.();
  if (gridTop === undefined || rect.min.y >= gridTop) {
    return rect;
  }

  // The note starts above the grid: drop it or clip off the hidden part.
  if (rect.max.y <= gridTop) {
    return null;
  }

  return new Box2(new Vector2(rect.min.x, gridTop), rect.max.clone());
}

/** Computes the tick and pitch window to cache around the viewport. */
function computeCachedWindow(params: GeometryRebuildParams): CachedWindow {
  const { width, height, rowHeight, coordinates } = params;
  const camera = coordinates.getCamera();
  const verticalRange = height / rowHeight;
  const visibleWidth = Math.max(0, width - KeyboardWidth);

  // Cache one viewport's width to the left and two to the right.
  return {
    startTick: Math.max(
      0,
      coordinates.tickAtScreenX(KeyboardWidth - visibleWidth),
    ),
    endTick: coordinates.tickAtScreenX(KeyboardWidth + visibleWidth * 2),
    minPitch: camera.y - verticalRange,
    maxPitch: camera.y + verticalRange,
  };
}

/** Builds the rectangle of one note, or null when it is outside the window. */
function buildNoteRect(
  note: PianoRollNote,
  window: CachedWindow,
  params: GeometryRebuildParams,
): NoteGeometry | null {
  const { rowHeight, noteHeight, coordinates } = params;
  const pinned = coordinates.pinnedRectForPitch?.(note.pitch) ?? null;
  const isOutsidePitchWindow =
    note.pitch < window.minPitch || note.pitch > window.maxPitch;
  if (!pinned && isOutsidePitchWindow) return null;

  const noteStartX = coordinates.screenXForTick(note.tick);
  const noteEndX = coordinates.screenXForTick(note.tick + note.durationTicks);

  const left =
    KeyboardWidth +
    coordinates.timelineUnitsAtTick(note.tick) * coordinates.getCamera().h;
  const top = -note.pitch * rowHeight;
  const width = Math.max(MinimumNoteWidthPixels, noteEndX - noteStartX);

  return {
    bounds: new Box2(
      new Vector2(left, top),
      new Vector2(left + width, top + noteHeight),
    ),
    note,
    pinned,
  };
}

/** Lazily caches note rectangles and provides the editor's hit-testing surface. */
export class NoteGeometryCache {
  /** The cached geometry and the conditions it was built under. */
  private cache: GeometryCache | null = null;

  /** Rectangles of the notes near the viewport, in draw order. */
  public get geometry(): NoteGeometry[] {
    return this.cache?.geometry ?? [];
  }

  /** Discards the cached geometry. */
  public clear(): void {
    this.cache = null;
  }

  /**
   * True when the cache is missing, was built for different inputs, or no
   * longer covers the viewport.
   */
  public needsRebuild(params: GeometryRebuildCheckParams): boolean {
    const cache = this.cache;

    // Any change of inputs invalidates the cache.
    if (
      !cache ||
      cache.track !== params.track ||
      cache.notes !== params.notes ||
      cache.tempoEvents !== params.tempoEvents ||
      cache.tickWidth !== params.tickWidth ||
      cache.rowHeight !== params.rowHeight ||
      cache.width !== params.width ||
      cache.height !== params.height
    ) {
      return true;
    }

    // Otherwise it is still valid while the viewport stays inside the window.
    const verticalRange = params.height / params.rowHeight;
    const camera = params.coordinates.getCamera();

    return !(
      camera.x >= cache.startTick &&
      params.visibleEnd <= cache.endTick &&
      camera.y - verticalRange >= cache.minPitch &&
      camera.y <= cache.maxPitch
    );
  }

  /** Rebuilds the geometry of every note in the window around the viewport. */
  public rebuild(params: GeometryRebuildParams): void {
    const { notes, noteIndex, tickWidth } = params;
    const window = computeCachedWindow(params);
    const visibleRange = getVisibleNoteRange(
      notes,
      noteIndex,
      window.startTick,
      window.endTick,
      tickWidth,
    );

    // Project each candidate note, skipping those outside the pitch window.
    const geometry: NoteGeometry[] = [];
    for (let index = visibleRange.start; index < visibleRange.end; index++) {
      const noteRect = buildNoteRect(notes[index], window, params);
      if (noteRect) geometry.push(noteRect);
    }

    this.cache = {
      ...window,
      track: params.track,
      notes,
      tempoEvents: params.tempoEvents,
      tickWidth,
      rowHeight: params.rowHeight,
      width: params.width,
      height: params.height,
      geometry,
    };
  }

  /** The topmost note under `point`, or null when there is none. */
  public hitTest(
    point: Vector2,
    coordinates: NoteGeometryCoordinates,
  ): PianoRollNote | null {
    // Walk back to front so notes drawn last win.
    for (let index = this.geometry.length - 1; index >= 0; index--) {
      const screenRect = screenRectOf(this.geometry[index], coordinates);

      if (screenRect?.containsPoint(point)) {
        return this.geometry[index].note;
      }
    }

    return null;
  }

  /** The topmost note whose right-edge resize handle is under `point`. */
  public hitTestEdge(
    point: Vector2,
    coordinates: NoteGeometryCoordinates,
  ): PianoRollNote | null {
    for (let index = this.geometry.length - 1; index >= 0; index--) {
      const geometry = this.geometry[index];
      const screenRect = screenRectOf(geometry, coordinates);
      if (!screenRect || !rectSpansY(screenRect, point.y)) continue;

      // The handle is at most half the note wide so short notes stay movable.
      const width = screenRect.max.x - screenRect.min.x;
      const handleWidth = Math.min(NoteResizeHandleWidth, width / 2);
      const rightEdge = screenRect.max.x;

      if (point.x >= rightEdge - handleWidth && point.x <= rightEdge) {
        return geometry.note;
      }
    }

    return null;
  }
}
