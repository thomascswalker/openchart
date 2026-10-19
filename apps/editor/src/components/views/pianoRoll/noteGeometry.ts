import type { MidiTrack, TempoEvent } from "@openchart/core";
import { Box2, Vector2 } from "three";
import { KeyboardWidth, NoteResizeHandleWidth } from "./constants";
import type { PianoRollNote } from "./types";
import type { PianoRollNoteIndex } from "./visibility";
import { getVisibleNoteRange } from "./visibility";

export interface NoteGeometry {
  x: number;
  y: number;
  width: number;
  height: number;
  radius: number;
  note: PianoRollNote;
  pinned: { y: number; height: number } | null;
}

export interface NoteGeometryCoordinates {
  getCamera(): { x: number; y: number; h: number; v: number };
  tickAtScreenX(x: number): number;
  screenXForTick(tick: number): number;
  timelineUnitsAtTick(tick: number): number;
  toScreenSpace(value: Box2): Box2;
  /** Optional: profiles with pinned lanes place special pitches there. */
  pinnedRectForPitch?(pitch: number): { y: number; height: number } | null;
  /** Optional: grid notes are clipped below this Y. */
  getGridTop?(): number;
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
  const rect = coordinates.toScreenSpace(
    new Box2(
      new Vector2(geometry.x, geometry.y),
      new Vector2(geometry.x + geometry.width, geometry.y + geometry.height),
    ),
  );
  if (geometry.pinned) {
    return new Box2(
      new Vector2(rect.min.x, geometry.pinned.y + 1),
      new Vector2(
        rect.max.x,
        geometry.pinned.y + Math.max(2, geometry.pinned.height - 1),
      ),
    );
  }
  const gridTop = coordinates.getGridTop?.();
  if (gridTop === undefined || rect.min.y >= gridTop) return rect;
  const bottom = rect.max.y;
  if (bottom <= gridTop) return null;
  return new Box2(
    new Vector2(rect.min.x, gridTop),
    new Vector2(rect.max.x, bottom),
  );
}

interface GeometryCache {
  track: MidiTrack;
  notes: PianoRollNote[];
  tempoEvents: TempoEvent[];
  tickWidth: number;
  rowHeight: number;
  width: number;
  height: number;
  geometry: NoteGeometry[];
  startTick: number;
  endTick: number;
  minPitch: number;
  maxPitch: number;
}

/** Lazily caches note rectangles and provides the editor's hit-testing surface. */
export class NoteGeometryCache {
  private cache: GeometryCache | null = null;

  public get geometry(): NoteGeometry[] {
    return this.cache?.geometry ?? [];
  }

  public clear(): void {
    this.cache = null;
  }

  public needsRebuild(args: {
    track: MidiTrack;
    notes: PianoRollNote[];
    tempoEvents: TempoEvent[];
    tickWidth: number;
    rowHeight: number;
    width: number;
    height: number;
    visibleEnd: number;
    coordinates: NoteGeometryCoordinates;
  }): boolean {
    const cache = this.cache;
    if (
      !cache ||
      cache.track !== args.track ||
      cache.notes !== args.notes ||
      cache.tempoEvents !== args.tempoEvents ||
      cache.tickWidth !== args.tickWidth ||
      cache.rowHeight !== args.rowHeight ||
      cache.width !== args.width ||
      cache.height !== args.height
    ) {
      return true;
    }

    const verticalRange = args.height / args.rowHeight;
    const camera = args.coordinates.getCamera();
    return !(
      camera.x >= cache.startTick &&
      args.visibleEnd <= cache.endTick &&
      camera.y - verticalRange >= cache.minPitch &&
      camera.y <= cache.maxPitch
    );
  }

  public rebuild(args: {
    track: MidiTrack;
    notes: PianoRollNote[];
    noteIndex: PianoRollNoteIndex | null;
    tempoEvents: TempoEvent[];
    tickWidth: number;
    rowHeight: number;
    width: number;
    height: number;
    noteHeight: number;
    coordinates: NoteGeometryCoordinates;
  }): void {
    const {
      track,
      notes,
      noteIndex,
      tempoEvents,
      tickWidth,
      rowHeight,
      width,
      height,
      noteHeight,
      coordinates,
    } = args;
    const camera = coordinates.getCamera();
    const verticalRange = height / rowHeight;
    const visibleWidth = Math.max(0, width - KeyboardWidth);
    const startTick = Math.max(
      0,
      coordinates.tickAtScreenX(KeyboardWidth - visibleWidth),
    );
    const endTick = coordinates.tickAtScreenX(KeyboardWidth + visibleWidth * 2);
    const minPitch = camera.y - verticalRange;
    const maxPitch = camera.y + verticalRange;
    const visibleRange = getVisibleNoteRange(
      notes,
      noteIndex,
      startTick,
      endTick,
      tickWidth,
    );
    const radius = Math.min(2, noteHeight / 4);
    const geometry: NoteGeometry[] = [];

    for (let index = visibleRange.start; index < visibleRange.end; index++) {
      const note = notes[index];
      const pinned = coordinates.pinnedRectForPitch?.(note.pitch) ?? null;
      if (!pinned && (note.pitch < minPitch || note.pitch > maxPitch)) {
        continue;
      }

      const x =
        KeyboardWidth + coordinates.timelineUnitsAtTick(note.tick) * camera.h;
      const y = -note.pitch * rowHeight;
      const noteWidth = Math.max(
        2,
        coordinates.screenXForTick(note.tick + note.durationTicks) -
          coordinates.screenXForTick(note.tick),
      );

      geometry.push({
        x,
        y,
        width: noteWidth,
        height: noteHeight,
        radius,
        note,
        pinned,
      });
    }

    this.cache = {
      track,
      notes,
      tempoEvents,
      geometry,
      tickWidth,
      rowHeight,
      width,
      height,
      startTick,
      endTick,
      minPitch,
      maxPitch,
    };
  }

  public hitTest(
    point: Vector2,
    coordinates: NoteGeometryCoordinates,
  ): PianoRollNote | null {
    for (let index = this.geometry.length - 1; index >= 0; index--) {
      const screenRect = screenRectOf(this.geometry[index], coordinates);
      if (
        screenRect &&
        point.x >= screenRect.min.x &&
        point.x <= screenRect.max.x &&
        point.y >= screenRect.min.y &&
        point.y <= screenRect.max.y
      ) {
        return this.geometry[index].note;
      }
    }
    return null;
  }

  public hitTestEdge(
    point: Vector2,
    coordinates: NoteGeometryCoordinates,
  ): PianoRollNote | null {
    for (let index = this.geometry.length - 1; index >= 0; index--) {
      const geometry = this.geometry[index];
      const screenRect = screenRectOf(geometry, coordinates);
      if (
        !screenRect ||
        point.y < screenRect.min.y ||
        point.y > screenRect.max.y
      ) {
        continue;
      }

      const width = screenRect.max.x - screenRect.min.x;
      const handleWidth = Math.min(NoteResizeHandleWidth, width / 2);
      if (
        point.x >= screenRect.max.x - handleWidth &&
        point.x <= screenRect.max.x
      ) {
        return geometry.note;
      }
    }
    return null;
  }

  public get cacheInfo(): {
    startTick: number;
    endTick: number;
    minPitch: number;
    maxPitch: number;
  } | null {
    if (!this.cache) {
      return null;
    }
    return this.cache;
  }
}
