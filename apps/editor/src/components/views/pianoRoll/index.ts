import { Midi, type MidiNote, type MidiTrack } from "@midiedit/core";
import { clamp } from "es-toolkit";
import { Graphics, type Application } from "pixi.js";
import { AbstractChartView } from "../AbstractChartView";
import {
  BlackPitchClasses,
  MaximumPixelsPerQuarter,
  MaximumPixelsPerSemitone,
  MinimumPixelsPerQuarter,
  MinimumPixelsPerSemitone,
  ZoomSensitivity,
} from "./constants";
import type { PianoRollCamera, PianoRollNote } from "./types";
import {
  buildNoteIndex,
  getVisibleNoteRange,
  type PianoRollNoteIndex,
} from "./visibility";

interface NoteGeometryCache {
  track: MidiTrack;
  source: PianoRollNote[];
  tickWidth: number;
  rowHeight: number;
  width: number;
  height: number;
  startTick: number;
  endTick: number;
  minPitch: number;
  maxPitch: number;
}

export class PianoRollView extends AbstractChartView<PianoRollNote> {
  private readonly keyboardWidth = 64;

  private readonly camera: PianoRollCamera = { x: 0, y: 84, h: 120, v: 18 };
  private readonly pitchRows = new Graphics();
  private readonly minorGrid = new Graphics();
  private readonly majorGrid = new Graphics();
  private readonly notes = new Graphics();
  private readonly keyboard = new Graphics();

  private mappedNotesTrack: MidiTrack | null = null;
  private mappedNotesSource: MidiNote[] | null = null;
  private mappedNotes: PianoRollNote[] = [];
  private mappedNotesIndex: PianoRollNoteIndex | null = null;
  private noteGeometryCache: NoteGeometryCache | null = null;

  private canvas: HTMLCanvasElement | null = null;

  private panPointerId: number | null = null;
  private lastPanX = 0;
  private lastPanY = 0;

  protected override onMounted(app: Application): void {
    app.stage.addChild(
      this.pitchRows,
      this.minorGrid,
      this.majorGrid,
      this.notes,
      this.keyboard,
    );

    this.canvas = app.canvas;

    this.canvas.style.touchAction = "none";
    this.canvas.addEventListener("pointerdown", this.handlePointerDown);
    this.canvas.addEventListener("pointermove", this.handlePointerMove);
    this.canvas.addEventListener("pointerup", this.handlePointerUp);
    this.canvas.addEventListener("pointercancel", this.handlePointerUp);
    this.canvas.addEventListener("wheel", this.handleWheel, { passive: false });
    this.canvas.addEventListener("auxclick", this.handleAuxClick);
  }

  public override destroy(): void {
    if (this.canvas) {
      this.canvas.removeEventListener("pointerdown", this.handlePointerDown);
      this.canvas.removeEventListener("pointermove", this.handlePointerMove);
      this.canvas.removeEventListener("pointerup", this.handlePointerUp);
      this.canvas.removeEventListener("pointercancel", this.handlePointerUp);
      this.canvas.removeEventListener("wheel", this.handleWheel);
      this.canvas.removeEventListener("auxclick", this.handleAuxClick);
    }

    this.canvas = null;
    this.panPointerId = null;
    this.noteGeometryCache = null;
    this.clearMappedNotes();

    super.destroy();
  }

  protected override draw(app: Application): void {
    const width = app.screen.width;
    const height = app.screen.height;

    this.pitchRows.clear();
    this.minorGrid.clear();
    this.majorGrid.clear();
    this.keyboard.clear();

    this.drawPitchRows(width, height);
    this.drawGrid(width, height);
    this.drawNotes(width, height);
    this.drawKeyboard(height);
  }

  private readonly handlePointerDown = (event: PointerEvent): void => {
    if (event.button !== 1) {
      return;
    }

    event.preventDefault();

    this.panPointerId = event.pointerId;

    this.lastPanX = event.clientX;
    this.lastPanY = event.clientY;

    this.canvas?.setPointerCapture(event.pointerId);
  };

  private readonly handlePointerMove = (event: PointerEvent): void => {
    if (this.panPointerId === null || event.pointerId !== this.panPointerId) {
      return;
    }

    const deltaX = event.clientX - this.lastPanX;
    const deltaY = event.clientY - this.lastPanY;

    this.lastPanX = event.clientX;
    this.lastPanY = event.clientY;

    this.pan(deltaX, deltaY);
  };

  private readonly handlePointerUp = (event: PointerEvent): void => {
    if (this.panPointerId === null || event.pointerId !== this.panPointerId) {
      return;
    }

    if (this.canvas?.hasPointerCapture(event.pointerId)) {
      this.canvas.releasePointerCapture(event.pointerId);
    }

    this.panPointerId = null;
  };

  private readonly handleAuxClick = (event: MouseEvent): void => {
    if (event.button === 1) {
      event.preventDefault();
    }
  };

  private readonly handleWheel = (event: WheelEvent): void => {
    event.preventDefault();

    if (!this.canvas) {
      return;
    }

    const bounds = this.canvas.getBoundingClientRect();
    const mouseX = event.clientX - bounds.left;
    const mouseY = event.clientY - bounds.top;

    const zoomFactor = Math.exp(-event.deltaY * ZoomSensitivity);

    if (event.ctrlKey) {
      this.zoomVertical(zoomFactor, mouseY);
      return;
    }

    this.zoomHorizontal(zoomFactor, mouseX);
  };

  private pan(deltaX: number, deltaY: number): void {
    const pixelsPerTick = this.getPixelsPerTick();

    this.camera.x -= deltaX / pixelsPerTick;
    this.camera.y += deltaY / this.camera.v;
    this.camera.x = Math.max(0, this.camera.x);
    this.camera.y = clamp(this.camera.y, 0, 127);

    this.render();
  }

  private zoomHorizontal(zoomFactor: number, mouseX: number): void {
    const rollX = mouseX - this.keyboardWidth;

    const anchorX = Math.max(0, rollX);
    const oldPixelsPerTick = this.getPixelsPerTick();

    const anchorTick = this.camera.x + anchorX / oldPixelsPerTick;

    this.camera.h = clamp(
      this.camera.h * zoomFactor,
      MinimumPixelsPerQuarter,
      MaximumPixelsPerQuarter,
    );

    const newPixelsPerTick = this.getPixelsPerTick();
    this.camera.x = Math.max(0, anchorTick - anchorX / newPixelsPerTick);
    this.render();
  }

  private zoomVertical(zoomFactor: number, mouseY: number): void {
    const oldPixelsPerSemitone = this.camera.v;
    const anchorPitch = this.camera.y - mouseY / oldPixelsPerSemitone;

    this.camera.v = clamp(
      this.camera.v * zoomFactor,
      MinimumPixelsPerSemitone,
      MaximumPixelsPerSemitone,
    );

    this.camera.y = anchorPitch + mouseY / this.camera.v;
    this.camera.y = clamp(this.camera.y, 0, 127);

    this.render();
  }

  private getPixelsPerTick(): number {
    return this.camera.h / this.getPpqn();
  }

  public override getTrackNotes(
    midi: Midi,
    trackIndex: number,
  ): PianoRollNote[] {
    const track = midi.tracks[trackIndex];

    if (!track) {
      return [];
    }

    const sourceNotes = track.getNotes();

    if (
      track === this.mappedNotesTrack &&
      sourceNotes === this.mappedNotesSource
    ) {
      return this.mappedNotes;
    }

    this.mappedNotesTrack = track;
    this.mappedNotesSource = sourceNotes;
    this.mappedNotes = sourceNotes.map((n) => {
      return {
        tick: n.start,
        durationTicks: n.end - n.start,
        pitch: n.note,
        velocity: n.velocity,
      };
    });
    this.mappedNotesIndex = buildNoteIndex(this.mappedNotes);

    return this.mappedNotes;
  }

  private drawPitchRows(width: number, height: number): void {
    const rowHeight = this.camera.v;
    const firstPitch = Math.ceil(this.camera.y);
    const topOffset = (this.camera.y - firstPitch) * rowHeight;
    const rowCount = Math.ceil(height / rowHeight) + 2;

    for (let row = 0; row < rowCount; row++) {
      const pitch = firstPitch - row;

      if (pitch < 0 || pitch > 127) {
        continue;
      }

      const pitchClass = ((pitch % 12) + 12) % 12;
      const isBlackKey = BlackPitchClasses.has(pitchClass);
      const y = topOffset + row * rowHeight;

      this.pitchRows
        .rect(
          this.keyboardWidth,
          y,
          Math.max(0, width - this.keyboardWidth),
          rowHeight,
        )
        .fill(isBlackKey ? 0x181818 : 0x202020);
    }
  }

  private drawKeyboard(height: number): void {
    const rowHeight = this.camera.v;
    const firstPitch = Math.ceil(this.camera.y);
    const topOffset = (this.camera.y - firstPitch) * rowHeight;
    const rowCount = Math.ceil(height / rowHeight) + 2;

    this.keyboard.rect(0, 0, this.keyboardWidth, height).fill(0xd6d6d6);

    for (let row = 0; row < rowCount; row++) {
      const pitch = firstPitch - row;

      if (pitch < 0 || pitch > 127) {
        continue;
      }

      const pitchClass = ((pitch % 12) + 12) % 12;
      const isBlackKey = BlackPitchClasses.has(pitchClass);
      const y = topOffset + row * rowHeight;

      if (isBlackKey) {
        this.keyboard
          .rect(0, y, this.keyboardWidth * 0.65, rowHeight)
          .fill(0x272727);
      }

      this.keyboard
        .moveTo(0, y + rowHeight)
        .lineTo(this.keyboardWidth, y + rowHeight);
    }

    this.keyboard.stroke({
      color: 0x555555,
      width: 1,
    });

    this.keyboard
      .moveTo(this.keyboardWidth, 0)
      .lineTo(this.keyboardWidth, height)
      .stroke({
        color: 0x777777,
        width: 1,
      });
  }

  private drawGrid(width: number, height: number): void {
    const rowHeight = this.camera.v;
    const firstPitch = Math.ceil(this.camera.y);
    const topOffset = (this.camera.y - firstPitch) * rowHeight;

    for (let y = topOffset; y <= height + rowHeight; y += rowHeight) {
      this.minorGrid.moveTo(this.keyboardWidth, y).lineTo(width, y);
    }

    const ppqn = this.getPpqn();
    const pixelsPerTick = this.camera.h / ppqn;
    const firstQuarter = Math.floor(this.camera.x / ppqn);
    const visibleWidth = Math.max(0, width - this.keyboardWidth);

    const quarterCount = Math.ceil(visibleWidth / this.camera.h) + 2;

    for (let index = 0; index < quarterCount; index++) {
      const quarter = firstQuarter + index;
      const tick = quarter * ppqn;
      const x = this.keyboardWidth + (tick - this.camera.x) * pixelsPerTick;

      // TODO: Update to reflect time signatures accurately
      const isMeasure = quarter % 4 === 0;
      const target = isMeasure ? this.majorGrid : this.minorGrid;

      target.moveTo(x, 0).lineTo(x, height);
    }

    this.minorGrid.stroke({
      color: 0x353535,
      width: 1,
    });

    this.majorGrid.stroke({
      color: 0x555555,
      width: 2,
    });
  }

  private drawNotes(width: number, height: number): void {
    // Clear all notes in the view
    this.notes.position.set(0, 0);

    // If a MIDI file has not been loaded or there's no selected track, return.
    if (!this.state.midi || this.state.selectedTrackIndex === null) {
      this.notes.clear();
      this.noteGeometryCache = null;
      this.clearMappedNotes();
      return;
    }

    // Get the current track. If it's invalid, return.
    const track = this.state.midi.tracks[this.state.selectedTrackIndex];
    if (!track) {
      this.notes.clear();
      this.noteGeometryCache = null;
      this.clearMappedNotes();
      return;
    }

    // Compute the pixel width of each tick and pixel height of each note
    const tickWidth = this.camera.h / this.getPpqn();
    const rowHeight = this.camera.v;
    const h = Math.max(1, rowHeight - 2);
    const fill = 0x5d9cec;
    const stroke = { color: 0x82b8f4, width: 1 };

    const notes = this.getTrackNotes(
      this.state.midi,
      this.state.selectedTrackIndex,
    );

    if (
      !this.canReuseNoteGeometry(
        track,
        notes,
        tickWidth,
        rowHeight,
        width,
        height,
      )
    ) {
      this.rebuildNoteGeometry(
        track,
        notes,
        tickWidth,
        rowHeight,
        width,
        height,
        h,
        fill,
        stroke,
      );
    }

    this.notes.position.set(
      -this.camera.x * tickWidth,
      this.camera.y * rowHeight,
    );
  }

  private clearMappedNotes(): void {
    this.mappedNotesTrack = null;
    this.mappedNotesSource = null;
    this.mappedNotes = [];
    this.mappedNotesIndex = null;
  }

  private canReuseNoteGeometry(
    track: MidiTrack,
    notes: PianoRollNote[],
    tickWidth: number,
    rowHeight: number,
    width: number,
    height: number,
  ): boolean {
    const cache = this.noteGeometryCache;

    if (
      !cache ||
      cache.track !== track ||
      cache.source !== notes ||
      cache.tickWidth !== tickWidth ||
      cache.rowHeight !== rowHeight ||
      cache.width !== width ||
      cache.height !== height
    ) {
      return false;
    }

    const horizontalRange = Math.max(0, width - this.keyboardWidth) / tickWidth;
    const verticalRange = height / rowHeight;

    return (
      this.camera.x >= cache.startTick &&
      this.camera.x + horizontalRange <= cache.endTick &&
      this.camera.y - verticalRange >= cache.minPitch &&
      this.camera.y <= cache.maxPitch
    );
  }

  private rebuildNoteGeometry(
    track: MidiTrack,
    notes: PianoRollNote[],
    tickWidth: number,
    rowHeight: number,
    width: number,
    height: number,
    noteHeight: number,
    fill: number,
    stroke: { color: number; width: number },
  ): void {
    const horizontalRange = Math.max(0, width - this.keyboardWidth) / tickWidth;
    const verticalRange = height / rowHeight;
    const startTick = Math.max(0, this.camera.x - horizontalRange);
    const endTick = this.camera.x + horizontalRange * 2;
    const minPitch = this.camera.y - verticalRange;
    const maxPitch = this.camera.y + verticalRange;
    const visibleRange = getVisibleNoteRange(
      notes,
      this.mappedNotesIndex,
      startTick,
      endTick,
      tickWidth,
    );
    const radius = Math.min(2, noteHeight / 4);

    this.notes.clear();

    for (let index = visibleRange.start; index < visibleRange.end; index++) {
      const note = notes[index];

      if (note.pitch < minPitch || note.pitch > maxPitch) {
        continue;
      }

      const x = this.keyboardWidth + note.tick * tickWidth;
      const y = -note.pitch * rowHeight;
      const noteWidth = Math.max(2, note.durationTicks * tickWidth);

      this.notes
        .roundRect(x, y + 1, noteWidth, noteHeight, radius)
        .fill(fill)
        .stroke(stroke);
    }

    this.noteGeometryCache = {
      track,
      source: notes,
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
}
