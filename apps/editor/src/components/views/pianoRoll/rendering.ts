import * as THREE from "three";
import { BlackPitchClasses, HeaderHeight, KeyboardWidth } from "./constants";
import type { CoordinateSystem } from "./coordinates";
import { HeaderController } from "./header";
import { NoteDataStore } from "./noteData";
import { NoteGeometryCache, screenRectOf } from "./noteGeometry";
import type { PianoRollNoteKind } from "./profile";
import type { PianoRollContext } from "./types";

const RenderOrder = {
  CanvasBackground: 0,
  Background: 1,
  GridHorizontal: 6,
  GridBeat: 7,
  GridMeasure: 8,
  PinnedLaneTopBorder: 36,
  Header: 35,
  LyricMarker: 36,
  Note: 20,
  Selection: 21,
  KeyboardBase: 25,
  KeyboardWhite: 26,
  KeyboardBlack: 27,
  KeyboardOutOfRange: 28,
  Playhead: 30,
} as const;
type RenderOrderValue = (typeof RenderOrder)[keyof typeof RenderOrder];

const noteColor = 0x5d9cec;
const noteSelectedColor = 0xff0000;
const missingLyricColor = 0xf0ad4e;
const outOfRangeRowColor = 0x101010;

/** Fill colour and opacity per note kind; phrases are translucent bands. */
const kindStyles: Record<
  PianoRollNoteKind,
  { color: number; opacity: number }
> = {
  generic: { color: noteColor, opacity: 1 },
  pitched: { color: noteColor, opacity: 1 },
  pitchless: { color: 0x9b7fd4, opacity: 1 },
  percussion: { color: 0xe58e3a, opacity: 1 },
  "phrase:vocal": { color: 0x4fc1a6, opacity: 0.55 },
  "phrase:power-window": { color: 0xf2c94c, opacity: 0.55 },
  "phrase:stagepower": { color: 0x7fd3ff, opacity: 0.55 },
  unknown: { color: 0x777777, opacity: 1 },
};

/** Owns the Three scene objects and piano-roll draw order. */
export class PianoRollRenderer {
  readonly #scene = new THREE.Scene();
  readonly #context: PianoRollContext;
  readonly #coordinates: CoordinateSystem;
  readonly #noteData: NoteDataStore;
  readonly #geometry: NoteGeometryCache;
  readonly #header: HeaderController;

  get scene(): THREE.Scene {
    return this.#scene;
  }

  public constructor(
    context: PianoRollContext,
    coordinates: CoordinateSystem,
    noteData: NoteDataStore,
    geometry: NoteGeometryCache,
    header: HeaderController,
  ) {
    this.#context = context;
    this.#coordinates = coordinates;
    this.#noteData = noteData;
    this.#geometry = geometry;
    this.#header = header;
  }

  public dispose(): void {
    this.clearScene();
  }

  public draw(width: number, height: number, playheadTick: number): void {
    this.clearScene();

    const gridTop = this.#coordinates.getGridTop();

    // Header background
    this.addRect(0, 0, width, HeaderHeight, 0x1c1c1c, RenderOrder.Header);

    // Canvas background
    this.addRect(
      0,
      gridTop,
      width,
      height - gridTop,
      0x151515,
      RenderOrder.CanvasBackground,
    );
    this.drawGrid(width, height);
    this.drawNotes(width, height);
    this.drawLyricMarkers(width);
    this.drawSelectionBox();
    this.drawCursor(width, height, playheadTick);
    this.drawPinnedLanes(width);
    this.drawKeyboard(height);
    this.drawPitchRows(width, height);

    this.#header.width = width;
    this.#header.draw();
  }

  public drawCursor(width: number, height: number, playheadTick: number): void {
    const x = this.#coordinates.screenXForTick(playheadTick);
    if (x < KeyboardWidth || x >= width) return;
    this.addLine(
      [new THREE.Vector3(x, 0, 0.9), new THREE.Vector3(x, height, 0.9)],
      0xff0000,
      2,
      RenderOrder.Playhead,
    );
  }

  private drawPitchRows(width: number, height: number): void {
    const rowHeight = this.#coordinates.getCamera().v;
    const gridTop = this.#coordinates.getGridTop();
    const range = this.#coordinates.getPitchRange();
    const rollHeight = Math.max(0, height - gridTop);
    const camera = this.#coordinates.getCamera();
    const firstPitch = Math.ceil(camera.y);
    const topOffset = (camera.y - firstPitch) * rowHeight;
    const rowCount = Math.ceil(rollHeight / rowHeight) + 2;
    for (let row = 0; row < rowCount; row++) {
      const pitch = firstPitch - row;
      if (pitch < 0 || pitch > 127) continue;
      const pitchClass = ((pitch % 12) + 12) % 12;
      const y = gridTop + topOffset + row * rowHeight;
      const inRange = pitch >= range.low && pitch <= range.high;
      const color = !inRange
        ? outOfRangeRowColor
        : BlackPitchClasses.has(pitchClass)
          ? 0x181818
          : 0x202020;
      this.addRect(
        KeyboardWidth, // x
        y, // y
        Math.max(0, width - KeyboardWidth), // width
        rowHeight, // height
        color, // color
        RenderOrder.Background, // render order
      );
    }
  }

  private drawKeyboard(height: number): void {
    const rowHeight = this.#coordinates.getCamera().v;
    const gridTop = this.#coordinates.getGridTop();
    const range = this.#coordinates.getPitchRange();
    const rollHeight = Math.max(0, height - gridTop);
    const camera = this.#coordinates.getCamera();
    const firstPitch = Math.ceil(camera.y);
    const topOffset = (camera.y - firstPitch) * rowHeight;
    const rowCount = Math.ceil(rollHeight / rowHeight) + 2;
    const keyboardWidth = KeyboardWidth;
    this.addRect(
      0,
      gridTop,
      keyboardWidth,
      rollHeight,
      0xd6d6d6,
      RenderOrder.KeyboardBase,
    );
    for (let row = 0; row < rowCount; row++) {
      const pitch = firstPitch - row;
      if (pitch < 0 || pitch > 127) continue;
      const pitchClass = ((pitch % 12) + 12) % 12;
      const y = gridTop + topOffset + row * rowHeight;
      if (BlackPitchClasses.has(pitchClass)) {
        this.addRect(
          0,
          y,
          keyboardWidth * 0.65,
          rowHeight,
          0x272727,
          RenderOrder.KeyboardBlack,
        );
      }
      if (pitch < range.low || pitch > range.high) {
        this.addRect(
          0,
          y,
          keyboardWidth,
          rowHeight,
          0x000000,
          RenderOrder.KeyboardOutOfRange,
          0.55,
        );
      }
      this.addLine(
        [
          new THREE.Vector3(0, y + rowHeight, 4),
          new THREE.Vector3(keyboardWidth, y + rowHeight, 4),
        ],
        0x555555,
        1,
        RenderOrder.KeyboardWhite,
      );
    }
    this.addLine(
      [
        new THREE.Vector3(keyboardWidth, gridTop, 5),
        new THREE.Vector3(keyboardWidth, height, 5),
      ],
      0x777777,
      1,
      RenderOrder.KeyboardWhite,
    );
  }

  private drawGrid(width: number, height: number): void {
    const rowHeight = this.#coordinates.getCamera().v;
    const camera = this.#coordinates.getCamera();
    const firstPitch = Math.ceil(camera.y);
    const topOffset = (camera.y - firstPitch) * rowHeight;
    const gridTop = this.#coordinates.getGridTop();
    const horizontal: THREE.Vector3[] = [];
    for (let y = gridTop + topOffset; y <= height + rowHeight; y += rowHeight) {
      horizontal.push(
        new THREE.Vector3(KeyboardWidth, y, 6),
        new THREE.Vector3(width, y, 6),
      );
    }
    this.addLine(horizontal, 0x353535, 1, RenderOrder.GridHorizontal);

    const visibleWidth = Math.max(0, width - KeyboardWidth);
    const visibleStart = camera.x;
    const visibleEnd = this.#coordinates.tickAtScreenX(
      KeyboardWidth + visibleWidth,
    );
    // this.drawSnapGrid(height, visibleStart, visibleEnd);
    const vertical: THREE.Vector3[] = [];
    const major: THREE.Vector3[] = [];
    for (const { tick, isMeasure } of iterateGridBeats(
      this.#context.getPpqn(),
      this.#context.getTimeSignatureEvents(),
      visibleStart,
      visibleEnd,
    )) {
      const x = this.#coordinates.screenXForTick(tick);
      const target = isMeasure ? major : vertical;
      // Beat lines run through the pinned lanes so phrases align to the grid.
      target.push(
        new THREE.Vector3(x, HeaderHeight, 7),
        new THREE.Vector3(x, height, 7),
      );
    }
    this.addLine(vertical, 0x353535, 1, RenderOrder.GridBeat);
    this.addLine(major, 0x555555, 2, RenderOrder.GridMeasure);
  }

  private drawNotes(width: number, height: number): void {
    const midi = this.#context.getMidi();
    const track = this.#context.getSelectedTrack();
    if (!midi || !track) {
      this.#geometry.clear();
      this.#noteData.clear();
      this.#scene.userData.visibleNotes = 0;
      this.#scene.userData.visibleSustains = 0;
      return;
    }
    const camera = this.#coordinates.getCamera();
    const tickWidth = camera.h / this.#context.getPpqn();
    const rowHeight = camera.v;
    const noteHeight = Math.max(1, rowHeight - 2);
    const trackIndex = this.#context.getSelectedTrackIndex();
    if (trackIndex === null) return;
    const notes = this.#context.getTrackNotes(midi, trackIndex);
    const visibleEnd = this.#coordinates.tickAtScreenX(width);
    if (
      this.#geometry.needsRebuild({
        track,
        notes,
        tempoEvents: this.#context.getTempoEvents(),
        tickWidth,
        rowHeight,
        width,
        height,
        visibleEnd,
        coordinates: this.#coordinates,
      })
    ) {
      this.#geometry.rebuild({
        track,
        notes,
        noteIndex: this.#noteData.currentIndex,
        tempoEvents: this.#context.getTempoEvents(),
        tickWidth,
        rowHeight,
        width,
        height,
        noteHeight,
        coordinates: this.#coordinates,
      });
    }
    const selection = this.#context.getSelectionContext();
    const allSelected = selection.size > 0 && selection.size >= notes.length;
    const noneSelected = selection.size === 0;
    const profile = this.#context.getProfile();
    const missingLyric =
      profile.editing === "vocal"
        ? this.#context.getVocalMarks().missingLyric
        : null;
    const gridTop = this.#coordinates.getGridTop();
    const keyboardWidth = KeyboardWidth;
    this.#scene.userData.visibleNotes = this.#geometry.geometry.length;
    this.#scene.userData.visibleSustains = 0;
    for (const geometry of this.#geometry.geometry) {
      const isSelected = allSelected
        ? true
        : noneSelected
          ? false
          : selection.isSelected(geometry.note);
      const screenRect = screenRectOf(geometry, this.#coordinates);
      if (!screenRect) continue;
      const kind = profile.classify(geometry.note.pitch);
      const style = kindStyles[kind];
      const missing = missingLyric?.has(geometry.note.midiNote.noteOn) ?? false;
      const color = isSelected
        ? noteSelectedColor
        : missing
          ? missingLyricColor
          : style.color;
      // Pinned notes already sit inside their lane; grid notes keep the
      // original 1px top inset.
      const inset = geometry.pinned ? 0 : 1;
      const y = Math.max(screenRect.y + inset, geometry.pinned ? 0 : gridTop);
      this.addRect(
        screenRect.x,
        y,
        screenRect.width,
        screenRect.y + inset + screenRect.height - y,
        color,
        RenderOrder.Note,
        isSelected ? Math.max(style.opacity, 0.75) : style.opacity,
      );
      if (kind === "phrase:vocal") {
        // Vocal phrases also shade the grid so phrase boundaries are visible
        // while placing notes.
        const left = Math.max(keyboardWidth, screenRect.x);
        this.addRect(
          left,
          gridTop,
          screenRect.x + screenRect.width - left,
          height - gridTop,
          style.color,
          RenderOrder.KeyboardBase,
          0.06,
        );
      }
    }
  }

  /** Fixed rows under the header for phrases, percussion and pitchless. */
  private drawPinnedLanes(width: number): void {
    const lanes = this.#context.getProfile().pinnedLanes;
    if (lanes.length === 0) return;
    const keyboardWidth = KeyboardWidth;
    const separators: THREE.Vector3[] = [];
    lanes.forEach((lane, index) => {
      const { y, height } = this.#coordinates.laneRect(lane);
      this.addRect(
        keyboardWidth,
        y,
        Math.max(0, width - keyboardWidth),
        height,
        index % 2 === 0 ? 0x1a1a1a : 0x1e1e1e,
        RenderOrder.KeyboardBase,
      );
      this.addRect(
        0,
        y,
        keyboardWidth,
        height,
        0x2a2a2a,
        RenderOrder.KeyboardBase,
      );
      separators.push(
        new THREE.Vector3(0, y + height, 6),
        new THREE.Vector3(width, y + height, 6),
      );
    });
    this.addLine(separators, 0x333333, 1, RenderOrder.GridHorizontal);
    const gridTop = this.#coordinates.getGridTop();
    this.addLine(
      [new THREE.Vector3(0, gridTop, 9), new THREE.Vector3(width, gridTop, 9)],
      0x555555,
      1,
      RenderOrder.PinnedLaneTopBorder,
    );
  }

  /** Validation colour in the header text lane for notes with no lyric. */
  private drawLyricMarkers(width: number): void {
    if (this.#context.getProfile().editing !== "vocal") return;
    const keyboardWidth = KeyboardWidth;
    for (const tick of this.#context.getVocalMarks().missingTicks) {
      const x = this.#coordinates.screenXForTick(tick);
      if (x < keyboardWidth || x > width) continue;
      this.addRect(
        x,
        HeaderHeight - 10,
        3,
        10,
        missingLyricColor,
        RenderOrder.LyricMarker,
      );
    }
  }

  private drawSelectionBox(): void {
    const bounds = this.#context.getSelectionContext().bounds;
    if (!bounds) return;
    this.addRect(
      bounds.x,
      bounds.y,
      bounds.width,
      bounds.height,
      0xffffff,
      RenderOrder.Selection,
      0.5,
    );
  }

  private addRect(
    x: number,
    y: number,
    width: number,
    height: number,
    color: number,
    renderOrder: RenderOrderValue,
    opacity = 1,
  ): void {
    if (width <= 0 || height <= 0) {
      return;
    }
    const geometry = new THREE.PlaneGeometry(width, height);
    const material = new THREE.MeshBasicMaterial({
      color,
      transparent: opacity < 1,
      opacity,
      side: THREE.DoubleSide,
      depthTest: false,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x + width / 2, y + height / 2, renderOrder / 100);
    mesh.renderOrder = renderOrder;
    this.#scene.add(mesh);
  }

  private addLine(
    points: THREE.Vector3[],
    color: number,
    linewidth: number,
    renderOrder: RenderOrderValue,
  ): void {
    if (points.length < 2) return;
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({ color, linewidth });
    material.depthTest = false;
    material.depthWrite = false;
    const line = new THREE.LineSegments(geometry, material);
    line.renderOrder = renderOrder;
    this.#scene.add(line);
  }

  private clearScene(): void {
    for (const object of this.#scene.children) {
      object.traverse((child) => {
        const mesh = child as THREE.Mesh;
        mesh.geometry?.dispose();
        const material = mesh.material;
        if (Array.isArray(material)) material.forEach((item) => item.dispose());
        else material?.dispose();
      });
    }
    this.#scene.clear();
  }
}

export function* iterateGridBeats(
  ppqn: number,
  segments: import("@openchart/core").TimeSignatureEvent[],
  startTick: number,
  endTick: number,
): Generator<{ tick: number; isMeasure: boolean }> {
  for (let index = 0; index < segments.length; index++) {
    const segment = segments[index];
    const segmentEnd =
      index + 1 < segments.length ? segments[index + 1].tick : Infinity;
    if (segmentEnd <= startTick || segment.tick >= endTick) continue;
    const beatTicks = (ppqn * 4) / 2 ** segment.denominator;
    if (!Number.isFinite(beatTicks) || beatTicks <= 0) continue;
    const rangeStart = Math.max(segment.tick, startTick - beatTicks);
    const rangeEnd = Math.min(segmentEnd, endTick + beatTicks);
    const firstBeat = Math.floor((rangeStart - segment.tick) / beatTicks);
    for (let beat = firstBeat; ; beat++) {
      const tick = segment.tick + beat * beatTicks;
      if (tick > rangeEnd || tick >= segmentEnd) break;
      yield { tick, isMeasure: beat % segment.numerator === 0 };
    }
  }
}
