import { Box2, Vector2 } from "three";
import { getScrollGesture } from "../../../util/scroll";
import { HeaderHeight } from "./constants";
import type { CoordinateSystem } from "./coordinates";
import type { HeaderController } from "./header";
import type { NoteEditingController } from "./editing/controller";
import { screenRectOf, type NoteGeometryCache } from "./noteGeometry";
import { PointerButton } from "./pointer";
import type { PianoRollContext, PianoRollNote } from "./types";

/** Registers one listener on the canvas; implemented for add and remove. */
type ListenerRegistrar = <K extends keyof HTMLElementEventMap>(
  type: K,
  listener: (event: HTMLElementEventMap[K]) => void,
  options?: AddEventListenerOptions,
) => void;

/** Distance, in pixels, the pointer must travel before a press is a drag. */
const ClickMovementThreshold = 4;

/** Semitones a shifted arrow key transposes by: one octave. */
const OctaveSemitones = 12;

/** Ticks an arrow key nudges notes by when snapping is off. */
const UnsnappedNudgeTicks = 7.5;

/** Extra zoom applied to trackpad pinch gestures, which report small deltas. */
const TrackpadPinchZoomMultiplier = 4;

/** Owns DOM listeners and transient pointer/keyboard gesture state. */
export class PianoRollInputController {
  /** Supplies selection, pointer state and rendering requests. */
  private readonly context: PianoRollContext;

  /** Converts canvas positions to ticks and drives pan and zoom. */
  private readonly coordinates: CoordinateSystem;

  /** Note rectangles used for hit-testing and marquee selection. */
  private readonly geometry: NoteGeometryCache;

  /** Applies note gestures and keyboard edits to the document. */
  private readonly editing: NoteEditingController;

  /** Header markers; receives header clicks, drags and hovers. */
  private readonly header: HeaderController;

  /** Canvas the listeners are attached to; null while detached. */
  private canvas: HTMLCanvasElement | null = null;

  /** Button of the press that may still turn into a click. */
  private clickButton: number | null = null;

  /** Canvas position where the current press began. */
  private readonly clickStart = new Vector2();

  /** Last position the pointer hovered over; null until it first moves. */
  private hoverPosition: Vector2 | null = null;

  /** True while an Alt+right-drag erase gesture is active. */
  private erasing = false;

  /** Empty-space press that becomes a seek on release or a note on drag. */
  private pendingCreateStart: Vector2 | null = null;

  /** Canvas width most recently reported by the view. */
  private lastWidth = 1;

  /** Canvas height most recently reported by the view. */
  private lastHeight = 1;

  /** Key shortcuts, with or without a modifier, that act on the clipboard. */
  private readonly clipboardShortcuts = new Map<string, () => void>([
    ["c", () => this.editing.copySelection()],
    ["x", () => this.editing.cutSelection()],
    ["v", () => this.pasteClipboard()],
  ]);

  public constructor(
    context: PianoRollContext,
    coordinates: CoordinateSystem,
    geometry: NoteGeometryCache,
    editing: NoteEditingController,
    header: HeaderController,
  ) {
    this.context = context;
    this.coordinates = coordinates;
    this.geometry = geometry;
    this.editing = editing;
    this.header = header;
  }

  /** Abandons every gesture in progress, closing any open transaction. */
  public cancelNoteEditing(): void {
    this.editing.cancelGesture();
    this.pendingCreateStart = null;
    if (this.erasing) {
      this.context.endEdit();
    }
    this.erasing = false;
    this.header.endDrag();
  }

  /** Starts listening for input on `canvas` and makes it focusable. */
  public attach(canvas: HTMLCanvasElement): void {
    this.canvas = canvas;
    canvas.style.touchAction = "none";
    canvas.tabIndex = 0;

    this.registerCanvasListeners((type, listener, options) =>
      canvas.addEventListener(type, listener, options),
    );
    window.addEventListener("pointerup", this.handlePointerUp);
  }

  /** Stops listening, clears pointer state and abandons active gestures. */
  public detach(): void {
    const canvas = this.canvas;
    if (canvas) {
      this.registerCanvasListeners((type, listener, options) =>
        canvas.removeEventListener(type, listener, options),
      );
    }
    window.removeEventListener("pointerup", this.handlePointerUp);
    this.canvas = null;

    // Release the pointer, then abandon whatever gesture it was driving.
    const pointer = this.context.getPointerContext();
    pointer.id = null;
    pointer.button = null;
    this.cancelNoteEditing();
  }

  /** Records the canvas size, which keyboard focusing needs. */
  public setViewport(width: number, height: number): void {
    this.lastWidth = width;
    this.lastHeight = height;
  }

  /** Pastes the clipboard at the pointer, or at the left edge if it never moved. */
  public pasteClipboard(): void {
    this.editing.pasteClipboard(this.hoverPosition?.x ?? null);
  }

  /** Passes every canvas listener to `register`, so attach and detach agree. */
  private registerCanvasListeners(register: ListenerRegistrar): void {
    register("keydown", this.handleKeyDown);
    register("click", this.handleClick);
    register("contextmenu", this.handleContextMenu);
    register("pointerdown", this.handlePointerDown);
    register("pointermove", this.handlePointerMove);
    register("pointerup", this.handlePointerUp);
    register("pointercancel", this.handlePointerUp);
    register("pointerleave", this.handlePointerLeave);
    register("wheel", this.handleWheel, { passive: false });
    register("auxclick", this.handleAuxClick);
  }

  /** Routes keyboard shortcuts to editing and camera actions. */
  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    const key = event.key.toLowerCase();

    if (this.handleArrowKey(event, key)) {
      return;
    }

    if (event.ctrlKey || event.metaKey) {
      this.handleModifiedKey(event, key);
      return;
    }

    this.handlePlainKey(event, key);
  };

  /** Arrows transpose (up/down) or nudge (left/right); true when handled. */
  private handleArrowKey(event: KeyboardEvent, key: string): boolean {
    if (key === "arrowup" || key === "arrowdown") {
      event.preventDefault();
      const direction = key === "arrowup" ? 1 : -1;
      const semitones = event.shiftKey ? OctaveSemitones : 1;
      this.editing.transposeSelection(direction * semitones);
      return true;
    }

    if (key === "arrowleft" || key === "arrowright") {
      event.preventDefault();
      const direction = key === "arrowleft" ? -1 : 1;
      const nudgeTicks = this.context.getState().snap.enabled
        ? this.coordinates.getSnapTicks()
        : UnsnappedNudgeTicks;
      this.editing.moveSelectionTicks(direction * nudgeTicks);
      return true;
    }

    return false;
  }

  /** Ctrl/Cmd shortcuts: select all, deselect, and the clipboard. */
  private handleModifiedKey(event: KeyboardEvent, key: string): void {
    switch (key) {
      case "a": {
        event.preventDefault();
        this.selectAll();
        break;
      }
      case "d": {
        event.preventDefault();
        this.deselectAll();
        break;
      }
      case "c":
      case "x":
      case "v": {
        this.runClipboardShortcut(event, key);
      }
    }
  }

  /** Unmodified shortcuts: the clipboard, focus selection and delete. */
  private handlePlainKey(event: KeyboardEvent, key: string): void {
    if (this.runClipboardShortcut(event, key)) return;

    if (key === "f") {
      event.preventDefault();
      this.coordinates.focusSelection(
        this.context.getSelectionContext().notes,
        this.lastWidth,
        this.lastHeight,
      );
      this.context.requestRender();
      return;
    }

    if (key === "delete") {
      event.preventDefault();
      this.editing.deleteSelection();
    }
  }

  private selectAll() {
    const selection = this.context.getSelectionContext();
    selection.notes = this.context.getCurrentNotes();
    this.context.requestRender();
  }

  private deselectAll() {
    const selection = this.context.getSelectionContext();
    selection.clear();
    this.context.requestRender();
  }

  /** Runs a copy, cut or paste shortcut for `key`; true when it was one. */
  private runClipboardShortcut(event: KeyboardEvent, key: string): boolean {
    const action = this.clipboardShortcuts.get(key);
    if (!action) {
      return false;
    }

    event.preventDefault();
    action();
    return true;
  }

  /** A press that barely moved is a click: header action or note select. */
  private readonly handleClick = (event: MouseEvent): void => {
    const button = this.clickButton;
    this.clickButton = null;
    if (button !== PointerButton.Left) {
      return;
    }
    // A drag that ends over the same spot is not a click.
    const pointerPosition = this.context.getPointerContext().position;
    const travelled = pointerPosition.distanceTo(this.clickStart);
    if (travelled > ClickMovementThreshold) {
      return;
    }

    event.preventDefault();

    if (this.clickStart.y < HeaderHeight) {
      this.header.click(this.clickStart);
      return;
    }

    const hit = this.hitTestNote(this.clickStart);
    if (!hit) {
      return;
    }

    this.context.getSelectionContext().notes = [hit];
    this.context.requestRender();
  };

  /** Suppresses the browser context menu so right-drag can select. */
  private readonly handleContextMenu = (event: MouseEvent): void => {
    event.preventDefault();
  };

  /** Starts the gesture that matches the pressed button and position. */
  private readonly handlePointerDown = (event: PointerEvent): void => {
    if (event.button === PointerButton.None) {
      return;
    }
    event.preventDefault();

    // Record the pointer and where the press began.
    const pointer = this.context.getPointerContext();
    pointer.id = event.pointerId;
    pointer.button = event.button as PointerButton;

    const local = this.toCanvasLocal(event.clientX, event.clientY);
    this.clickButton = event.button;
    this.clickStart.copy(local);
    this.canvas?.focus();

    this.beginGestureFor(event, local);

    pointer.position.copy(local);
    this.canvas?.setPointerCapture(event.pointerId);
  };

  /** Begins the right- or left-button gesture; other buttons start nothing. */
  private beginGestureFor(event: PointerEvent, local: Vector2): void {
    if (event.button === PointerButton.Right) {
      this.beginRightButtonGesture(event, local);
      return;
    }

    if (event.button !== PointerButton.Left) return;

    if (local.y < HeaderHeight) {
      this.header.beginDrag(local);
      return;
    }

    this.beginGridPress(local);
  }

  /** Right button: header delete, Alt-erase, or start a marquee. */
  private beginRightButtonGesture(event: PointerEvent, local: Vector2): void {
    if (local.y < HeaderHeight) {
      this.header.rightClick(local.x, local.y);
      return;
    }

    if (event.altKey) {
      this.erasing = true;
      this.context.beginEdit();
      this.eraseNoteAt(local);
      return;
    }

    // Start a one-pixel marquee at the press; dragging grows it.
    this.erasing = false;
    this.context.getSelectionContext().bounds = new Box2(
      local.clone(),
      local.clone().addScalar(1),
    );
  }

  /** Left press in the grid: resize an edge, move a note, or arm creation. */
  private beginGridPress(local: Vector2): void {
    const edgeHit = this.hitTestNoteEdge(local);
    if (edgeHit) {
      this.editing.beginResize(edgeHit);
      return;
    }

    const bodyHit = this.hitTestNote(local);
    if (bodyHit) {
      this.editing.beginMove(bodyHit);
      return;
    }

    this.pendingCreateStart = local.clone();
  }

  /** Updates hover feedback, or advances the gesture the pointer is driving. */
  private readonly handlePointerMove = (event: PointerEvent): void => {
    const local = this.toCanvasLocal(event.clientX, event.clientY);
    this.hoverPosition = local;

    const pointer = this.context.getPointerContext();
    if (pointer.id === null || event.pointerId !== pointer.id) {
      this.updateHoverFeedback(local);
      return;
    }

    // Track the pointer, then let the pressed button interpret the movement.
    const delta = local.clone().sub(pointer.position);
    pointer.position.copy(local);

    if (!this.dragWithButton(pointer.button, local, delta)) {
      return;
    }

    this.header.updateHover(pointer.position);
    this.context.requestRender();
  };

  /** Shows the right cursor and header hover when no gesture is active. */
  private updateHoverFeedback(local: Vector2): void {
    if (this.canvas) {
      this.canvas.style.cursor = this.cursorAt(local);
    }

    this.header.updateHover(local);
    this.context.requestRender();
  }

  /** CSS cursor for the note part under `local`. */
  private cursorAt(local: Vector2): string {
    if (this.hitTestNoteEdge(local)) {
      return "ew-resize"; // Bi-directional resize
    }
    if (this.hitTestNote(local)) {
      return "move"; // Four-way arrow
    }
    return "default";
  }

  /** Applies a drag for `button`; false when the button has no drag action. */
  private dragWithButton(
    button: PointerButton | null,
    local: Vector2,
    delta: Vector2,
  ): boolean {
    if (button === PointerButton.Right) {
      this.dragRightButton(local);
      return true;
    }

    if (button === PointerButton.Left) {
      this.dragLeftButton(local);
      return true;
    }

    if (button === PointerButton.Middle) {
      this.coordinates.pan(delta.x, delta.y);
      return true;
    }

    return false;
  }

  /** Right drag: erase notes under the pointer or grow the marquee. */
  private dragRightButton(local: Vector2): void {
    if (this.erasing) {
      this.eraseNoteAt(local);
      return;
    }

    this.updateSelection();
  }

  /** Left drag: header drag, resize, move, or promote a press into a note. */
  private dragLeftButton(local: Vector2): void {
    if (local.y < HeaderHeight) {
      this.header.updateDrag(local);
      return;
    }

    if (this.editing.isResizing) {
      this.editing.updateResize(local);
      return;
    }

    if (this.editing.isMoving) {
      this.editing.updateMove(local);
      return;
    }

    this.createNoteIfDragged(local);
  }

  /** Turns an armed empty-space press into a note once it has been dragged. */
  private createNoteIfDragged(local: Vector2): void {
    const start = this.pendingCreateStart;
    if (!start || local.distanceTo(start) <= ClickMovementThreshold) {
      return;
    }

    this.editing.beginCreate(start);
    this.pendingCreateStart = null;
    this.editing.updateResize(local);
  }

  /** Clears hover state when the pointer leaves, unless it moved into the header editor. */
  private readonly handlePointerLeave = (event: PointerEvent): void => {
    const target = event.relatedTarget;
    if (
      target === this.header.getEditInput() ||
      target === this.header.getDeleteButton()
    ) {
      return;
    }

    this.header.updateHover(null);
    this.context.requestRender();
  };

  /** Ends the active gesture; an unmoved empty press seeks the playhead. */
  private readonly handlePointerUp = (event: PointerEvent): void => {
    const pointer = this.context.getPointerContext();
    if (pointer.id === null || event.pointerId !== pointer.id) return;

    // Release the pointer.
    if (this.canvas?.hasPointerCapture(event.pointerId)) {
      this.canvas.releasePointerCapture(event.pointerId);
    }
    pointer.id = null;
    pointer.button = null;

    const wasErasing = this.erasing;
    this.erasing = false;

    // Close out whichever gesture was active.
    this.seekToPendingCreateStart();
    this.editing.finishGesture();
    this.header.endDrag();
    if (wasErasing) this.context.endEdit();

    const selection = this.context.getSelectionContext();
    if (selection.bounds !== null) selection.bounds = null;
    this.context.requestRender();
  };

  /** Seeks to the pressed tick when an empty press ended without dragging. */
  private seekToPendingCreateStart(): void {
    if (!this.pendingCreateStart) return;

    this.context.requestSeek(
      this.coordinates.snapTickToNearest(
        this.coordinates.tickAtScreenX(this.pendingCreateStart.x),
      ),
    );
    this.pendingCreateStart = null;
  }

  /** Stops the browser's middle-click autoscroll. */
  private readonly handleAuxClick = (event: MouseEvent): void => {
    if (event.button === PointerButton.Middle) event.preventDefault();
  };

  /** Zooms or pans depending on the kind of scroll gesture. */
  private readonly handleWheel = (event: WheelEvent): void => {
    event.preventDefault();
    if (!this.canvas) return;

    const position = this.toCanvasLocal(event.clientX, event.clientY);
    const delta = new Vector2(-event.deltaX, -event.deltaY);

    switch (getScrollGesture(event)) {
      case "mouse-zoom":
        this.zoomWithMouseWheel(event, position);
        break;
      case "trackpad-pan":
        this.panWithTrackpad(event, delta);
        break;
      case "trackpad-pinch":
        this.coordinates.zoomAtCursor(
          this.coordinates.getZoomFactor(
            -event.deltaY * TrackpadPinchZoomMultiplier,
          ),
          position,
        );
        break;
    }

    this.context.requestRender();
  };

  /** Mouse wheel zooms along the axis with the larger delta. */
  private zoomWithMouseWheel(event: WheelEvent, position: Vector2): void {
    if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) {
      this.coordinates.zoomHorizontal(
        this.coordinates.getZoomFactor(-event.deltaX),
        position.x,
      );
      return;
    }

    this.coordinates.zoomVertical(
      this.coordinates.getZoomFactor(-event.deltaY),
      position.y - this.coordinates.getGridTop(),
    );
  }

  /** Two-finger trackpad scroll pans; with Alt held it zooms horizontally. */
  private panWithTrackpad(event: WheelEvent, delta: Vector2): void {
    if (event.altKey) {
      this.coordinates.zoomHorizontal(
        this.coordinates.getZoomFactor(-delta.y),
        delta.x,
      );
      return;
    }

    this.coordinates.pan(delta.x, delta.y);
  }

  /** Grows the marquee to the pointer and selects the notes it touches. */
  private updateSelection(): void {
    const selection = this.context.getSelectionContext();
    if (selection.bounds === null) return;

    const pointerPosition = this.context.getPointerContext().position;
    selection.bounds = new Box2().setFromPoints([
      this.clickStart,
      pointerPosition,
    ]);

    // Select every visible note the marquee overlaps; deselect the rest.
    for (const noteGeometry of this.geometry.geometry) {
      const screenRect = screenRectOf(noteGeometry, this.coordinates);

      if (screenRect && selection.intersects(screenRect)) {
        selection.add(noteGeometry.note);
      } else {
        selection.delete(noteGeometry.note);
      }
    }
  }

  /** Erases the note under `local`, if any. */
  private eraseNoteAt(local: Vector2): void {
    const hit = this.hitTestNote(local);
    if (hit) this.editing.eraseNote(hit);
  }

  /** The note body under `local`, if any. */
  private hitTestNote(local: Vector2): PianoRollNote | null {
    return this.geometry.hitTest(local, this.coordinates);
  }

  /** The note whose resize handle is under `local`, if any. */
  private hitTestNoteEdge(local: Vector2): PianoRollNote | null {
    return this.geometry.hitTestEdge(local, this.coordinates);
  }

  /** Converts client coordinates to canvas pixels. */
  private toCanvasLocal(clientX: number, clientY: number): Vector2 {
    if (!this.canvas) return new Vector2(clientX, clientY);

    const bounds = this.canvas.getBoundingClientRect();
    return new Vector2(clientX - bounds.left, clientY - bounds.top);
  }
}
