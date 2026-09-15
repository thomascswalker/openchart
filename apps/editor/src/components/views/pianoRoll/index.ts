import {
  msToTicks,
  ticksToMs,
  type Midi,
  type MidiChannelEvent,
  type MidiNote,
  type MidiTrack,
  type TempoChange,
  type TimeSignatureChange,
} from "@midiedit/core";
import { clamp } from "es-toolkit";
import {
  Container,
  Graphics,
  Point,
  Rectangle,
  Text,
  type Application,
} from "pixi.js";
import { AbstractChartView } from "../AbstractChartView";
import {
  BlackPitchClasses,
  HeaderHeight,
  HeaderMarkerHitRadius,
  HeaderMarkerLabelHeight,
  HeaderMarkerLabelWidth,
  HeaderTempoLaneHeight,
  MaximumPixelsPerQuarter,
  MaximumPixelsPerSemitone,
  MinimumPixelsPerQuarter,
  MinimumPixelsPerSemitone,
  NoteResizeHandleWidth,
  ZoomSensitivity,
} from "./constants";
import type { PianoRollCamera, PianoRollNote } from "./types";
import {
  buildNoteIndex,
  getVisibleNoteRange,
  type PianoRollNoteIndex,
} from "./visibility";
import { SelectionContext } from "./selection";
import { PointerButton, PointerContext } from "./pointer";
import { getScrollGesture } from "../../../util/scroll";

const noteColor = 0x5d9cec;
const noteSelectedColor = 0xff0000;
const noteStrokeColor = { color: 0x82b8f4, width: 1 };

interface NoteGeometry {
  x: number;
  y: number;
  width: number;
  height: number;
  radius: number;
  note: PianoRollNote;
}

interface NoteGeometryCache {
  track: MidiTrack;
  notes: PianoRollNote[];
  tempoChanges: TempoChange[];
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

export class PianoRollView extends AbstractChartView<PianoRollNote> {
  private readonly keyboardWidth = 64;

  private readonly camera: PianoRollCamera = { x: 0, y: 84, h: 120, v: 18 };

  private readonly pitchRows = new Graphics();
  private readonly snapGrid = new Graphics();
  private readonly minorGrid = new Graphics();
  private readonly majorGrid = new Graphics();
  private readonly notes = new Graphics();
  private readonly keyboard = new Graphics();
  private readonly selectionBox = new Graphics();
  private readonly header = new Graphics();
  private readonly cursor = new Graphics();

  private readonly headerLabels = new Container();
  private readonly headerBoxes = new Container();
  private readonly tempoLabelPool: Text[] = [];
  private readonly timeSignatureLabelPool: Text[] = [];

  private mappedNotesTrack: MidiTrack | null = null;
  private mappedNotesSource: MidiNote[] | null = null;
  private mappedNotes: PianoRollNote[] = [];
  private mappedNotesIndex: PianoRollNoteIndex | null = null;
  private noteGeometryCache: NoteGeometryCache | null = null;

  private tempoCacheMidi: Midi | null = null;
  private tempoChanges: TempoChange[] = [
    {
      tick: 0,
      microsecondsPerQuarterNote: 500_000,
    },
  ];
  private timeSignatureChanges: TimeSignatureChange[] = [
    {
      tick: 0,
      numerator: 4,
      denominator: 2,
    },
  ];

  private canvas: HTMLCanvasElement | null = null;
  private playheadTick = 0;

  // Contexts
  private pointer: PointerContext = new PointerContext();
  private selection: SelectionContext = new SelectionContext();

  // The "click" DOM event always reports button 0, so track the real
  // pointerdown button/position ourselves to detect genuine left clicks.
  private static readonly clickMovementThreshold = 4;
  private clickButton: PointerButton | null = null;
  private readonly clickStart: Point = new Point(0, 0);

  // Tracks hover position (independent of any button press) for paste anchoring.
  private readonly hoverPosition: Point = new Point(0, 0);
  private hasHovered = false;

  // Tempo/time-signature marker currently under the mouse in the header, if any.
  private hoveredHeaderMarker: {
    lane: "tempo" | "timeSignature";
    tick: number;
  } | null = null;
  private host: HTMLElement | null = null;
  private headerEditInput: HTMLInputElement | null = null;
  private headerDeleteButton: HTMLButtonElement | null = null;
  private editingMarkerKey: string | null = null;
  // Set right before an Escape-triggered blur so the blur handler skips its commit.
  private suppressNextEditCommit = false;

  // True while right-drag erase (scrubbing across notes) is active.
  private erasing = false;

  // True while left-drag resizing a note's (or selected notes') duration.
  private resizing = false;
  private resizeAnchor: PianoRollNote | null = null;
  private resizeAnchorInitialEnd = 0;
  private resizeTargets: { note: PianoRollNote; initialDuration: number }[] =
    [];
  // Last delta applied by updateResize(), used to check the final duration
  // against the minimum draw interval without re-deriving it from the track.
  private lastResizeDelta = 0;
  // Snapshot of the selection's stable note identities, restored via
  // remapSelection() after each resize step invalidates note object identity.
  private resizeSelectionKeep: Set<MidiChannelEvent> = new Set();

  // True while a left-drag started on empty space, which resizes a
  // freshly-created 1-tick note via the same resize state as above.
  private creating = false;
  // Left-click position on empty space, pending confirmation that the
  // pointer actually dragged before a note is created there.
  private pendingCreateStart: Point | null = null;

  // True while left-dragging a note's (or selected notes') body to move it.
  private moving = false;
  private moveAnchor: PianoRollNote | null = null;
  private moveAnchorInitialTick = 0;
  private moveAnchorInitialPitch = 0;
  private moveTargets: {
    note: PianoRollNote;
    initialTick: number;
    initialPitch: number;
  }[] = [];
  private moveSelectionKeep: Set<MidiChannelEvent> = new Set();

  private clipboard: {
    relativeTick: number;
    pitch: number;
    durationTicks: number;
    velocity: number;
  }[] = [];

  // Cached viewport size, used by focusSelection() to fit the camera.
  private lastWidth = 1;
  private lastHeight = 1;

  /** Notified whenever the camera's horizontal position or zoom changes. */
  private lastNotifiedCameraX: number | null = null;
  private lastNotifiedCameraH: number | null = null;

  public getPointerContext(): PointerContext {
    return this.pointer;
  }
  public getSelectionContext(): SelectionContext {
    return this.selection;
  }

  /** Absolute MIDI tick at the left edge of the visible piano roll. */
  public override getCameraTick(): number {
    return this.camera.x;
  }

  /** Number of MIDI ticks currently visible horizontally in the piano roll. */
  public override getVisibleTickSpan(): number {
    const viewWidth = Math.max(1, this.lastWidth - this.keyboardWidth);
    return this.tickAtScreenX(this.keyboardWidth + viewWidth) - this.camera.x;
  }

  public override setCameraTick(tick: number): void {
    this.camera.x = Math.max(0, tick);
    this.render();
  }

  public override setPlayheadTick(tick: number): void {
    this.playheadTick = tick;
    this.render();
  }

  public override async mount(host: HTMLElement): Promise<void> {
    await super.mount(host);

    // In React StrictMode a superseded/aborted mount leaves `canvas` unset;
    // skip attaching the edit input so we don't orphan a second copy of it.
    if (!this.canvas) {
      return;
    }

    this.host = host;
    this.createHeaderEditInput();
    this.createHeaderDeleteButton();
  }

  protected override onMounted(app: Application): void {
    app.stage.addChild(
      this.pitchRows,
      this.snapGrid,
      this.minorGrid,
      this.majorGrid,
      this.notes,
      this.keyboard,
      this.selectionBox,
      this.header,
      this.headerLabels,
      this.headerBoxes,
      this.cursor,
    );

    const canvas = app.view as HTMLCanvasElement;
    this.canvas = canvas;

    canvas.style.touchAction = "none";
    // Canvas elements aren't focusable (and won't receive keydown events)
    // unless they have a tabIndex and are explicitly focused.
    canvas.tabIndex = 0;
    canvas.addEventListener("keydown", this.handleKeyDown);
    canvas.addEventListener("click", this.handleClick);
    canvas.addEventListener("contextmenu", this.handleContextMenu);
    canvas.addEventListener("pointerdown", this.handlePointerDown);
    canvas.addEventListener("pointermove", this.handlePointerMove);
    canvas.addEventListener("pointerup", this.handlePointerUp);
    canvas.addEventListener("pointercancel", this.handlePointerUp);
    canvas.addEventListener("pointerleave", this.handlePointerLeave);
    window.addEventListener("pointerup", this.handlePointerUp);
    canvas.addEventListener("wheel", this.handleWheel, { passive: false });
    canvas.addEventListener("auxclick", this.handleAuxClick);
  }

  public override destroy(): void {
    if (this.canvas) {
      this.canvas.removeEventListener("keydown", this.handleKeyDown);
      this.canvas.removeEventListener("click", this.handleClick);
      this.canvas.removeEventListener("contextmenu", this.handleContextMenu);
      this.canvas.removeEventListener("pointerdown", this.handlePointerDown);
      this.canvas.removeEventListener("pointermove", this.handlePointerMove);
      this.canvas.removeEventListener("pointerup", this.handlePointerUp);
      this.canvas.removeEventListener("pointercancel", this.handlePointerUp);
      this.canvas.removeEventListener("pointerleave", this.handlePointerLeave);
      this.canvas.removeEventListener("wheel", this.handleWheel);
      this.canvas.removeEventListener("auxclick", this.handleAuxClick);
    }

    window.removeEventListener("pointerup", this.handlePointerUp);

    this.canvas = null;
    this.pointer.id = null;
    this.noteGeometryCache = null;
    this.clearMappedNotes();

    this.headerEditInput?.remove();
    this.headerEditInput = null;
    this.headerDeleteButton?.remove();
    this.headerDeleteButton = null;
    this.host = null;

    super.destroy();
  }

  protected override draw(app: Application): void {
    const width = app.screen.width;
    const height = app.screen.height;

    this.lastWidth = width;
    this.lastHeight = height;

    this.updateTempoCache();

    this.notes.clear();
    this.pitchRows.clear();
    this.snapGrid.clear();
    this.minorGrid.clear();
    this.majorGrid.clear();
    this.keyboard.clear();
    this.selectionBox.clear();
    this.header.clear();
    this.cursor.clear();

    this.drawPitchRows(width, height);
    this.drawGrid(width, height);
    this.drawNotes(width, height);
    this.drawKeyboard(height);
    this.drawSelectionBox();
    this.drawHeader(width);
    this.drawCursor(width, height);

    if (
      this.camera.x !== this.lastNotifiedCameraX ||
      this.camera.h !== this.lastNotifiedCameraH
    ) {
      this.lastNotifiedCameraX = this.camera.x;
      this.lastNotifiedCameraH = this.camera.h;
      this.onCameraChange?.();
    }
  }

  private updateTempoCache(): void {
    const midi = this.state.midi;

    if (midi === this.tempoCacheMidi) {
      return;
    }

    this.tempoCacheMidi = midi;
    this.tempoChanges = midi?.getTempoChanges() ?? [
      { tick: 0, microsecondsPerQuarterNote: 500_000 },
    ];
    this.timeSignatureChanges = midi?.getTimeSignatureChanges() ?? [
      { tick: 0, numerator: 4, denominator: 2 },
    ];
  }

  private readonly handleKeyDown = (event: KeyboardEvent) => {
    const key = event.key.toLowerCase();

    switch (key) {
      case "arrowup":
      case "arrowdown": {
        event.preventDefault();
        const direction = key === "arrowup" ? 1 : -1;
        // Shift moves by an octave instead of a semitone.
        this.transposeSelection(event.shiftKey ? direction * 12 : direction);
        return;
      }
      case "arrowleft":
      case "arrowright": {
        event.preventDefault();
        const direction = key === "arrowleft" ? -1 : 1;
        // 7.5 ticks (a 1/64 note) is the fallback step when snapping is off.
        const step = this.state.snap.enabled ? this.getSnapTicks() : 7.5;
        this.moveSelectionTicks(direction * step);
        return;
      }
      default:
        break;
    }

    if (event.ctrlKey || event.metaKey) {
      switch (key) {
        case "a": {
          event.preventDefault();
          this.selection.notes = this.mappedNotes;
          this.render();
          break;
        }
        case "d": {
          event.preventDefault();
          this.selection.clear();
          this.render();
          break;
        }
        default:
          break;
      }
      return;
    }

    switch (key) {
      case "c":
        event.preventDefault();
        this.copySelection();
        break;
      case "x":
        event.preventDefault();
        this.cutSelection();
        break;
      case "v":
        event.preventDefault();
        this.pasteClipboard();
        break;
      case "f":
        event.preventDefault();
        this.focusSelection();
        break;
      case "delete":
        event.preventDefault();
        this.deleteSelection();
        break;
      default:
        break;
    }
  };

  private readonly handleClick = (event: MouseEvent) => {
    const button = this.clickButton;
    this.clickButton = null;

    // Ignore clicks that didn't originate from a left button press, and
    // clicks that ended a drag (e.g. panning or box-selecting).
    if (button !== PointerButton.Left) {
      return;
    }
    const dx = this.pointer.position.x - this.clickStart.x;
    const dy = this.pointer.position.y - this.clickStart.y;
    if (Math.hypot(dx, dy) > PianoRollView.clickMovementThreshold) {
      return;
    }

    event.preventDefault();

    if (this.clickStart.y < HeaderHeight) {
      this.handleHeaderClick(this.clickStart);
      return;
    }

    const hit = this.hitTestNote(this.clickStart);
    if (hit) {
      this.selection.notes = [hit];
      this.render();
    }
  };

  private readonly handleContextMenu = (event: MouseEvent): void => {
    // Right-click drives marquee-select/erase; suppress the browser menu.
    event.preventDefault();
  };

  private readonly handlePointerDown = (event: PointerEvent): void => {
    if (event.button === PointerButton.None) {
      return;
    }

    event.preventDefault();

    this.pointer.id = event.pointerId;
    this.pointer.button =
      event.button !== PointerButton.None
        ? (event.button as PointerButton)
        : null;

    const local = this.toCanvasLocal(event.clientX, event.clientY);

    this.clickButton = this.pointer.button;
    this.clickStart.x = local.x;
    this.clickStart.y = local.y;

    // Ensure the canvas has focus so subsequent keydown events (e.g.
    // Ctrl+A / Ctrl+D) are dispatched to it.
    this.canvas?.focus();

    switch (this.pointer.button) {
      case PointerButton.Right: {
        if (local.y < HeaderHeight) {
          this.handleHeaderRightClick(local.x, local.y);
          break;
        }

        // Paint-delete only engages while Alt is held; a plain right-drag
        // is always a box-select.
        if (event.altKey) {
          this.erasing = true;
          const hit = this.hitTestNote(local);
          if (hit) {
            this.eraseNote(hit);
          }
        } else {
          this.erasing = false;
          this.selection.bounds = new Rectangle(local.x, local.y, 1, 1);
        }
        break;
      }
      case PointerButton.Left: {
        if (local.y >= HeaderHeight) {
          const edgeHit = this.hitTestNoteEdge(local);
          if (edgeHit) {
            this.beginResize(edgeHit);
            break;
          }

          const bodyHit = this.hitTestNote(local);
          if (bodyHit) {
            this.beginMove(bodyHit);
            break;
          }

          // Don't create a note yet; wait for a real drag (see
          // handlePointerMove/handlePointerUp) so a plain click just seeks.
          this.pendingCreateStart = new Point(local.x, local.y);
        }
        break;
      }
      default:
        break;
    }

    this.pointer.position.x = local.x;
    this.pointer.position.y = local.y;

    this.canvas?.setPointerCapture(event.pointerId);
  };

  private readonly handlePointerMove = (event: PointerEvent): void => {
    const local = this.toCanvasLocal(event.clientX, event.clientY);

    this.hoverPosition.x = local.x;
    this.hoverPosition.y = local.y;
    this.hasHovered = true;

    if (this.pointer.id === null || event.pointerId !== this.pointer.id) {
      if (this.canvas) {
        this.canvas.style.cursor = this.hitTestNoteEdge(local)
          ? "ew-resize"
          : this.hitTestNote(local)
            ? "move"
            : "";
      }
      this.updateHeaderHover(local);
      this.render();
      return;
    }

    const dx = local.x - this.pointer.position.x;
    const dy = local.y - this.pointer.position.y;

    this.pointer.position.x = local.x;
    this.pointer.position.y = local.y;

    switch (this.pointer.button) {
      case PointerButton.Right: {
        if (this.erasing) {
          const hit = this.hitTestNote(local);
          if (hit) {
            this.eraseNote(hit);
          }
        } else {
          this.updateSelection();
        }
        break;
      }
      case PointerButton.Left: {
        if (this.resizing) {
          this.updateResize(local);
        } else if (this.moving) {
          this.updateMove(local);
        } else if (this.pendingCreateStart) {
          const startDx = local.x - this.pendingCreateStart.x;
          const startDy = local.y - this.pendingCreateStart.y;
          if (
            Math.hypot(startDx, startDy) > PianoRollView.clickMovementThreshold
          ) {
            this.beginCreate(this.pendingCreateStart);
            this.pendingCreateStart = null;
            this.updateResize(local);
          }
        }
        break;
      }
      case PointerButton.Middle: {
        this.pan(dx, dy);
        break;
      }
      default:
        // if (this.pointer.position.y < HeaderHeight) {

        // }
        return;
    }

    this.updateHeaderHover(this.pointer.position);

    this.render();
  };

  private readonly handlePointerLeave = (event: PointerEvent): void => {
    // The edit input/delete button sit directly atop the marker they act on,
    // so moving onto either fires a canvas "pointerleave" with no mouse
    // position change; that's not really leaving the header, so don't
    // hide/clear on it.
    if (
      event.relatedTarget === this.headerEditInput ||
      event.relatedTarget === this.headerDeleteButton
    ) {
      return;
    }

    this.updateHeaderHover(null);
    this.render();
  };

  private readonly handlePointerUp = (event: PointerEvent): void => {
    if (this.pointer.id === null || event.pointerId !== this.pointer.id) {
      return;
    }

    if (this.canvas?.hasPointerCapture(event.pointerId)) {
      this.canvas.releasePointerCapture(event.pointerId);
    }

    this.pointer.id = null;
    this.pointer.button = null;
    this.erasing = false;

    // A plain click (no drag) never created a note; seek the playhead there.
    if (this.pendingCreateStart) {
      const tick = this.snapTickToNearest(
        this.tickAtScreenX(this.pendingCreateStart.x),
      );
      this.onSeekRequest?.(tick);
      this.pendingCreateStart = null;
    }

    // A drag that barely cleared the click threshold still gets the default
    // snap/quarter-note length, rather than being left at a sliver duration.
    if (this.creating && this.resizeTargets[0]) {
      const track = this.getSelectedTrack();
      const target = this.resizeTargets[0];
      const currentDuration = Math.max(
        1,
        target.initialDuration + this.lastResizeDelta,
      );
      const minDuration = Math.max(
        1,
        Math.round(
          this.state.snap.enabled ? this.getSnapTicks() : this.getPpqn(),
        ),
      );

      if (track && currentDuration < minDuration) {
        track.setNoteDuration(target.note.midiNote, minDuration);
        this.remapSelection(this.resizeSelectionKeep);
      }
    }

    this.creating = false;
    this.resizing = false;
    this.resizeAnchor = null;
    this.resizeTargets = [];
    this.lastResizeDelta = 0;
    this.resizeSelectionKeep = new Set();

    this.moving = false;
    this.moveAnchor = null;
    this.moveTargets = [];
    this.moveSelectionKeep = new Set();

    if (this.selection.bounds !== null) {
      this.selection.bounds = null;
    }
    this.render();
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
    const pos = new Point(mouseX, mouseY);
    const delta = new Point(-event.deltaX, -event.deltaY);

    const scrollGesture = getScrollGesture(event);
    switch (scrollGesture) {
      case "mouse-zoom":
        this.handleMouseScroll(event, pos);
        break;
      case "trackpad-pan":
        this.handleTrackPad(event, delta);
        break;
      case "trackpad-pinch":
        this.zoomAtCursor(this.getZoomFactor(-event.deltaY * 4), pos);
        break;
    }
  };

  private readonly handleMouseScroll = (
    event: WheelEvent,
    delta: Point,
  ): void => {
    if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) {
      this.zoomHorizontal(this.getZoomFactor(-event.deltaX), delta.x);
    } else {
      this.zoomVertical(
        this.getZoomFactor(-event.deltaY),
        delta.y - HeaderHeight,
      );
    }
  };

  private readonly handleTrackPad = (event: WheelEvent, delta: Point): void => {
    const zoomFactor = this.getZoomFactor(-delta.y);
    if (event.altKey) {
      this.zoomHorizontal(zoomFactor, delta.x);
    } else {
      this.pan(delta.x, delta.y);
      this.render();
    }
  };

  private getZoomFactor(value: number): number {
    return Math.exp(value * ZoomSensitivity);
  }

  protected override toScreenSpace(value: Point): Point;
  protected override toScreenSpace(value: Rectangle): Rectangle;
  protected override toScreenSpace(
    value: Point | Rectangle,
  ): Point | Rectangle {
    const cache = this.noteGeometryCache;
    if (!cache) {
      return value;
    }

    // Calculate coordinates once to avoid repeating code
    const screenX =
      value.x - this.timelineUnitsAtTick(this.camera.x) * this.camera.h;
    const screenY = value.y + this.camera.y * cache.rowHeight + HeaderHeight;

    if (value instanceof Point) {
      return new Point(screenX, screenY);
    }

    if (value instanceof Rectangle) {
      // Assuming your Rectangle constructor takes (x, y, width, height)
      return new Rectangle(screenX, screenY, value.width, value.height);
    }

    // Fallback for safety, though overloads prevent getting here
    return value;
  }

  private updateSelection() {
    if (this.selection.bounds === null) {
      return;
    }

    // Anchor to clickStart and re-derive bounds each time so the setter can
    // normalize negative width/height regardless of drag direction.
    this.selection.bounds = new Rectangle(
      this.clickStart.x,
      this.clickStart.y,
      this.pointer.position.x - this.clickStart.x,
      this.pointer.position.y - this.clickStart.y,
    );

    // Update note selection
    const cache = this.noteGeometryCache;
    cache?.geometry.forEach((geo) => {
      const worldRect = new Rectangle(geo.x, geo.y, geo.width, geo.height);
      const screenRect = this.toScreenSpace(worldRect);

      // Deselect notes
      if (!this.selection.intersects(screenRect)) {
        this.selection.delete(geo.note);
        return;
      }

      // Select notes
      this.selection.add(geo.note);
    });
  }

  private getSelectedTrack(): MidiTrack | null {
    const midi = this.state.midi;
    const trackIndex = this.state.selectedTrackIndex;

    if (!midi || trackIndex === null) {
      return null;
    }

    return midi.tracks[trackIndex] ?? null;
  }

  private hitTestNote(point: Point): PianoRollNote | null {
    const cache = this.noteGeometryCache;
    if (!cache) {
      return null;
    }

    // Iterate back-to-front so the topmost-drawn note wins on overlap.
    for (let index = cache.geometry.length - 1; index >= 0; index--) {
      const geo = cache.geometry[index];
      const screenRect = this.toScreenSpace(
        new Rectangle(geo.x, geo.y, geo.width, geo.height),
      );

      if (screenRect.contains(point.x, point.y)) {
        return geo.note;
      }
    }

    return null;
  }

  /**
   * Hit-tests the draggable strip along a note's right edge, used to start
   * a duration resize.
   */
  private hitTestNoteEdge(point: Point): PianoRollNote | null {
    const cache = this.noteGeometryCache;
    if (!cache) {
      return null;
    }

    for (let index = cache.geometry.length - 1; index >= 0; index--) {
      const geo = cache.geometry[index];
      const screenRect = this.toScreenSpace(
        new Rectangle(geo.x, geo.y, geo.width, geo.height),
      );

      if (
        point.y < screenRect.y ||
        point.y > screenRect.y + screenRect.height
      ) {
        continue;
      }

      const handleWidth = Math.min(NoteResizeHandleWidth, screenRect.width / 2);
      const edgeStart = screenRect.x + screenRect.width - handleWidth;
      const edgeEnd = screenRect.x + screenRect.width;

      if (point.x >= edgeStart && point.x <= edgeEnd) {
        return geo.note;
      }
    }

    return null;
  }

  private tickAtScreenX(x: number): number {
    const timelineMs =
      ticksToMs(this.camera.x, this.getPpqn(), this.tempoChanges) +
      ((x - this.keyboardWidth) / this.camera.h) * 500;

    return msToTicks(timelineMs, this.getPpqn(), this.tempoChanges);
  }

  private pitchAtScreenY(y: number): number {
    const pitch = Math.ceil(this.camera.y - (y - HeaderHeight) / this.camera.v);
    return clamp(pitch, 0, 127);
  }

  private getSnapTicks(): number {
    return (this.getPpqn() * 4) / this.state.snap.denominator;
  }

  private snapTick(tick: number): number {
    if (!this.state.snap.enabled) {
      return Math.max(0, Math.round(tick));
    }

    const ticksPerSnap = this.getSnapTicks();
    if (!Number.isFinite(ticksPerSnap) || ticksPerSnap <= 0) {
      return Math.max(0, Math.round(tick));
    }

    return Math.max(0, Math.floor(tick / ticksPerSnap) * ticksPerSnap);
  }

  /**
   * Snaps to the nearest grid increment (rather than flooring), used for
   * note-edge resizing so the resulting length snaps irrespective of the
   * note's original (possibly off-grid) end tick.
   */
  private snapTickToNearest(tick: number): number {
    if (!this.state.snap.enabled) {
      return Math.max(0, Math.round(tick));
    }

    const ticksPerSnap = this.getSnapTicks();
    if (!Number.isFinite(ticksPerSnap) || ticksPerSnap <= 0) {
      return Math.max(0, Math.round(tick));
    }

    return Math.max(0, Math.round(tick / ticksPerSnap) * ticksPerSnap);
  }

  /**
   * Begins a right-edge duration drag. If the grabbed note is part of the
   * current (multi-)selection, all selected notes resize together by the
   * same tick delta; otherwise only the grabbed note resizes.
   */
  private beginResize(anchor: PianoRollNote): void {
    const targets =
      this.selection.isSelected(anchor) && this.selection.size > 0
        ? this.selection.notes
        : [anchor];

    this.resizing = true;
    this.resizeAnchor = anchor;
    this.resizeAnchorInitialEnd = anchor.tick + anchor.durationTicks;
    this.resizeTargets = targets.map((note) => ({
      note,
      initialDuration: note.durationTicks,
    }));
    // Preserve the pre-drag selection identity; only the resize targets'
    // durations change, not which notes are selected.
    this.resizeSelectionKeep = new Set(
      this.selection.notes.map((note) => note.midiNote.noteOn),
    );
  }

  private updateResize(local: Point): void {
    const track = this.getSelectedTrack();
    if (!track || !this.resizeAnchor) {
      return;
    }

    const snappedEnd = this.snapTickToNearest(this.tickAtScreenX(local.x));
    const newAnchorEnd = Math.max(this.resizeAnchor.tick + 1, snappedEnd);
    const delta = newAnchorEnd - this.resizeAnchorInitialEnd;
    this.lastResizeDelta = delta;

    for (const { note, initialDuration } of this.resizeTargets) {
      const newDuration = Math.max(1, initialDuration + delta);
      track.setNoteDuration(note.midiNote, newDuration);
    }

    this.remapSelection(this.resizeSelectionKeep);
    this.render();
  }

  /**
   * Begins dragging the body of a note (or, if it's part of the current
   * selection, the whole selection) to a new tick/pitch.
   */
  private beginMove(anchor: PianoRollNote): void {
    if (!this.selection.isSelected(anchor) || this.selection.size === 0) {
      this.selection.notes = [anchor];
    }

    const targets = this.selection.notes;

    this.moving = true;
    this.moveAnchor = anchor;
    this.moveAnchorInitialTick = anchor.tick;
    this.moveAnchorInitialPitch = anchor.pitch;
    this.moveTargets = targets.map((note) => ({
      note,
      initialTick: note.tick,
      initialPitch: note.pitch,
    }));
    this.moveSelectionKeep = new Set(
      this.selection.notes.map((note) => note.midiNote.noteOn),
    );
  }

  private updateMove(local: Point): void {
    const track = this.getSelectedTrack();
    if (!track || !this.moveAnchor) {
      return;
    }

    const newAnchorTick = this.snapTick(this.tickAtScreenX(local.x));
    const newAnchorPitch = this.pitchAtScreenY(local.y);
    const tickDelta = newAnchorTick - this.moveAnchorInitialTick;
    const pitchDelta = newAnchorPitch - this.moveAnchorInitialPitch;

    for (const { note, initialTick, initialPitch } of this.moveTargets) {
      track.setNoteStart(note.midiNote, Math.max(0, initialTick + tickDelta));
      track.setNotePitch(
        note.midiNote,
        clamp(initialPitch + pitchDelta, 0, 127),
      );
    }

    this.remapSelection(this.moveSelectionKeep);
    this.render();
  }

  /**
   * Re-derives the current selection after a mutation invalidates note
   * identity, matching by each note's stable NoteOn event reference.
   */
  private remapSelection(keep: Set<MidiChannelEvent>): void {
    const midi = this.state.midi;
    const trackIndex = this.state.selectedTrackIndex;

    if (!midi || trackIndex === null || keep.size === 0) {
      this.selection.clear();
      return;
    }

    const notes = this.getTrackNotes(midi, trackIndex);
    this.selection.notes = notes.filter((note) =>
      keep.has(note.midiNote.noteOn),
    );
  }

  /**
   * Starts a note as a 1-tick stub and hands it off to the resize state so
   * dragging out from the click point extends its length live.
   */
  private beginCreate(local: Point): void {
    const track = this.getSelectedTrack();
    if (!track) {
      return;
    }

    const pitch = this.pitchAtScreenY(local.y);
    const tick = this.snapTick(this.tickAtScreenX(local.x));

    const insertAt = track.getInsertionIndexAt(tick);
    const startDelta = tick - track.getAbsoluteTickAt(insertAt);

    const { noteOn } = track.addNote(pitch, startDelta, 100, 1, insertAt);
    this.notifyNotesChanged();

    this.remapSelection(new Set([noteOn]));

    const anchor = this.selection.notes[0];
    if (!anchor) {
      return;
    }

    this.creating = true;
    this.resizing = true;
    this.resizeAnchor = anchor;
    this.resizeAnchorInitialEnd = anchor.tick + anchor.durationTicks;
    this.resizeTargets = [
      { note: anchor, initialDuration: anchor.durationTicks },
    ];
    this.resizeSelectionKeep = new Set([noteOn]);

    this.render();
  }

  private eraseNote(note: PianoRollNote): void {
    const track = this.getSelectedTrack();
    if (!track) {
      return;
    }

    const keep = new Set(
      this.selection.notes
        .filter((selected) => selected !== note)
        .map((selected) => selected.midiNote.noteOn),
    );

    track.removeNote(note.midiNote.noteOn, note.midiNote.noteOff);
    this.notifyNotesChanged();

    this.remapSelection(keep);
    this.render();
  }

  private deleteSelection(): void {
    const track = this.getSelectedTrack();
    if (!track || this.selection.size === 0) {
      return;
    }

    for (const note of this.selection.notes) {
      track.removeNote(note.midiNote.noteOn, note.midiNote.noteOff);
    }
    this.notifyNotesChanged();

    this.selection.clear();
    this.render();
  }

  private transposeSelection(semitones: number): void {
    const track = this.getSelectedTrack();
    if (!track || this.selection.size === 0) {
      return;
    }

    const keep = new Set(
      this.selection.notes.map((note) => note.midiNote.noteOn),
    );

    for (const note of this.selection.notes) {
      track.setNotePitch(note.midiNote, clamp(note.pitch + semitones, 0, 127));
    }

    this.remapSelection(keep);
    this.render();
  }

  private moveSelectionTicks(deltaTicks: number): void {
    const track = this.getSelectedTrack();
    if (!track || this.selection.size === 0) {
      return;
    }

    const keep = new Set(
      this.selection.notes.map((note) => note.midiNote.noteOn),
    );

    for (const note of this.selection.notes) {
      track.setNoteStart(
        note.midiNote,
        Math.max(0, Math.round(note.tick + deltaTicks)),
      );
    }

    this.remapSelection(keep);
    this.render();
  }

  private copySelection(): void {
    if (this.selection.size === 0) {
      return;
    }

    const notes = this.selection.notes;
    const minTick = Math.min(...notes.map((note) => note.tick));

    this.clipboard = notes.map((note) => ({
      relativeTick: note.tick - minTick,
      pitch: note.pitch,
      durationTicks: note.durationTicks,
      velocity: note.velocity,
    }));
  }

  private cutSelection(): void {
    const track = this.getSelectedTrack();
    if (!track || this.selection.size === 0) {
      return;
    }

    this.copySelection();

    for (const note of this.selection.notes) {
      track.removeNote(note.midiNote.noteOn, note.midiNote.noteOff);
    }
    this.notifyNotesChanged();

    this.remapSelection(new Set());
    this.render();
  }

  private pasteClipboard(): void {
    const track = this.getSelectedTrack();
    if (!track || this.clipboard.length === 0) {
      return;
    }

    const anchorX = this.hasHovered ? this.hoverPosition.x : this.keyboardWidth;
    const anchorTick = this.snapTick(this.tickAtScreenX(anchorX));

    const pastedNoteOns = new Set<MidiChannelEvent>();

    for (const entry of this.clipboard) {
      const tick = Math.max(0, anchorTick + entry.relativeTick);
      const insertAt = track.getInsertionIndexAt(tick);
      const startDelta = tick - track.getAbsoluteTickAt(insertAt);

      const { noteOn } = track.addNote(
        entry.pitch,
        startDelta,
        entry.velocity,
        entry.durationTicks,
        insertAt,
      );

      pastedNoteOns.add(noteOn);
    }
    this.notifyNotesChanged();

    this.remapSelection(pastedNoteOns);
    this.render();
  }

  private focusSelection(): void {
    if (this.selection.size === 0) {
      return;
    }

    const notes = this.selection.notes;
    const minTick = Math.min(...notes.map((note) => note.tick));
    const maxTick = Math.max(
      ...notes.map((note) => note.tick + note.durationTicks),
    );
    const minPitch = Math.min(...notes.map((note) => note.pitch));
    const maxPitch = Math.max(...notes.map((note) => note.pitch));

    const viewWidth = Math.max(1, this.lastWidth - this.keyboardWidth);
    const viewHeight = Math.max(1, this.lastHeight - HeaderHeight);

    // Pad the fitted range so notes aren't flush against the viewport edges.
    const padding = 1.2;
    const pitchSpan = Math.max(1, maxPitch - minPitch + 1) * padding;

    const selectionStartMs = ticksToMs(
      minTick,
      this.getPpqn(),
      this.tempoChanges,
    );
    const selectionEndMs = ticksToMs(
      maxTick,
      this.getPpqn(),
      this.tempoChanges,
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
        this.getPpqn(),
        this.tempoChanges,
      ),
    );
    this.camera.y = clamp(
      maxPitch + 1 + (viewHeight / this.camera.v - pitchSpan) / 2,
      0,
      127,
    );

    this.render();
  }

  private headerLaneAt(y: number): "tempo" | "timeSignature" | null {
    if (y < 0 || y >= HeaderHeight) {
      return null;
    }

    return y < HeaderTempoLaneHeight ? "tempo" : "timeSignature";
  }

  private effectiveTempoAt(tick: number): number {
    let value = this.tempoChanges[0]?.microsecondsPerQuarterNote ?? 500_000;

    for (const change of this.tempoChanges) {
      if (change.tick > tick) {
        break;
      }
      value = change.microsecondsPerQuarterNote;
    }

    return value;
  }

  private effectiveTimeSignatureAt(tick: number): {
    numerator: number;
    denominator: number;
  } {
    let value = this.timeSignatureChanges[0] ?? {
      numerator: 4,
      denominator: 2,
    };

    for (const change of this.timeSignatureChanges) {
      if (change.tick > tick) {
        break;
      }
      value = change;
    }

    return { numerator: value.numerator, denominator: value.denominator };
  }

  private findTempoMarkerNear(x: number): TempoChange | null {
    let closest: TempoChange | null = null;
    let closestDistance = Infinity;

    for (const change of this.tempoChanges) {
      const markerX = this.screenXForTick(change.tick);

      // Hit-test the marker's whole label, not just its exact tick pixel,
      // since the label text is drawn to the right of that point.
      if (
        x < markerX - HeaderMarkerHitRadius ||
        x > markerX + HeaderMarkerLabelWidth
      ) {
        continue;
      }

      const distance = Math.abs(markerX - x);

      if (distance < closestDistance) {
        closest = change;
        closestDistance = distance;
      }
    }

    return closest;
  }

  private findTimeSignatureMarkerNear(x: number): TimeSignatureChange | null {
    let closest: TimeSignatureChange | null = null;
    let closestDistance = Infinity;

    for (const change of this.timeSignatureChanges) {
      const markerX = this.screenXForTick(change.tick);

      if (
        x < markerX - HeaderMarkerHitRadius ||
        x > markerX + HeaderMarkerLabelWidth
      ) {
        continue;
      }

      const distance = Math.abs(markerX - x);

      if (distance < closestDistance) {
        closest = change;
        closestDistance = distance;
      }
    }

    return closest;
  }

  private updateHeaderHover(local: Point | null): void {
    const midi = this.state.midi;
    const lane = local ? this.headerLaneAt(local.y) : null;

    const marker =
      midi && lane
        ? lane === "tempo"
          ? this.findTempoMarkerNear(local!.x)
          : this.findTimeSignatureMarkerNear(local!.x)
        : null;

    this.hoveredHeaderMarker = marker
      ? { lane: lane!, tick: marker.tick }
      : null;

    this.syncHeaderEditControls();
  }

  private createHeaderEditInput(): void {
    if (!this.host || this.headerEditInput) {
      return;
    }

    const input = document.createElement("input");
    input.type = "text";
    input.className = "piano-roll-header-input";
    input.style.display = "none";

    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        input.blur();
      } else if (event.key === "Escape") {
        this.suppressNextEditCommit = true;
        input.blur();
      }
    });

    input.addEventListener("blur", () => {
      if (this.suppressNextEditCommit) {
        this.suppressNextEditCommit = false;
      } else {
        this.commitHeaderEditInput(input.value);
      }

      this.syncHeaderEditControls();
    });

    this.host.appendChild(input);
    this.headerEditInput = input;
  }

  private createHeaderDeleteButton(): void {
    if (!this.host || this.headerDeleteButton) {
      return;
    }

    const button = document.createElement("button");
    button.type = "button";
    button.className = "piano-roll-header-delete";
    button.textContent = "\u00d7";
    button.style.display = "none";

    // Prevent the delete button from stealing focus (and thus blurring the
    // edit input, which would commit before this click can delete it).
    button.addEventListener("mousedown", (event) => event.preventDefault());
    button.addEventListener("click", () => this.deleteHoveredMarker());

    this.host.appendChild(button);
    this.headerDeleteButton = button;
  }

  private deleteHoveredMarker(): void {
    const midi = this.state.midi;
    const marker = this.hoveredHeaderMarker;

    if (!midi || !marker) {
      return;
    }

    switch (marker.lane) {
      case "tempo":
        midi.removeTempoChangeAt(marker.tick);
        break;
      case "timeSignature":
        midi.removeTimeSignatureChangeAt(marker.tick);
        break;
    }

    this.hoveredHeaderMarker = null;
    this.tempoCacheMidi = null;
    this.syncHeaderEditControls();
    this.render();
  }

  private commitHeaderEditInput(raw: string): void {
    const marker = this.hoveredHeaderMarker;

    if (!marker) {
      return;
    }

    if (marker.lane === "tempo") {
      this.commitTempoEdit(marker.tick, raw);
    } else {
      this.commitTimeSignatureEdit(marker.tick, raw);
    }
  }

  private formatHeaderMarkerValue(marker: {
    lane: "tempo" | "timeSignature";
    tick: number;
  }): string {
    if (marker.lane === "tempo") {
      const change = this.tempoChanges.find((c) => c.tick === marker.tick);
      return change
        ? String(Math.round(60_000_000 / change.microsecondsPerQuarterNote))
        : "";
    }

    const change = this.timeSignatureChanges.find(
      (c) => c.tick === marker.tick,
    );
    return change ? `${change.numerator}/${2 ** change.denominator}` : "";
  }

  private syncHeaderEditControls(): void {
    const input = this.headerEditInput;
    const deleteButton = this.headerDeleteButton;

    if (!input || !deleteButton) {
      return;
    }

    const marker = this.hoveredHeaderMarker;
    const focused = document.activeElement === input;

    if (!marker) {
      if (!focused) {
        input.style.display = "none";
        deleteButton.style.display = "none";
        this.editingMarkerKey = null;
      }
      return;
    }

    const x = this.screenXForTick(marker.tick);
    const y = marker.lane === "tempo" ? 2 : HeaderTempoLaneHeight + 2;
    const inputWidth = input.getBoundingClientRect().width || 48;

    input.style.left = `${x}px`;
    input.style.top = `${y}px`;
    input.style.display = "block";

    deleteButton.style.left = `${x + inputWidth + 2}px`;
    deleteButton.style.top = `${y}px`;
    deleteButton.style.display = "block";

    const key = `${marker.lane}:${marker.tick}`;
    if (key !== this.editingMarkerKey) {
      this.editingMarkerKey = key;
      input.value = this.formatHeaderMarkerValue(marker);
    }
  }

  private handleHeaderClick(p: Point): void {
    const midi = this.state.midi;
    const lane = this.headerLaneAt(p.y);

    if (!midi || !lane) {
      return;
    }

    // Clicking an existing marker edits it via the hover input rather than
    // stacking a duplicate marker on top of it.
    const existing =
      lane === "tempo"
        ? this.findTempoMarkerNear(p.x)
        : this.findTimeSignatureMarkerNear(p.x);

    if (existing) {
      return;
    }

    const tick = this.snapTick(this.tickAtScreenX(p.x));

    if (lane === "tempo") {
      midi.addTempoChange(tick, this.effectiveTempoAt(tick));
    } else {
      const current = this.effectiveTimeSignatureAt(tick);
      midi.addTimeSignatureChange(tick, current.numerator, current.denominator);
    }

    this.tempoCacheMidi = null;
    // this.syncHeaderEditControls();
    this.render();
  }

  private handleHeaderRightClick(x: number, y: number): void {
    const midi = this.state.midi;
    const lane = this.headerLaneAt(y);

    if (!midi || !lane) {
      return;
    }

    if (lane === "tempo") {
      const marker = this.findTempoMarkerNear(x);
      if (marker) {
        midi.removeTempoChangeAt(marker.tick);
      }
    } else {
      const marker = this.findTimeSignatureMarkerNear(x);
      if (marker) {
        midi.removeTimeSignatureChangeAt(marker.tick);
      }
    }

    this.tempoCacheMidi = null;
    this.render();
  }

  private commitTempoEdit(tick: number, raw: string): void {
    const midi = this.state.midi;
    const parsed = Number(raw);

    if (!midi || !Number.isFinite(parsed) || parsed <= 0) {
      return;
    }

    midi.removeTempoChangeAt(tick);
    midi.addTempoChange(tick, Math.round(60_000_000 / parsed));

    this.tempoCacheMidi = null;
    this.render();
  }

  private commitTimeSignatureEdit(tick: number, raw: string): void {
    const midi = this.state.midi;
    const match = /^(\d+)\s*\/\s*(\d+)$/.exec(raw.trim());

    if (!midi || !match) {
      return;
    }

    const numerator = Number(match[1]);
    const denominatorValue = Number(match[2]);
    const denominator = Math.round(Math.log2(denominatorValue));

    if (
      !Number.isInteger(numerator) ||
      numerator <= 0 ||
      2 ** denominator !== denominatorValue
    ) {
      return;
    }

    midi.removeTimeSignatureChangeAt(tick);
    midi.addTimeSignatureChange(tick, numerator, denominator);

    this.tempoCacheMidi = null;
    this.render();
  }

  private pan(dx: number, dy: number): void {
    const cameraMs = ticksToMs(
      this.camera.x,
      this.getPpqn(),
      this.tempoChanges,
    );
    this.camera.x = msToTicks(
      cameraMs - (dx / this.camera.h) * 500,
      this.getPpqn(),
      this.tempoChanges,
    );
    this.camera.y += dy / this.camera.v;
    this.camera.x = Math.max(0, this.camera.x);
    this.camera.y = clamp(this.camera.y, 0, 127);
  }

  private zoomHorizontal(zoomFactor: number, mouseX: number): void {
    const rollX = mouseX - this.keyboardWidth;

    const anchorX = Math.max(0, rollX);
    const anchorTick = this.tickAtScreenX(this.keyboardWidth + anchorX);
    const anchorMs = ticksToMs(anchorTick, this.getPpqn(), this.tempoChanges);
    this.camera.h = clamp(
      this.camera.h * zoomFactor,
      MinimumPixelsPerQuarter,
      MaximumPixelsPerQuarter,
    );

    this.camera.x = Math.max(
      0,
      msToTicks(
        anchorMs - (anchorX / this.camera.h) * 500,
        this.getPpqn(),
        this.tempoChanges,
      ),
    );
    this.render();
  }

  private zoomAtCursor(zoomFactor: number, cursor: Point): void {
    const rollX = cursor.x - this.keyboardWidth;
    const anchorX = Math.max(0, rollX);
    const anchorY = cursor.y - HeaderHeight;
    const oldPixelsPerSemitone = this.camera.v;
    const anchorPitch = this.camera.y - anchorY / oldPixelsPerSemitone;
    const anchorTick = this.tickAtScreenX(this.keyboardWidth + anchorX);
    const anchorMs = ticksToMs(anchorTick, this.getPpqn(), this.tempoChanges);

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
        this.getPpqn(),
        this.tempoChanges,
      ),
    );
    this.camera.y = clamp(anchorPitch + anchorY / this.camera.v, 0, 127);
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

  private timelineUnitsAtTick(tick: number): number {
    return ticksToMs(tick, this.getPpqn(), this.tempoChanges) / 500;
  }

  private screenXForTick(tick: number): number {
    return (
      this.keyboardWidth +
      (this.timelineUnitsAtTick(tick) -
        this.timelineUnitsAtTick(this.camera.x)) *
        this.camera.h
    );
  }

  private toCanvasLocal(clientX: number, clientY: number): Point {
    if (!this.canvas) {
      return new Point(clientX, clientY);
    }

    const bounds = this.canvas.getBoundingClientRect();
    return new Point(clientX - bounds.left, clientY - bounds.top);
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
        midiNote: n,
      };
    });
    this.mappedNotesIndex = buildNoteIndex(this.mappedNotes);

    return this.mappedNotes;
  }

  private drawPitchRows(width: number, height: number): void {
    const rowHeight = this.camera.v;
    const rollHeight = Math.max(0, height - HeaderHeight);
    const firstPitch = Math.ceil(this.camera.y);
    const topOffset = (this.camera.y - firstPitch) * rowHeight;
    const rowCount = Math.ceil(rollHeight / rowHeight) + 2;

    for (let row = 0; row < rowCount; row++) {
      const pitch = firstPitch - row;

      if (pitch < 0 || pitch > 127) {
        continue;
      }

      const pitchClass = ((pitch % 12) + 12) % 12;
      const isBlackKey = BlackPitchClasses.has(pitchClass);
      const y = HeaderHeight + topOffset + row * rowHeight;

      this.pitchRows.beginFill(isBlackKey ? 0x181818 : 0x202020);
      this.pitchRows.drawRect(
        this.keyboardWidth,
        y,
        Math.max(0, width - this.keyboardWidth),
        rowHeight,
      );
      this.pitchRows.endFill();
    }
  }

  private drawKeyboard(height: number): void {
    const rowHeight = this.camera.v;
    const rollHeight = Math.max(0, height - HeaderHeight);
    const firstPitch = Math.ceil(this.camera.y);
    const topOffset = (this.camera.y - firstPitch) * rowHeight;
    const rowCount = Math.ceil(rollHeight / rowHeight) + 2;

    this.keyboard.beginFill(0xd6d6d6);
    this.keyboard.drawRect(0, HeaderHeight, this.keyboardWidth, rollHeight);
    this.keyboard.endFill();

    for (let row = 0; row < rowCount; row++) {
      const pitch = firstPitch - row;

      if (pitch < 0 || pitch > 127) {
        continue;
      }

      const pitchClass = ((pitch % 12) + 12) % 12;
      const isBlackKey = BlackPitchClasses.has(pitchClass);
      const y = HeaderHeight + topOffset + row * rowHeight;

      if (isBlackKey) {
        this.keyboard.beginFill(0x272727);
        this.keyboard.drawRect(0, y, this.keyboardWidth * 0.65, rowHeight);
        this.keyboard.endFill();
      }

      this.keyboard
        .moveTo(0, y + rowHeight)
        .lineTo(this.keyboardWidth, y + rowHeight);
    }

    this.keyboard.lineStyle(1, 0x555555);

    this.keyboard
      .moveTo(this.keyboardWidth, HeaderHeight)
      .lineTo(this.keyboardWidth, height);
    this.keyboard.lineStyle(1, 0x777777);
  }

  private drawGrid(width: number, height: number): void {
    this.minorGrid.lineStyle(1, 0x353535);
    this.majorGrid.lineStyle(2, 0x555555);

    const rowHeight = this.camera.v;
    const firstPitch = Math.ceil(this.camera.y);
    const topOffset = (this.camera.y - firstPitch) * rowHeight;

    for (
      let y = HeaderHeight + topOffset;
      y <= height + rowHeight;
      y += rowHeight
    ) {
      this.minorGrid.moveTo(this.keyboardWidth, y).lineTo(width, y);
    }

    const visibleWidth = Math.max(0, width - this.keyboardWidth);
    const visibleStart = this.camera.x;
    const visibleEnd = msToTicks(
      ticksToMs(visibleStart, this.getPpqn(), this.tempoChanges) +
        (visibleWidth / this.camera.h) * 500,
      this.getPpqn(),
      this.tempoChanges,
    );

    this.drawSnapGrid(height, visibleStart, visibleEnd);

    for (const { tick, isMeasure } of this.iterateGridBeats(
      visibleStart,
      visibleEnd,
    )) {
      const x = this.screenXForTick(tick);
      const target = isMeasure ? this.majorGrid : this.minorGrid;

      target.moveTo(x, HeaderHeight).lineTo(x, height);
    }
  }

  /**
   * Draws vertical guide lines at the current snap interval so the grid
   * visually reflects whatever denominator is selected (when snap is on).
   */
  private drawSnapGrid(
    height: number,
    visibleStart: number,
    visibleEnd: number,
  ): void {
    if (!this.state.snap.enabled) {
      return;
    }

    const ticksPerSnap = this.getSnapTicks();
    if (!Number.isFinite(ticksPerSnap) || ticksPerSnap <= 0) {
      return;
    }

    // Skip when lines would be too dense to read.
    this.snapGrid.lineStyle(1, 0x2a2a2a);

    const firstTick = Math.floor(visibleStart / ticksPerSnap) * ticksPerSnap;

    for (let tick = firstTick; tick <= visibleEnd; tick += ticksPerSnap) {
      const x = this.screenXForTick(tick);

      this.snapGrid.moveTo(x, HeaderHeight).lineTo(x, height);
    }
  }

  /**
   * Walks bar/beat positions across the visible tick range, honoring each
   * time-signature segment's beat length (ppqn * 4 / denominator) and
   * measure length (numerator beats) instead of assuming a fixed 4/4 grid.
   */
  private *iterateGridBeats(
    startTick: number,
    endTick: number,
  ): Generator<{ tick: number; isMeasure: boolean }> {
    const ppqn = this.getPpqn();
    const segments = this.timeSignatureChanges;

    for (let index = 0; index < segments.length; index++) {
      const segment = segments[index];
      const segmentEnd =
        index + 1 < segments.length ? segments[index + 1].tick : Infinity;

      if (segmentEnd <= startTick || segment.tick >= endTick) {
        continue;
      }

      const beatTicks = (ppqn * 4) / 2 ** segment.denominator;

      if (!Number.isFinite(beatTicks) || beatTicks <= 0) {
        continue;
      }

      const rangeStart = Math.max(segment.tick, startTick - beatTicks);
      const rangeEnd = Math.min(segmentEnd, endTick + beatTicks);
      const firstBeat = Math.floor((rangeStart - segment.tick) / beatTicks);

      for (let beat = firstBeat; ; beat++) {
        const tick = segment.tick + beat * beatTicks;

        if (tick > rangeEnd) {
          break;
        }

        yield { tick, isMeasure: beat % segment.numerator === 0 };
      }
    }
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

    const notes = this.getTrackNotes(
      this.state.midi,
      this.state.selectedTrackIndex,
    );

    // Do we need to rebuild note geometry?
    const needsRebuild = this.needsRebuild(
      track,
      notes,
      tickWidth,
      rowHeight,
      width,
      height,
    );
    if (needsRebuild) {
      this.rebuildNoteGeometry(
        track,
        notes,
        tickWidth,
        rowHeight,
        width,
        height,
        h,
      );
    }

    // Render each note. Avoid a per-note Set lookup when the selection is
    // empty or covers every note (e.g. after Ctrl+A) since panning/zooming
    // re-runs this loop on every frame.
    const selectionSize = this.selection.size;
    const allSelected = selectionSize > 0 && selectionSize >= notes.length;
    const noneSelected = selectionSize === 0;

    this.noteGeometryCache?.geometry?.forEach((n) => {
      const isSelected = allSelected
        ? true
        : noneSelected
          ? false
          : this.selection.isSelected(n.note);
      this.notes.lineStyle(noteStrokeColor.width, noteStrokeColor.color);
      this.notes.beginFill(isSelected ? noteSelectedColor : noteColor);
      this.notes.drawRoundedRect(n.x, n.y + 1, n.width, n.height, n.radius);
      this.notes.endFill();
    });

    this.notes.position.set(
      -this.timelineUnitsAtTick(this.camera.x) * this.camera.h,
      this.camera.y * rowHeight + HeaderHeight,
    );
  }

  private drawSelectionBox() {
    if (this.selection.isSelecting) {
      this.selectionBox.beginFill(0xffffff, 0.5);
      this.selectionBox.drawRect(
        this.selection.bounds!.x,
        this.selection.bounds!.y,
        this.selection.bounds!.width,
        this.selection.bounds!.height,
      );
      this.selectionBox.endFill();
    }
  }

  private drawHeader(width: number): void {
    // Draw the main header rect
    this.header.beginFill(0x1c1c1c);
    this.header.drawRect(0, 0, width, HeaderTempoLaneHeight);
    this.header.endFill();
    this.header.beginFill(0x181818);
    this.header.drawRect(
      0,
      HeaderTempoLaneHeight,
      width,
      HeaderHeight - HeaderTempoLaneHeight,
    );
    this.header.endFill();
    this.header.lineStyle(1, 0x3a3a3a);
    this.header
      .moveTo(0, HeaderTempoLaneHeight)
      .lineTo(width, HeaderTempoLaneHeight);
    this.header.lineStyle(1, 0x555555);
    this.header.moveTo(0, HeaderHeight).lineTo(width, HeaderHeight);

    // Compute visible range
    const visibleWidth = Math.max(0, width - this.keyboardWidth);
    const visibleStart = this.camera.x;
    const visibleEnd = msToTicks(
      ticksToMs(visibleStart, this.getPpqn(), this.tempoChanges) +
        (visibleWidth / this.camera.h) * 500,
      this.getPpqn(),
      this.tempoChanges,
    );

    const inView = (change: { tick: number }) =>
      change.tick >= visibleStart && change.tick <= visibleEnd;

    // Filter markers to visible range
    const tempoMarkers = this.tempoChanges.filter(inView);
    const timeSignatureMarkers = this.timeSignatureChanges.filter(inView);

    this.headerBoxes.removeChildren();

    // Draw tempo markers and text
    this.drawMarkers(
      "tempo",
      this.tempoLabelPool,
      tempoMarkers,
      2,
      (change) =>
        `\u266a=${Math.round(60_000_000 / change.microsecondsPerQuarterNote)}`,
    );
    this.drawMarkers(
      "timeSignature",
      this.timeSignatureLabelPool,
      timeSignatureMarkers,
      HeaderTempoLaneHeight + 2,
      (change) => `${change.numerator}/${2 ** change.denominator}`,
    );
  }

  /**
   * Positions pooled Text labels at each change's tick, reusing existing
   * Text instances (rather than recreating them) to avoid per-frame churn.
   */
  private drawMarkers<T extends { tick: number }>(
    lane: "tempo" | "timeSignature",
    pool: Text[],
    changes: T[],
    y: number,
    formatText: (change: T) => string,
  ): void {
    changes.forEach((change, index) => {
      let label = pool[index];

      if (!label) {
        label = new Text("", { fill: 0xcccccc, fontSize: 11 });
        pool[index] = label;
        this.headerLabels.addChild(label);
      }

      const x = this.screenXForTick(change.tick);

      const isHovered =
        this.hoveredHeaderMarker?.lane === lane &&
        this.hoveredHeaderMarker.tick === change.tick;

      if (isHovered) {
        const highlight = new Graphics();
        highlight.beginFill(0xff0000, 0.3);
        highlight.drawRect(
          x,
          y,
          HeaderMarkerLabelWidth,
          HeaderMarkerLabelHeight,
        );
        highlight.endFill();
        this.headerBoxes.addChild(highlight);
      }

      label.text = formatText(change);
      label.position.set(x + 3, y);
      label.visible = x >= this.keyboardWidth;
    });

    for (let index = changes.length; index < pool.length; index++) {
      pool[index].visible = false;
    }
  }

  drawCursor(width: number, height: number) {
    const x = this.screenXForTick(this.playheadTick);
    if (x < this.keyboardWidth || x >= width) {
      return;
    }

    this.cursor.lineStyle(2, 0xff0000).moveTo(x, 0).lineTo(x, height);
  }

  private clearMappedNotes(): void {
    this.mappedNotesTrack = null;
    this.mappedNotesSource = null;
    this.mappedNotes = [];
    this.mappedNotesIndex = null;
  }

  private notifyNotesChanged(): void {
    this.onNotesChanged?.();
  }

  private needsRebuild(
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
      cache.notes !== notes ||
      cache.tempoChanges !== this.tempoChanges ||
      cache.tickWidth !== tickWidth ||
      cache.rowHeight !== rowHeight ||
      cache.width !== width ||
      cache.height !== height
    ) {
      return true;
    }

    const verticalRange = height / rowHeight;
    const visibleEnd = this.tickAtScreenX(width);

    return !(
      this.camera.x >= cache.startTick &&
      visibleEnd <= cache.endTick &&
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
  ): void {
    const verticalRange = height / rowHeight;
    const visibleWidth = Math.max(0, width - this.keyboardWidth);
    const startTick = Math.max(
      0,
      this.tickAtScreenX(this.keyboardWidth - visibleWidth),
    );
    const endTick = this.tickAtScreenX(this.keyboardWidth + visibleWidth * 2);
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

    const geometry: NoteGeometry[] = [];
    for (let index = visibleRange.start; index < visibleRange.end; index++) {
      const note = notes[index];

      if (note.pitch < minPitch || note.pitch > maxPitch) {
        continue;
      }

      const x =
        this.keyboardWidth +
        this.timelineUnitsAtTick(note.tick) * this.camera.h;
      const y = -note.pitch * rowHeight;
      const noteWidth = Math.max(
        2,
        this.screenXForTick(note.tick + note.durationTicks) -
          this.screenXForTick(note.tick),
      );

      geometry.push({
        x,
        y,
        width: noteWidth,
        height: noteHeight,
        radius,
        note,
      });
    }

    this.noteGeometryCache = {
      track,
      notes: notes,
      tempoChanges: this.tempoChanges,
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
}
