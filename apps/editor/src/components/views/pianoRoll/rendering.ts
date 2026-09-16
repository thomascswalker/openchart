import type { TimeSignatureChange } from "@midiedit/core";
import { Container, Graphics } from "pixi.js";
import { BlackPitchClasses, HeaderHeight } from "./constants";
import type { CoordinateSystem } from "./coordinates";
import { HeaderController } from "./header";
import { NoteDataStore } from "./noteData";
import { NoteGeometryCache } from "./noteGeometry";
import type { PianoRollContext } from "./types";

const noteColor = 0x5d9cec;
const noteSelectedColor = 0xff0000;
const noteStrokeColor = { color: 0x82b8f4, width: 1 };

/** Owns all Pixi layers and the piano-roll draw order. */
export class PianoRollRenderer {
  private readonly context: PianoRollContext;
  private readonly coordinates: CoordinateSystem;
  private readonly noteData: NoteDataStore;
  private readonly geometry: NoteGeometryCache;
  private readonly header: HeaderController;

  private readonly pitchRows = new Graphics();
  private readonly snapGrid = new Graphics();
  private readonly minorGrid = new Graphics();
  private readonly majorGrid = new Graphics();
  private readonly notesGraphics = new Graphics();
  private readonly keyboard = new Graphics();
  private readonly selectionBox = new Graphics();
  private readonly cursor = new Graphics();

  public constructor(
    context: PianoRollContext,
    coordinates: CoordinateSystem,
    noteData: NoteDataStore,
    geometry: NoteGeometryCache,
    header: HeaderController,
  ) {
    this.context = context;
    this.coordinates = coordinates;
    this.noteData = noteData;
    this.geometry = geometry;
    this.header = header;
  }

  public getDisplayObjects(): [
    Graphics,
    Graphics,
    Graphics,
    Graphics,
    Graphics,
    Graphics,
    Graphics,
    Graphics,
    Container,
    Container,
    Graphics,
  ] {
    const [header, labels, boxes] = this.header.getDisplayObjects();
    return [
      this.pitchRows,
      this.snapGrid,
      this.minorGrid,
      this.majorGrid,
      this.notesGraphics,
      this.keyboard,
      this.selectionBox,
      header,
      labels,
      boxes,
      this.cursor,
    ];
  }

  public draw(width: number, height: number, playheadTick: number): void {
    this.pitchRows.clear();
    this.snapGrid.clear();
    this.minorGrid.clear();
    this.majorGrid.clear();
    this.notesGraphics.clear();
    this.keyboard.clear();
    this.selectionBox.clear();
    this.header.graphics.clear();
    this.cursor.clear();

    this.drawPitchRows(width, height);
    this.drawGrid(width, height);
    this.drawNotes(width, height);
    this.drawKeyboard(height);
    this.drawSelectionBox();
    this.header.draw(width);
    this.drawCursor(width, height, playheadTick);
  }

  public drawCursor(width: number, height: number, playheadTick: number): void {
    const x = this.coordinates.screenXForTick(playheadTick);
    if (x < this.context.getKeyboardWidth() || x >= width) return;
    this.cursor.lineStyle(2, 0xff0000).moveTo(x, 0).lineTo(x, height);
  }

  private drawPitchRows(width: number, height: number): void {
    const rowHeight = this.coordinates.getCamera().v;
    const rollHeight = Math.max(0, height - HeaderHeight);
    const camera = this.coordinates.getCamera();
    const firstPitch = Math.ceil(camera.y);
    const topOffset = (camera.y - firstPitch) * rowHeight;
    const rowCount = Math.ceil(rollHeight / rowHeight) + 2;

    for (let row = 0; row < rowCount; row++) {
      const pitch = firstPitch - row;
      if (pitch < 0 || pitch > 127) continue;
      const pitchClass = ((pitch % 12) + 12) % 12;
      const y = HeaderHeight + topOffset + row * rowHeight;
      this.pitchRows.beginFill(
        BlackPitchClasses.has(pitchClass) ? 0x181818 : 0x202020,
      );
      this.pitchRows.drawRect(
        this.context.getKeyboardWidth(),
        y,
        Math.max(0, width - this.context.getKeyboardWidth()),
        rowHeight,
      );
      this.pitchRows.endFill();
    }
  }

  private drawKeyboard(height: number): void {
    const rowHeight = this.coordinates.getCamera().v;
    const rollHeight = Math.max(0, height - HeaderHeight);
    const camera = this.coordinates.getCamera();
    const firstPitch = Math.ceil(camera.y);
    const topOffset = (camera.y - firstPitch) * rowHeight;
    const rowCount = Math.ceil(rollHeight / rowHeight) + 2;
    const keyboardWidth = this.context.getKeyboardWidth();

    this.keyboard.beginFill(0xd6d6d6);
    this.keyboard.drawRect(0, HeaderHeight, keyboardWidth, rollHeight);
    this.keyboard.endFill();
    for (let row = 0; row < rowCount; row++) {
      const pitch = firstPitch - row;
      if (pitch < 0 || pitch > 127) continue;
      const pitchClass = ((pitch % 12) + 12) % 12;
      const y = HeaderHeight + topOffset + row * rowHeight;
      if (BlackPitchClasses.has(pitchClass)) {
        this.keyboard.beginFill(0x272727);
        this.keyboard.drawRect(0, y, keyboardWidth * 0.65, rowHeight);
        this.keyboard.endFill();
      }
      this.keyboard
        .moveTo(0, y + rowHeight)
        .lineTo(keyboardWidth, y + rowHeight);
    }
    this.keyboard.lineStyle(1, 0x555555);
    this.keyboard
      .moveTo(keyboardWidth, HeaderHeight)
      .lineTo(keyboardWidth, height);
    this.keyboard.lineStyle(1, 0x777777);
  }

  private drawGrid(width: number, height: number): void {
    this.minorGrid.lineStyle(1, 0x353535);
    this.majorGrid.lineStyle(2, 0x555555);
    const rowHeight = this.coordinates.getCamera().v;
    const camera = this.coordinates.getCamera();
    const firstPitch = Math.ceil(camera.y);
    const topOffset = (camera.y - firstPitch) * rowHeight;
    for (
      let y = HeaderHeight + topOffset;
      y <= height + rowHeight;
      y += rowHeight
    ) {
      this.minorGrid
        .moveTo(this.context.getKeyboardWidth(), y)
        .lineTo(width, y);
    }

    const visibleWidth = Math.max(0, width - this.context.getKeyboardWidth());
    const visibleStart = camera.x;
    const visibleEnd = this.coordinates.tickAtScreenX(
      this.context.getKeyboardWidth() + visibleWidth,
    );
    this.drawSnapGrid(height, visibleStart, visibleEnd);
    for (const { tick, isMeasure } of iterateGridBeats(
      this.context.getPpqn(),
      this.context.getTimeSignatureChanges(),
      visibleStart,
      visibleEnd,
    )) {
      const x = this.coordinates.screenXForTick(tick);
      const target = isMeasure ? this.majorGrid : this.minorGrid;
      target.moveTo(x, HeaderHeight).lineTo(x, height);
    }
  }

  private drawSnapGrid(
    height: number,
    visibleStart: number,
    visibleEnd: number,
  ): void {
    if (!this.context.getState().snap.enabled) return;
    const ticksPerSnap = this.coordinates.getSnapTicks();
    if (!Number.isFinite(ticksPerSnap) || ticksPerSnap <= 0) return;
    this.snapGrid.lineStyle(1, 0x2a2a2a);
    const firstTick = Math.floor(visibleStart / ticksPerSnap) * ticksPerSnap;
    for (let tick = firstTick; tick <= visibleEnd; tick += ticksPerSnap) {
      const x = this.coordinates.screenXForTick(tick);
      this.snapGrid.moveTo(x, HeaderHeight).lineTo(x, height);
    }
  }

  private drawNotes(width: number, height: number): void {
    this.notesGraphics.position.set(0, 0);
    const midi = this.context.getMidi();
    const track = this.context.getSelectedTrack();
    if (!midi || !track) {
      this.geometry.clear();
      this.noteData.clear();
      return;
    }

    const camera = this.coordinates.getCamera();
    const tickWidth = camera.h / this.context.getPpqn();
    const rowHeight = camera.v;
    const noteHeight = Math.max(1, rowHeight - 2);
    const notes = this.context.getTrackNotes(
      midi,
      this.context.getState().selectedTrackIndex!,
    );
    const visibleEnd = this.coordinates.tickAtScreenX(width);
    if (
      this.geometry.needsRebuild({
        track,
        notes,
        tempoChanges: this.context.getTempoChanges(),
        tickWidth,
        rowHeight,
        width,
        height,
        visibleEnd,
        coordinates: this.coordinates,
      })
    ) {
      this.geometry.rebuild({
        track,
        notes,
        noteIndex: this.noteData.currentIndex,
        tempoChanges: this.context.getTempoChanges(),
        tickWidth,
        rowHeight,
        width,
        height,
        noteHeight,
        coordinates: this.coordinates,
      });
    }

    const selection = this.context.getSelectionContext();
    const selectionSize = selection.size;
    const allSelected = selectionSize > 0 && selectionSize >= notes.length;
    const noneSelected = selectionSize === 0;
    for (const geometry of this.geometry.geometry) {
      const isSelected = allSelected
        ? true
        : noneSelected
          ? false
          : selection.isSelected(geometry.note);
      this.notesGraphics.lineStyle(
        noteStrokeColor.width,
        noteStrokeColor.color,
      );
      this.notesGraphics.beginFill(isSelected ? noteSelectedColor : noteColor);
      this.notesGraphics.drawRoundedRect(
        geometry.x,
        geometry.y + 1,
        geometry.width,
        geometry.height,
        geometry.radius,
      );
      this.notesGraphics.endFill();
    }
    this.notesGraphics.position.set(
      -this.coordinates.timelineUnitsAtTick(camera.x) * camera.h,
      camera.y * rowHeight + HeaderHeight,
    );
  }

  private drawSelectionBox(): void {
    const selection = this.context.getSelectionContext();
    if (!selection.isSelecting) return;
    this.selectionBox.beginFill(0xffffff, 0.5);
    const bounds = selection.bounds!;
    this.selectionBox.drawRect(bounds.x, bounds.y, bounds.width, bounds.height);
    this.selectionBox.endFill();
  }
}

export function* iterateGridBeats(
  ppqn: number,
  segments: TimeSignatureChange[],
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
      if (tick > rangeEnd) break;
      yield { tick, isMeasure: beat % segment.numerator === 0 };
    }
  }
}
