import * as THREE from "three";
import { BlackPitchClasses, HeaderHeight } from "./constants";
import type { CoordinateSystem } from "./coordinates";
import { HeaderController } from "./header";
import { NoteDataStore } from "./noteData";
import { NoteGeometryCache } from "./noteGeometry";
import type { PianoRollContext } from "./types";

const noteColor = 0x5d9cec;
const noteSelectedColor = 0xff0000;

/** Owns the Three scene objects and piano-roll draw order. */
export class PianoRollRenderer {
  private readonly scene = new THREE.Scene();
  private readonly context: PianoRollContext;
  private readonly coordinates: CoordinateSystem;
  private readonly noteData: NoteDataStore;
  private readonly geometry: NoteGeometryCache;
  private readonly header: HeaderController;

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

  public getScene(): THREE.Scene {
    return this.scene;
  }

  public dispose(): void {
    this.clearScene();
  }

  public draw(width: number, height: number, playheadTick: number): void {
    this.clearScene();
    this.addRect(0, 0, width, HeaderHeight, 0x1c1c1c, 10);
    this.addRect(0, HeaderHeight, width, height - HeaderHeight, 0x151515, 0);
    this.drawPitchRows(width, height);
    this.drawGrid(width, height);
    this.drawNotes(width, height);
    this.drawKeyboard(height);
    this.drawSelectionBox();
    this.drawCursor(width, height, playheadTick);
    this.header.draw(width);
  }

  public drawCursor(width: number, height: number, playheadTick: number): void {
    const x = this.coordinates.screenXForTick(playheadTick);
    if (x < this.context.getKeyboardWidth() || x >= width) return;
    this.addLine(
      [new THREE.Vector3(x, 0, 0.9), new THREE.Vector3(x, height, 0.9)],
      0xff0000,
      2,
      30,
    );
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
      this.addRect(
        this.context.getKeyboardWidth(),
        y,
        Math.max(0, width - this.context.getKeyboardWidth()),
        rowHeight,
        BlackPitchClasses.has(pitchClass) ? 0x181818 : 0x202020,
        1,
      );
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
    this.addRect(0, HeaderHeight, keyboardWidth, rollHeight, 0xd6d6d6, 2);
    for (let row = 0; row < rowCount; row++) {
      const pitch = firstPitch - row;
      if (pitch < 0 || pitch > 127) continue;
      const pitchClass = ((pitch % 12) + 12) % 12;
      const y = HeaderHeight + topOffset + row * rowHeight;
      if (BlackPitchClasses.has(pitchClass)) {
        this.addRect(0, y, keyboardWidth * 0.65, rowHeight, 0x272727, 3);
      }
      this.addLine(
        [
          new THREE.Vector3(0, y + rowHeight, 4),
          new THREE.Vector3(keyboardWidth, y + rowHeight, 4),
        ],
        0x555555,
        1,
        4,
      );
    }
    this.addLine(
      [
        new THREE.Vector3(keyboardWidth, HeaderHeight, 5),
        new THREE.Vector3(keyboardWidth, height, 5),
      ],
      0x777777,
      1,
      5,
    );
  }

  private drawGrid(width: number, height: number): void {
    const rowHeight = this.coordinates.getCamera().v;
    const camera = this.coordinates.getCamera();
    const firstPitch = Math.ceil(camera.y);
    const topOffset = (camera.y - firstPitch) * rowHeight;
    const horizontal: THREE.Vector3[] = [];
    for (
      let y = HeaderHeight + topOffset;
      y <= height + rowHeight;
      y += rowHeight
    ) {
      horizontal.push(
        new THREE.Vector3(this.context.getKeyboardWidth(), y, 6),
        new THREE.Vector3(width, y, 6),
      );
    }
    this.addLine(horizontal, 0x353535, 1, 6);

    const visibleWidth = Math.max(0, width - this.context.getKeyboardWidth());
    const visibleStart = camera.x;
    const visibleEnd = this.coordinates.tickAtScreenX(
      this.context.getKeyboardWidth() + visibleWidth,
    );
    this.drawSnapGrid(height, visibleStart, visibleEnd);
    const vertical: THREE.Vector3[] = [];
    const major: THREE.Vector3[] = [];
    for (const { tick, isMeasure } of iterateGridBeats(
      this.context.getPpqn(),
      this.context.getTimeSignatureChanges(),
      visibleStart,
      visibleEnd,
    )) {
      const x = this.coordinates.screenXForTick(tick);
      const target = isMeasure ? major : vertical;
      target.push(
        new THREE.Vector3(x, HeaderHeight, 7),
        new THREE.Vector3(x, height, 7),
      );
    }
    this.addLine(vertical, 0x353535, 1, 7);
    this.addLine(major, 0x555555, 2, 8);
  }

  private drawSnapGrid(
    height: number,
    visibleStart: number,
    visibleEnd: number,
  ): void {
    if (!this.context.getState().snap.enabled) return;
    const ticksPerSnap = this.coordinates.getSnapTicks();
    if (!Number.isFinite(ticksPerSnap) || ticksPerSnap <= 0) return;
    const lines: THREE.Vector3[] = [];
    const firstTick = Math.floor(visibleStart / ticksPerSnap) * ticksPerSnap;
    for (let tick = firstTick; tick <= visibleEnd; tick += ticksPerSnap) {
      const x = this.coordinates.screenXForTick(tick);
      lines.push(
        new THREE.Vector3(x, HeaderHeight, 9),
        new THREE.Vector3(x, height, 9),
      );
    }
    this.addLine(lines, 0x2a2a2a, 1, 9);
  }

  private drawNotes(width: number, height: number): void {
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
    const allSelected = selection.size > 0 && selection.size >= notes.length;
    const noneSelected = selection.size === 0;
    for (const geometry of this.geometry.geometry) {
      const isSelected = allSelected
        ? true
        : noneSelected
          ? false
          : selection.isSelected(geometry.note);
      const screenRect = this.coordinates.toScreenSpace({
        x: geometry.x,
        y: geometry.y,
        width: geometry.width,
        height: geometry.height,
      });
      this.addRect(
        screenRect.x,
        screenRect.y + 1,
        screenRect.width,
        screenRect.height,
        isSelected ? noteSelectedColor : noteColor,
        20,
      );
    }
  }

  private drawSelectionBox(): void {
    const bounds = this.context.getSelectionContext().bounds;
    if (!bounds) return;
    this.addRect(
      bounds.x,
      bounds.y,
      bounds.width,
      bounds.height,
      0xffffff,
      40,
      0.5,
    );
  }

  private addRect(
    x: number,
    y: number,
    width: number,
    height: number,
    color: number,
    renderOrder: number,
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
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x + width / 2, y + height / 2, renderOrder / 100);
    mesh.renderOrder = renderOrder;
    this.scene.add(mesh);
  }

  private addLine(
    points: THREE.Vector3[],
    color: number,
    linewidth: number,
    renderOrder: number,
  ): void {
    if (points.length < 2) return;
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({ color, linewidth });
    material.depthTest = false;
    material.depthWrite = false;
    const line = new THREE.LineSegments(geometry, material);
    line.renderOrder = renderOrder;
    this.scene.add(line);
  }

  private clearScene(): void {
    for (const object of this.scene.children) {
      object.traverse((child) => {
        const mesh = child as THREE.Mesh;
        mesh.geometry?.dispose();
        const material = mesh.material;
        if (Array.isArray(material)) material.forEach((item) => item.dispose());
        else material?.dispose();
      });
    }
    this.scene.clear();
  }
}

export function* iterateGridBeats(
  ppqn: number,
  segments: import("@midiedit/core").TimeSignatureChange[],
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
