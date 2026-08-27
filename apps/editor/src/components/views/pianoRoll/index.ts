import { Graphics, type Application } from "pixi.js";

import { ChannelMessage, type Midi } from "@midiedit/core";

import { AbstractChartView, type ChartViewState } from "../AbstractChartView";
import {
  MinimumPixelsPerQuarter,
  MaximumPixelsPerQuarter,
  MinimumPixelsPerSemitone,
  MaximumPixelsPerSemitone,
  BlackPitchClasses,
  ZoomSensitivity,
} from "./constants";
import type { PianoRollNote, ActiveNote, PianoRollCamera } from "./types";

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function getTrackNotes(midi: Midi, trackIndex: number): PianoRollNote[] {
  const track = midi.tracks[trackIndex];

  if (!track) {
    return [];
  }

  const notes: PianoRollNote[] = [];

  let absoluteTick = 0;

  const activeNotes = new Map<number, ActiveNote[]>();

  for (const event of track.events) {
    /*
     * Every MIDI event advances the track clock,
     * regardless of whether we render it.
     */
    absoluteTick += event.deltaTime;

    /*
     * Ignore everything except MIDI channel events.
     */
    if (!("messageType" in event)) {
      continue;
    }

    if (
      event.messageType !== ChannelMessage.NoteOn &&
      event.messageType !== ChannelMessage.NoteOff
    ) {
      continue;
    }

    /*
     * MIDI channel event:
     *
     * data1 = note number
     * data2 = velocity
     */
    const pitch = event.data1;
    const velocity = event.data2 ?? 0;

    const isNoteOn =
      event.messageType === ChannelMessage.NoteOn && velocity > 0;

    /*
     * MIDI allows NoteOn velocity 0 to represent NoteOff.
     */
    const isNoteOff =
      event.messageType === ChannelMessage.NoteOff ||
      (event.messageType === ChannelMessage.NoteOn && velocity === 0);

    if (isNoteOn) {
      let active = activeNotes.get(pitch);

      if (!active) {
        active = [];
        activeNotes.set(pitch, active);
      }

      active.push({
        tick: absoluteTick,
        velocity,
      });

      continue;
    }

    if (isNoteOff) {
      const active = activeNotes.get(pitch);

      if (!active || active.length === 0) {
        continue;
      }

      const noteOn = active.shift();

      if (!noteOn) {
        continue;
      }

      notes.push({
        tick: noteOn.tick,
        durationTicks: absoluteTick - noteOn.tick,
        pitch,
        velocity: noteOn.velocity,
      });

      if (active.length === 0) {
        activeNotes.delete(pitch);
      }
    }
  }

  return notes;
}

export class PianoRollView extends AbstractChartView {
  private readonly keyboardWidth = 64;

  private readonly camera: PianoRollCamera = {
    startTick: 0,
    topPitch: 84,
    pixelsPerQuarter: 120,
    pixelsPerSemitone: 18,
  };

  private readonly pitchRows = new Graphics();

  private readonly minorGrid = new Graphics();

  private readonly majorGrid = new Graphics();

  private readonly notes = new Graphics();

  private readonly keyboard = new Graphics();

  /*
   * Canvas used for DOM pointer/wheel interaction.
   */
  private canvas: HTMLCanvasElement | null = null;

  /*
   * Middle-mouse panning state.
   */
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

    /*
     * Prevent browser touch gestures from interfering if pointer
     * input later comes from touch/pen devices.
     */
    this.canvas.style.touchAction = "none";

    this.canvas.addEventListener("pointerdown", this.handlePointerDown);

    this.canvas.addEventListener("pointermove", this.handlePointerMove);

    this.canvas.addEventListener("pointerup", this.handlePointerUp);

    this.canvas.addEventListener("pointercancel", this.handlePointerUp);

    /*
     * passive:false is necessary because Ctrl+wheel normally
     * triggers browser page zoom.
     */
    this.canvas.addEventListener("wheel", this.handleWheel, {
      passive: false,
    });

    /*
     * Prevent middle-click browser behaviors such as opening
     * links/autoscroll from leaking through.
     */
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

    super.destroy();
  }

  protected override draw(app: Application, state: ChartViewState): void {
    const width = app.screen.width;
    const height = app.screen.height;

    this.drawPitchRows(width, height);

    this.drawGrid(width, height, state);

    this.drawNotes(width, height, state);

    this.drawKeyboard(height);
  }

  /*
   * ------------------------------------------------------------
   * Interaction
   * ------------------------------------------------------------
   */

  /**
   * Middle mouse starts panning.
   */
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

  /**
   * Pan in both dimensions while middle mouse is held.
   */
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

  /**
   * Wheel:
   *
   *     wheel        = horizontal zoom
   *     Ctrl + wheel = vertical zoom
   */
  private readonly handleWheel = (event: WheelEvent): void => {
    event.preventDefault();

    if (!this.canvas) {
      return;
    }

    const bounds = this.canvas.getBoundingClientRect();

    const mouseX = event.clientX - bounds.left;

    const mouseY = event.clientY - bounds.top;

    /*
     * deltaY > 0:
     *     zoom out
     *
     * deltaY < 0:
     *     zoom in
     */
    const zoomFactor = Math.exp(-event.deltaY * ZoomSensitivity);

    if (event.ctrlKey) {
      this.zoomVertical(zoomFactor, mouseY);

      return;
    }

    this.zoomHorizontal(zoomFactor, mouseX);
  };

  /**
   * Middle-mouse camera movement.
   *
   * The content follows the mouse:
   *
   * drag right  -> earlier ticks
   * drag left   -> later ticks
   *
   * drag down   -> higher pitches at viewport top
   * drag up     -> lower pitches at viewport top
   */
  private pan(deltaX: number, deltaY: number): void {
    const pixelsPerTick = this.getPixelsPerTick();

    /*
     * Dragging content to the right means moving the
     * camera toward earlier ticks.
     */
    this.camera.startTick -= deltaX / pixelsPerTick;

    /*
     * Screen Y grows downward.
     *
     * Increasing topPitch moves the rendered notes downward.
     */
    this.camera.topPitch += deltaY / this.camera.pixelsPerSemitone;

    this.camera.startTick = Math.max(0, this.camera.startTick);

    this.camera.topPitch = clamp(this.camera.topPitch, 0, 127);

    this.render();
  }

  /**
   * Horizontal wheel zoom.
   *
   * The MIDI tick currently beneath the mouse stays beneath
   * the mouse after the zoom.
   */
  private zoomHorizontal(zoomFactor: number, mouseX: number): void {
    const rollX = mouseX - this.keyboardWidth;

    /*
     * Ignore horizontal anchoring while hovering over
     * the keyboard itself.
     */
    const anchorX = Math.max(0, rollX);

    const oldPixelsPerTick = this.getPixelsPerTick();

    /*
     * Determine which MIDI tick is currently beneath
     * the cursor.
     */
    const anchorTick = this.camera.startTick + anchorX / oldPixelsPerTick;

    this.camera.pixelsPerQuarter = clamp(
      this.camera.pixelsPerQuarter * zoomFactor,
      MinimumPixelsPerQuarter,
      MaximumPixelsPerQuarter,
    );

    const newPixelsPerTick = this.getPixelsPerTick();

    /*
     * Reposition the camera so anchorTick remains at
     * the same screen-space X.
     */
    this.camera.startTick = anchorTick - anchorX / newPixelsPerTick;

    this.camera.startTick = Math.max(0, this.camera.startTick);

    this.render();
  }

  /**
   * Ctrl+wheel vertical zoom.
   *
   * The pitch under the mouse stays in the same vertical
   * screen position.
   */
  private zoomVertical(zoomFactor: number, mouseY: number): void {
    const oldPixelsPerSemitone = this.camera.pixelsPerSemitone;

    /*
     * Determine the continuous MIDI pitch beneath
     * the cursor.
     */
    const anchorPitch = this.camera.topPitch - mouseY / oldPixelsPerSemitone;

    this.camera.pixelsPerSemitone = clamp(
      this.camera.pixelsPerSemitone * zoomFactor,
      MinimumPixelsPerSemitone,
      MaximumPixelsPerSemitone,
    );

    /*
     * Keep anchorPitch at the same Y position.
     */
    this.camera.topPitch = anchorPitch + mouseY / this.camera.pixelsPerSemitone;

    this.camera.topPitch = clamp(this.camera.topPitch, 0, 127);

    this.render();
  }

  /**
   * Current conversion between MIDI ticks and screen pixels.
   */
  private getPixelsPerTick(): number {
    /*
     * We don't retain MidiViewState here, so horizontal
     * interaction needs the currently rendered PPQN.
     *
     * See currentPpqn below.
     */
    return this.camera.pixelsPerQuarter / this.currentPpqn;
  }

  /*
   * Updated every draw so interaction can convert pixels/ticks
   * without owning or duplicating MidiViewState.
   */
  private currentPpqn = 480;

  /*
   * ------------------------------------------------------------
   * Rendering
   * ------------------------------------------------------------
   */

  private drawPitchRows(width: number, height: number): void {
    this.pitchRows.clear();

    const rowHeight = this.camera.pixelsPerSemitone;

    /*
     * topPitch may be fractional because panning is smooth.
     *
     * Render enough rows to cover the viewport plus one
     * extra row at each edge.
     */
    const firstPitch = Math.ceil(this.camera.topPitch);

    const topOffset = (this.camera.topPitch - firstPitch) * rowHeight;

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
    this.keyboard.clear();

    const rowHeight = this.camera.pixelsPerSemitone;

    const firstPitch = Math.ceil(this.camera.topPitch);

    const topOffset = (this.camera.topPitch - firstPitch) * rowHeight;

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

  private drawGrid(width: number, height: number, state: ChartViewState): void {
    this.minorGrid.clear();
    this.majorGrid.clear();

    const rowHeight = this.camera.pixelsPerSemitone;

    const firstPitch = Math.ceil(this.camera.topPitch);

    const topOffset = (this.camera.topPitch - firstPitch) * rowHeight;

    /*
     * Horizontal pitch lines.
     */
    for (let y = topOffset; y <= height + rowHeight; y += rowHeight) {
      this.minorGrid.moveTo(this.keyboardWidth, y).lineTo(width, y);
    }

    const ppqn = state.midi?.header.division ?? 480;

    this.currentPpqn = ppqn;

    const pixelsPerTick = this.camera.pixelsPerQuarter / ppqn;

    const firstQuarter = Math.floor(this.camera.startTick / ppqn);

    const visibleWidth = Math.max(0, width - this.keyboardWidth);

    const quarterCount =
      Math.ceil(visibleWidth / this.camera.pixelsPerQuarter) + 2;

    for (let index = 0; index < quarterCount; index++) {
      const quarter = firstQuarter + index;

      const tick = quarter * ppqn;

      const x =
        this.keyboardWidth + (tick - this.camera.startTick) * pixelsPerTick;

      /*
       * Temporary 4/4 assumption.
       */
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

  private drawNotes(
    width: number,
    height: number,
    state: ChartViewState,
  ): void {
    this.notes.clear();

    const midi = state.midi;

    const trackIndex = state.selectedTrackIndex;

    if (!midi || trackIndex === null) {
      return;
    }

    const track = midi.tracks[trackIndex];

    if (!track) {
      return;
    }

    const ppqn = midi.header.division;

    this.currentPpqn = ppqn;

    const pixelsPerTick = this.camera.pixelsPerQuarter / ppqn;

    const rowHeight = this.camera.pixelsPerSemitone;

    const notes = getTrackNotes(midi, trackIndex);

    for (const note of notes) {
      const x =
        this.keyboardWidth +
        (note.tick - this.camera.startTick) * pixelsPerTick;

      const y = (this.camera.topPitch - note.pitch) * rowHeight;

      const noteWidth = Math.max(2, note.durationTicks * pixelsPerTick);

      const noteHeight = Math.max(1, rowHeight - 2);

      /*
       * Viewport culling.
       */
      if (
        x + noteWidth < this.keyboardWidth ||
        x > width ||
        y + noteHeight < 0 ||
        y > height
      ) {
        continue;
      }

      this.notes
        .roundRect(x, y + 1, noteWidth, noteHeight, Math.min(2, noteHeight / 4))
        .fill(0x5d9cec)
        .stroke({
          color: 0x82b8f4,
          width: 1,
        });
    }
  }
}
