import type {
  MidiChannelEvent,
  MidiTrack,
  TimeSignatureEvent,
} from "@openchart/core";
import * as THREE from "three";
import {
  BlackPitchClasses,
  HeaderHeight,
  KeyboardWidth,
  MaximumMidiPitch,
  MinimumMidiPitch,
} from "./constants";
import type { CoordinateSystem } from "./coordinates";
import type { HeaderController } from "./header";
import type { NoteDataStore } from "./noteData";
import {
  screenRectOf,
  type NoteGeometry,
  type NoteGeometryCache,
} from "./noteGeometry";
import type { PianoRollNoteKind } from "./profile";
import type { PianoRollContext, PianoRollNote } from "./types";

/** Draw order of each scene layer; higher values draw on top. */
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

/** Union of the numeric values in {@link RenderOrder}. */
type RenderOrderValue = (typeof RenderOrder)[keyof typeof RenderOrder];

/** Z coordinate given to line vertices of each layer. */
const LineDepth = {
  Playhead: 0.9,
  KeyboardRowDivider: 4,
  KeyboardEdge: 5,
  GridHorizontal: 6,
  GridVertical: 7,
  PinnedLaneTopBorder: 9,
} as const;

/** Hex colours of everything the piano roll draws. */
const SceneColor = {
  HeaderLaneEven: 0x1c1c1c,
  HeaderLaneOdd: 0x202020,
  CanvasBackground: 0x151515,
  WhiteKeyRow: 0x202020,
  BlackKeyRow: 0x181818,
  OutOfRangeRow: 0x101010,
  GridLine: 0x353535,
  MeasureLine: 0x555555,
  KeyboardBase: 0xd6d6d6,
  KeyboardBlackKey: 0x272727,
  KeyboardOutOfRange: 0x000000,
  KeyboardRowDivider: 0x555555,
  KeyboardEdge: 0x777777,
  PinnedLaneEven: 0x1a1a1a,
  PinnedLaneOdd: 0x1e1e1e,
  PinnedLaneGutter: 0x2a2a2a,
  PinnedLaneSeparator: 0x333333,
  PinnedLaneTopBorder: 0x555555,
  Playhead: 0xff0000,
  SelectionBox: 0xffffff,
  Note: 0x5d9cec,
  NoteSelected: 0xff0000,
  MissingLyric: 0xf0ad4e,
} as const;

/** Opacity of the dark overlay on keyboard keys outside the pitch range. */
const KeyboardOutOfRangeOpacity = 0.55;

/** Opacity of the grid shading drawn behind each vocal phrase. */
const PhraseGridShadeOpacity = 0.06;

/** Lowest opacity a selected note is drawn with, so it stays visible. */
const SelectedNoteMinimumOpacity = 0.75;

/** Share of the keyboard width the black keys cover. */
const BlackKeyWidthRatio = 0.65;

/** Opacity of the marquee rectangle. */
const SelectionBoxOpacity = 0.5;

/** Width of a missing-lyric marker in the header, in pixels. */
const LyricMarkerWidth = 3;

/** Height of a missing-lyric marker in the header, in pixels. */
const LyricMarkerHeight = 10;

/** Fill colour and opacity per note kind; phrases are translucent bands. */
const kindStyles: Record<
  PianoRollNoteKind,
  { color: number; opacity: number }
> = {
  default: { color: SceneColor.Note, opacity: 1 },
  pitched: { color: SceneColor.Note, opacity: 1 },
  pitchless: { color: 0x9b7fd4, opacity: 1 },
  percussion: { color: 0xe58e3a, opacity: 1 },
  "phrase:vocal": { color: 0x4fc1a6, opacity: 0.55 },
  "phrase:power-window": { color: 0xf2c94c, opacity: 0.55 },
  "phrase:stagepower": { color: 0x7fd3ff, opacity: 0.55 },
  unknown: { color: 0x777777, opacity: 1 },
};

/** One pitch row of the visible grid. */
interface PitchRow {
  /** MIDI pitch drawn in the row. */
  pitch: number;

  /** Screen Y of the row's top edge. */
  y: number;
}

/** Per-frame facts shared by every note drawn in that frame. */
interface NotePaint {
  /** True when a note is part of the selection. */
  isSelected: (note: PianoRollNote) => boolean;

  /** Note-ons flagged as missing a lyric; null outside vocal editing. */
  missingLyric: ReadonlySet<MidiChannelEvent> | null;

  /** Resolves how a note's pitch is drawn. */
  classify: (pitch: number) => PianoRollNoteKind;

  /** Screen Y where the pitch grid starts. */
  gridTop: number;

  /** Canvas height in pixels. */
  height: number;
}

/** The two endpoints of a line segment. */
function segment(
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  depth: number,
): THREE.Vector3[] {
  return [
    new THREE.Vector3(fromX, fromY, depth),
    new THREE.Vector3(toX, toY, depth),
  ];
}

/** Owns the Three scene objects and piano-roll draw order. */
export class PianoRollRenderer {
  /** Scene that is rebuilt on every draw. */
  readonly #scene = new THREE.Scene();

  /** Supplies the document, selection and profile. */
  readonly #context: PianoRollContext;

  /** Converts ticks and pitches to screen positions. */
  readonly #coordinates: CoordinateSystem;

  /** Mapped notes and their visibility index. */
  readonly #noteData: NoteDataStore;

  /** Cached note rectangles near the viewport. */
  readonly #geometry: NoteGeometryCache;

  /** Header, which draws its own DOM on top of the canvas. */
  readonly #header: HeaderController;

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

  /** The scene to render. */
  get scene(): THREE.Scene {
    return this.#scene;
  }

  /** Frees the GPU resources of the current scene. */
  public dispose(): void {
    this.clearScene();
  }

  /** Rebuilds the whole scene for a `width` by `height` canvas. */
  public draw(width: number, height: number, playheadTick: number): void {
    this.clearScene();

    this.drawHeaderBackground(width);
    this.drawCanvasBackground(width, height);
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

  /** Draws the playhead line when it is inside the note area. */
  public drawCursor(width: number, height: number, playheadTick: number): void {
    const x = this.#coordinates.screenXForTick(playheadTick);
    if (x < KeyboardWidth || x >= width) return;

    this.addLine(
      segment(x, 0, x, height, LineDepth.Playhead),
      SceneColor.Playhead,
      2,
      RenderOrder.Playhead,
    );
  }

  /** Header rows alternate shades; labels use the same gutter as pinned lanes. */
  private drawHeaderBackground(width: number): void {
    const laneCount = this.#header.visibleLanes.length;

    // With no lanes the header is a single solid strip.
    if (laneCount === 0) {
      this.addRect(
        0,
        0,
        width,
        HeaderHeight,
        SceneColor.HeaderLaneEven,
        RenderOrder.Header,
      );
      return;
    }

    const laneHeight = HeaderHeight / laneCount;
    for (let index = 0; index < laneCount; index++) {
      const color =
        index % 2 === 0 ? SceneColor.HeaderLaneEven : SceneColor.HeaderLaneOdd;
      this.addRect(
        0,
        laneHeight * index,
        width,
        laneHeight,
        color,
        RenderOrder.Header,
      );
    }
  }

  /** Fills the area below the header and pinned lanes. */
  private drawCanvasBackground(width: number, height: number): void {
    const gridTop = this.#coordinates.getGridTop();

    this.addRect(
      0,
      gridTop,
      width,
      height - gridTop,
      SceneColor.CanvasBackground,
      RenderOrder.CanvasBackground,
    );
  }

  /** Screen offset of the first visible pitch row from the grid top. */
  private getRowOffset(): number {
    const camera = this.#coordinates.getCamera();
    return (camera.y - Math.ceil(camera.y)) * camera.v;
  }

  /** The pitch rows that intersect the visible grid, top to bottom. */
  private getVisiblePitchRows(height: number): PitchRow[] {
    const camera = this.#coordinates.getCamera();
    const gridTop = this.#coordinates.getGridTop();
    const rollHeight = Math.max(0, height - gridTop);
    const firstPitch = Math.ceil(camera.y);
    const firstRowTop = gridTop + this.getRowOffset();

    // Two extra rows cover the partial rows at either edge.
    const rowCount = Math.ceil(rollHeight / camera.v) + 2;
    const rows: PitchRow[] = [];
    for (let row = 0; row < rowCount; row++) {
      const pitch = firstPitch - row;
      if (pitch < MinimumMidiPitch || pitch > MaximumMidiPitch) continue;

      rows.push({ pitch, y: firstRowTop + row * camera.v });
    }

    return rows;
  }

  /** Shades each pitch row by key colour and dims rows outside the range. */
  private drawPitchRows(width: number, height: number): void {
    const rowHeight = this.#coordinates.getCamera().v;
    const range = this.#coordinates.getPitchRange();

    for (const { pitch, y } of this.getVisiblePitchRows(height)) {
      const isInRange = pitch >= range.low && pitch <= range.high;

      this.addRect(
        KeyboardWidth,
        y,
        Math.max(0, width - KeyboardWidth),
        rowHeight,
        this.pitchRowColor(pitch, isInRange),
        RenderOrder.Background,
      );
    }
  }

  /** Background colour of the row for `pitch`. */
  private pitchRowColor(pitch: number, isInRange: boolean): number {
    if (!isInRange) return SceneColor.OutOfRangeRow;

    return BlackPitchClasses.has(this.pitchClassOf(pitch))
      ? SceneColor.BlackKeyRow
      : SceneColor.WhiteKeyRow;
  }

  /** Pitch class (0 = C) of a pitch. */
  private pitchClassOf(pitch: number): number {
    return ((pitch % 12) + 12) % 12;
  }

  /** Draws the piano keyboard gutter: keys, dividers and out-of-range dimming. */
  private drawKeyboard(height: number): void {
    const rowHeight = this.#coordinates.getCamera().v;
    const gridTop = this.#coordinates.getGridTop();
    const range = this.#coordinates.getPitchRange();

    // White keys are the base; black keys and dividers go on top.
    this.addRect(
      0,
      gridTop,
      KeyboardWidth,
      Math.max(0, height - gridTop),
      SceneColor.KeyboardBase,
      RenderOrder.KeyboardBase,
    );

    for (const { pitch, y } of this.getVisiblePitchRows(height)) {
      if (BlackPitchClasses.has(this.pitchClassOf(pitch))) {
        this.addRect(
          0,
          y,
          KeyboardWidth * BlackKeyWidthRatio,
          rowHeight,
          SceneColor.KeyboardBlackKey,
          RenderOrder.KeyboardBlack,
        );
      }

      if (pitch < range.low || pitch > range.high) {
        this.addRect(
          0,
          y,
          KeyboardWidth,
          rowHeight,
          SceneColor.KeyboardOutOfRange,
          RenderOrder.KeyboardOutOfRange,
          KeyboardOutOfRangeOpacity,
        );
      }

      this.addLine(
        segment(
          0,
          y + rowHeight,
          KeyboardWidth,
          y + rowHeight,
          LineDepth.KeyboardRowDivider,
        ),
        SceneColor.KeyboardRowDivider,
        1,
        RenderOrder.KeyboardWhite,
      );
    }

    // Edge between the keyboard and the note area.
    this.addLine(
      segment(
        KeyboardWidth,
        gridTop,
        KeyboardWidth,
        height,
        LineDepth.KeyboardEdge,
      ),
      SceneColor.KeyboardEdge,
      1,
      RenderOrder.KeyboardWhite,
    );
  }

  /** Draws the pitch row lines and the beat and measure lines. */
  private drawGrid(width: number, height: number): void {
    this.drawRowLines(width, height);
    this.drawBeatLines(width, height);
  }

  /** Draws one horizontal line per pitch row boundary. */
  private drawRowLines(width: number, height: number): void {
    const rowHeight = this.#coordinates.getCamera().v;
    const gridTop = this.#coordinates.getGridTop();
    const points: THREE.Vector3[] = [];

    for (
      let y = gridTop + this.getRowOffset();
      y <= height + rowHeight;
      y += rowHeight
    ) {
      points.push(
        ...segment(KeyboardWidth, y, width, y, LineDepth.GridHorizontal),
      );
    }

    this.addLine(points, SceneColor.GridLine, 1, RenderOrder.GridHorizontal);
  }

  /** Draws a vertical line per visible beat, thicker on measure starts. */
  private drawBeatLines(width: number, height: number): void {
    const visibleWidth = Math.max(0, width - KeyboardWidth);
    const visibleStart = this.#coordinates.getCamera().x;
    const visibleEnd = this.#coordinates.tickAtScreenX(
      KeyboardWidth + visibleWidth,
    );
    const beatLines: THREE.Vector3[] = [];
    const measureLines: THREE.Vector3[] = [];

    const beats = iterateGridBeats(
      this.#context.getPpqn(),
      this.#context.getTimeSignatureEvents(),
      visibleStart,
      visibleEnd,
    );
    for (const { tick, isMeasure } of beats) {
      const x = this.#coordinates.screenXForTick(tick);
      const target = isMeasure ? measureLines : beatLines;

      // Beat lines run through the pinned lanes so phrases align to the grid.
      target.push(
        ...segment(x, HeaderHeight, x, height, LineDepth.GridVertical),
      );
    }

    this.addLine(beatLines, SceneColor.GridLine, 1, RenderOrder.GridBeat);
    this.addLine(
      measureLines,
      SceneColor.MeasureLine,
      2,
      RenderOrder.GridMeasure,
    );
  }

  /** Draws the visible notes, rebuilding their cached geometry when stale. */
  private drawNotes(width: number, height: number): void {
    const midi = this.#context.getMidi();
    const track = this.#context.getSelectedTrack();
    if (!midi || !track) {
      this.resetNoteCaches();
      return;
    }

    const trackIndex = this.#context.getSelectedTrackIndex();
    if (trackIndex === null) return;

    const notes = this.#context.getTrackNotes(midi, trackIndex);
    this.ensureNoteGeometry(track, notes, width, height);

    // Expose the counts for tests and diagnostics.
    this.#scene.userData.visibleNotes = this.#geometry.geometry.length;
    this.#scene.userData.visibleSustains = 0;

    const paint = this.createNotePaint(notes.length, height);
    for (const noteGeometry of this.#geometry.geometry) {
      this.drawNote(noteGeometry, paint);
    }
  }

  /** Gathers the per-frame facts every note needs, once instead of per note. */
  private createNotePaint(noteCount: number, height: number): NotePaint {
    const profile = this.#context.getProfile();
    const missingLyric =
      profile.editing === "vocal"
        ? this.#context.getVocalMarks().missingLyric
        : null;

    return {
      isSelected: this.createSelectionTest(noteCount),
      missingLyric,
      classify: (pitch) => profile.classify(pitch),
      gridTop: this.#coordinates.getGridTop(),
      height,
    };
  }

  /** Drops cached note data when there is no track to draw. */
  private resetNoteCaches(): void {
    this.#geometry.clear();
    this.#noteData.clear();
    this.#scene.userData.visibleNotes = 0;
    this.#scene.userData.visibleSustains = 0;
  }

  /** Rebuilds the note rectangles if the view or the notes changed. */
  private ensureNoteGeometry(
    track: MidiTrack,
    notes: PianoRollNote[],
    width: number,
    height: number,
  ): void {
    const camera = this.#coordinates.getCamera();
    const tickWidth = camera.h / this.#context.getPpqn();
    const rowHeight = camera.v;
    const tempoEvents = this.#context.getTempoEvents();

    const needsRebuild = this.#geometry.needsRebuild({
      track,
      notes,
      tempoEvents,
      tickWidth,
      rowHeight,
      width,
      height,
      visibleEnd: this.#coordinates.tickAtScreenX(width),
      coordinates: this.#coordinates,
    });
    if (!needsRebuild) return;

    this.#geometry.rebuild({
      track,
      notes,
      noteIndex: this.#noteData.currentIndex,
      tempoEvents,
      tickWidth,
      rowHeight,
      width,
      height,
      noteHeight: Math.max(1, rowHeight - 2),
      coordinates: this.#coordinates,
    });
  }

  /**
   * Builds a fast "is this note selected" test, short-circuiting the common
   * cases of nothing selected and everything selected.
   */
  private createSelectionTest(
    noteCount: number,
  ): (note: PianoRollNote) => boolean {
    const selection = this.#context.getSelectionContext();

    if (selection.size === 0) return () => false;
    if (selection.size >= noteCount) return () => true;
    return (note) => selection.isSelected(note);
  }

  /** Draws one note, plus the grid shading that vocal phrases add. */
  private drawNote(noteGeometry: NoteGeometry, paint: NotePaint): void {
    const screenRect = screenRectOf(noteGeometry, this.#coordinates);
    if (!screenRect) return;

    const { note, pinned } = noteGeometry;
    const kind = paint.classify(note.pitch);
    const style = kindStyles[kind];
    const isSelected = paint.isSelected(note);

    // Pinned notes already sit inside their lane; grid notes keep the
    // original 1px top inset and are clipped to the grid.
    const inset = pinned ? 0 : 1;
    const topLimit = pinned ? 0 : paint.gridTop;
    const width = screenRect.max.x - screenRect.min.x;
    const height = screenRect.max.y - screenRect.min.y;
    const y = Math.max(screenRect.min.y + inset, topLimit);

    this.addRect(
      screenRect.min.x,
      y,
      width,
      screenRect.min.y + inset + height - y,
      this.resolveNoteColor(note, isSelected, style.color, paint),
      RenderOrder.Note,
      isSelected
        ? Math.max(style.opacity, SelectedNoteMinimumOpacity)
        : style.opacity,
    );

    if (kind !== "phrase:vocal") return;

    // Vocal phrases also shade the grid so phrase boundaries are visible
    // while placing notes.
    const left = Math.max(KeyboardWidth, screenRect.min.x);
    this.addRect(
      left,
      paint.gridTop,
      screenRect.max.x - left,
      paint.height - paint.gridTop,
      style.color,
      RenderOrder.KeyboardBase,
      PhraseGridShadeOpacity,
    );
  }

  /** Selected notes are red, notes missing a lyric amber, others by kind. */
  private resolveNoteColor(
    note: PianoRollNote,
    isSelected: boolean,
    kindColor: number,
    paint: NotePaint,
  ): number {
    if (isSelected) return SceneColor.NoteSelected;
    if (paint.missingLyric?.has(note.midiNote.noteOn)) {
      return SceneColor.MissingLyric;
    }

    return kindColor;
  }

  /** Fixed rows under the header for phrases, percussion and pitchless. */
  private drawPinnedLanes(width: number): void {
    const lanes = this.#context.getProfile().pinnedLanes;
    if (lanes.length === 0) return;

    const separators: THREE.Vector3[] = [];
    lanes.forEach((lane, index) => {
      const { y, height } = this.#coordinates.laneRect(lane);
      const rowColor =
        index % 2 === 0 ? SceneColor.PinnedLaneEven : SceneColor.PinnedLaneOdd;

      // Lane row, its keyboard-gutter cell, and the divider under it.
      this.addRect(
        KeyboardWidth,
        y,
        Math.max(0, width - KeyboardWidth),
        height,
        rowColor,
        RenderOrder.KeyboardBase,
      );
      this.addRect(
        0,
        y,
        KeyboardWidth,
        height,
        SceneColor.PinnedLaneGutter,
        RenderOrder.KeyboardBase,
      );
      separators.push(
        ...segment(0, y + height, width, y + height, LineDepth.GridHorizontal),
      );
    });

    this.addLine(
      separators,
      SceneColor.PinnedLaneSeparator,
      1,
      RenderOrder.GridHorizontal,
    );

    // Border between the pinned lanes and the pitch grid.
    const gridTop = this.#coordinates.getGridTop();
    this.addLine(
      segment(0, gridTop, width, gridTop, LineDepth.PinnedLaneTopBorder),
      SceneColor.PinnedLaneTopBorder,
      1,
      RenderOrder.PinnedLaneTopBorder,
    );
  }

  /** Validation colour in the header text lane for notes with no lyric. */
  private drawLyricMarkers(width: number): void {
    if (this.#context.getProfile().editing !== "vocal") return;

    for (const tick of this.#context.getVocalMarks().missingTicks) {
      const x = this.#coordinates.screenXForTick(tick);
      if (x < KeyboardWidth || x > width) continue;

      this.addRect(
        x,
        HeaderHeight - LyricMarkerHeight,
        LyricMarkerWidth,
        LyricMarkerHeight,
        SceneColor.MissingLyric,
        RenderOrder.LyricMarker,
      );
    }
  }

  /** Draws the translucent marquee while the user drags a selection. */
  private drawSelectionBox(): void {
    const bounds = this.#context.getSelectionContext().bounds;
    if (!bounds) return;

    this.addRect(
      bounds.min.x,
      bounds.min.y,
      bounds.max.x - bounds.min.x,
      bounds.max.y - bounds.min.y,
      SceneColor.SelectionBox,
      RenderOrder.Selection,
      SelectionBoxOpacity,
    );
  }

  /** Adds a filled rectangle to the scene; skips empty rectangles. */
  private addRect(
    x: number,
    y: number,
    width: number,
    height: number,
    color: number,
    renderOrder: RenderOrderValue,
    opacity = 1,
  ): void {
    if (width <= 0 || height <= 0) return;

    const geometry = new THREE.PlaneGeometry(width, height);
    const material = new THREE.MeshBasicMaterial({
      color,
      transparent: opacity < 1,
      opacity,
      side: THREE.DoubleSide,
      depthTest: false,
      depthWrite: false,
    });

    // Planes are centred on their position, so offset by half the size.
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x + width / 2, y + height / 2, renderOrder / 100);
    mesh.renderOrder = renderOrder;
    this.#scene.add(mesh);
  }

  /** Adds line segments (pairs of points) to the scene; skips empty input. */
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

  /** Removes every object from the scene, disposing geometry and materials. */
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

/**
 * Yields the tick of every beat that may be visible between `startTick` and
 * `endTick`, flagging the first beat of each measure. Beat length follows each
 * time signature segment.
 */
export function* iterateGridBeats(
  ppqn: number,
  segments: TimeSignatureEvent[],
  startTick: number,
  endTick: number,
): Generator<{ tick: number; isMeasure: boolean }> {
  for (let index = 0; index < segments.length; index++) {
    const timeSignature = segments[index];
    const segmentEnd =
      index + 1 < segments.length ? segments[index + 1].tick : Infinity;
    if (segmentEnd <= startTick || timeSignature.tick >= endTick) continue;

    // The denominator is stored as a power of two (2 means quarter notes).
    const beatTicks = (ppqn * 4) / 2 ** timeSignature.denominator;
    if (!Number.isFinite(beatTicks) || beatTicks <= 0) continue;

    // Include one beat of margin on each side so edge lines are not clipped.
    const rangeStart = Math.max(timeSignature.tick, startTick - beatTicks);
    const rangeEnd = Math.min(segmentEnd, endTick + beatTicks);
    const firstBeat = Math.floor((rangeStart - timeSignature.tick) / beatTicks);

    for (let beat = firstBeat; ; beat++) {
      const tick = timeSignature.tick + beat * beatTicks;
      if (tick > rangeEnd || tick >= segmentEnd) break;

      yield { tick, isMeasure: beat % timeSignature.numerator === 0 };
    }
  }
}
