import { Box2, Vector2 } from "three";
import { getScrollGesture } from "../../../../util/scroll";
import { ClickMovementThreshold, HeaderHeight } from "../constants";
import type { CoordinateSystem } from "../coordinates";
import { HeaderController } from "./header";
import type { NoteEditingController } from "./noteEditing";
import { screenRectOf, type NoteGeometryCache } from "../noteGeometry";
import {
  PointerButton,
  type PointerButton as PointerButtonType,
} from "../pointer";
import type { PianoRollContext, PianoRollNote } from "../types";
import { clone } from "es-toolkit";

/** Owns DOM listeners and transient pointer/keyboard gesture state. */
export class PianoRollInputController {
  readonly #context: PianoRollContext;
  readonly #coordinates: CoordinateSystem;
  readonly #geometry: NoteGeometryCache;
  readonly #editing: NoteEditingController;
  readonly #header: HeaderController;

  /** Canvas receiving input events, when attached. */
  #canvas: HTMLCanvasElement | null = null;
  /** Button recorded at pointer-down for the corresponding click event. */
  #clickButton: number | null = null;
  /** Canvas-local position where the active pointer gesture began. */
  #clickStart = new Vector2();
  /** Most recent canvas-local hover position. Also used as the paste location. */
  #hoverPosition = new Vector2();
  /** Has a hover position been recorded for clipboard pastes? */
  #hasHovered = false;
  /** Whether the active gesture is erasing notes. */
  #isErasing = false;
  /** Start position of a possible note creation, before drag threshold is met. */
  #pendingCreateStart: Vector2 | null = null;
  /** Latest viewport size, used to focus the selection. */
  #lastViewportSize = new Vector2();

  /** Connects the input controller to the piano roll's shared state and helpers. */
  public constructor(
    context: PianoRollContext,
    coordinates: CoordinateSystem,
    geometry: NoteGeometryCache,
    editing: NoteEditingController,
    header: HeaderController,
  ) {
    this.#context = context;
    this.#coordinates = coordinates;
    this.#geometry = geometry;
    this.#editing = editing;
    this.#header = header;
  }

  /** Cancels active note, header, and erase gestures. */
  public cancelNoteEditing(): void {
    // Cancel the current action
    this.#editing.cancelGesture();
    this.#pendingCreateStart = null;

    if (this.#isErasing) {
      this.#context.endEdit();
    }
    this.#isErasing = false;

    this.#header.endDrag();
  }

  /** Installs the canvas and window listeners needed for piano-roll input. */
  public attach(canvas: HTMLCanvasElement): void {
    this.#canvas = canvas;
    canvas.style.touchAction = "none";
    canvas.tabIndex = 0;

    // Keyboard and click input.
    canvas.addEventListener("keydown", this.handleKeyDown);
    canvas.addEventListener("click", this.handleClick);
    canvas.addEventListener("contextmenu", this.handleContextMenu);

    // Pointer gestures.
    canvas.addEventListener("pointerdown", this.handlePointerDown);
    canvas.addEventListener("pointermove", this.handlePointerMove);
    canvas.addEventListener("pointerup", this.handlePointerUp);
    canvas.addEventListener("pointercancel", this.handlePointerUp);
    canvas.addEventListener("pointerleave", this.handlePointerLeave);

    // Non-pointer input and pointer-up events outside the canvas.
    canvas.addEventListener("wheel", this.handleWheel, { passive: false });
    canvas.addEventListener("auxclick", this.handleAuxClick);
    window.addEventListener("pointerup", this.handlePointerUp);
  }

  /** Removes listeners and clears any active pointer or editing gesture. */
  public detach(): void {
    const canvas = this.#canvas;
    if (canvas) {
      // Remove the listeners installed on the canvas.
      canvas.removeEventListener("keydown", this.handleKeyDown);
      canvas.removeEventListener("click", this.handleClick);
      canvas.removeEventListener("contextmenu", this.handleContextMenu);
      canvas.removeEventListener("pointerdown", this.handlePointerDown);
      canvas.removeEventListener("pointermove", this.handlePointerMove);
      canvas.removeEventListener("pointerup", this.handlePointerUp);
      canvas.removeEventListener("pointercancel", this.handlePointerUp);
      canvas.removeEventListener("pointerleave", this.handlePointerLeave);
      canvas.removeEventListener("wheel", this.handleWheel);
      canvas.removeEventListener("auxclick", this.handleAuxClick);
    }

    // Clear pointer state and finish any gesture before detaching.
    window.removeEventListener("pointerup", this.handlePointerUp);
    this.#canvas = null;
    const pointer = this.#context.getPointerContext();
    pointer.id = null;
    pointer.button = null;
    this.#pendingCreateStart = null;

    if (this.#isErasing) {
      this.#context.endEdit();
    }
    this.#isErasing = false;
    this.#editing.cancelGesture();
    this.#header.endDrag();
  }

  /** Updates the viewport dimensions used when focusing the selection. */
  public setViewport(width: number, height: number): void {
    this.#lastViewportSize.x = width;
    this.#lastViewportSize.y = height;
  }

  /** Pastes the clipboard at the current horizontal hover position, if known. */
  public pasteClipboard(): void {
    this.#editing.pasteClipboard(this.#hoverPosition.x, this.#hasHovered);
  }

  // Keyboard and click input

  /** Handles piano-roll keyboard shortcuts and selection navigation. */
  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    const key = event.key.toLowerCase();
    const selection = this.#context.getSelectionContext();

    // Arrow keys transpose pitches or move notes along the timeline.
    if (key === "arrowup" || key === "arrowdown") {
      event.preventDefault();
      const direction = key === "arrowup" ? 1 : -1;
      const amplitude = event.shiftKey ? 12 : 1;
      this.#editing.transposeSelection(direction * amplitude);
      return;
    }

    if (key === "arrowleft" || key === "arrowright") {
      event.preventDefault();
      const direction = key === "arrowleft" ? -1 : 1;
      const amplitude = this.#context.getState().snap.enabled
        ? this.#coordinates.getSnapTicks()
        : 7.5;
      this.#editing.moveSelectionTicks(direction * amplitude);
      return;
    }

    // Modifier shortcuts handle selection and clipboard operations.
    if (event.ctrlKey || event.metaKey) {
      switch (key) {
        case "a": {
          event.preventDefault();
          selection.notes = this.#context.getCurrentNotes();
          this.#context.requestRender();
          break;
        }
        case "d": {
          event.preventDefault();
          selection.clear();
          this.#context.requestRender();
          break;
        }
        case "c": {
          event.preventDefault();
          this.#editing.copySelection();
          break;
        }
        case "x": {
          event.preventDefault();
          this.#editing.cutSelection();
          break;
        }
        case "v": {
          event.preventDefault();
          this.pasteClipboard();
          break;
        }
      }
      return;
    }

    // Single-key shortcuts apply when no modifier is held.
    switch (key) {
      case "c":
        event.preventDefault();
        this.#editing.copySelection();
        break;
      case "x":
        event.preventDefault();
        this.#editing.cutSelection();
        break;
      case "v":
        event.preventDefault();
        this.#editing.pasteClipboard(this.#hoverPosition.x, this.#hasHovered);
        break;
      case "f":
        event.preventDefault();
        this.#coordinates.focusSelection(
          selection.notes,
          this.#lastViewportSize,
        );
        this.#context.requestRender();
        break;
      case "delete":
        event.preventDefault();
        this.#editing.deleteSelection();
        break;
    }
  };

  /** Selects notes or forwards a short left click to the header. */
  private readonly handleClick = (event: MouseEvent): void => {
    const button = this.#clickButton;
    this.#clickButton = null;

    // Only accept left-button clicks.
    if (button !== PointerButton.Left) {
      return;
    }

    const pointer = this.#context.getPointerContext();

    // Ignore pointer movement beyond the click threshold.
    const pointerDelta = Math.hypot(
      pointer.position.x - this.#clickStart.x,
      pointer.position.y - this.#clickStart.y,
    );
    if (pointerDelta > ClickMovementThreshold) {
      return;
    }

    // Prevent browser behavior before forwarding the click to the roll.
    event.preventDefault();

    if (this.#clickStart.y < HeaderHeight) {
      this.#header.handleLeftClick(this.#clickStart);
      return;
    }

    // Select the hit note and redraw.
    const hit = this.hitTestNote(this.#clickStart);
    if (hit) {
      this.#context.getSelectionContext().notes = [hit];
      this.#context.requestRender();
    }
  };

  /** Suppresses the browser context menu over the piano roll. */
  private readonly handleContextMenu = (event: MouseEvent): void => {
    event.preventDefault();
  };

  /** Starts the right-button header action, erase gesture, or selection box. */
  private readonly handleRightPointerDown = (
    event: PointerEvent,
    pos: Vector2,
  ) => {
    if (pos.y < HeaderHeight) {
      this.#header.handleRightPointerDown(pos.x, pos.y);
    }
    // Alt + right-drag erases notes as the pointer moves.
    else if (event.altKey) {
      this.#isErasing = true;
      this.#context.beginEdit();
      const hit = this.hitTestNote(pos);
      if (hit) {
        this.#editing.eraseNote(hit);
      }
    }
    // Otherwise, begin a box selection.
    else {
      this.#isErasing = false;
      this.#context.getSelectionContext().bounds = new Box2(
        new Vector2(pos.x, pos.y),
        new Vector2(pos.x + 1, pos.y + 1),
      );
    }
  };

  /** Starts a header drag, note move/resize, or a pending note creation. */
  private readonly handleLeftPointerDown = (pos: Vector2) => {
    if (pos.y < HeaderHeight) {
      this.#header.beginDrag(pos);
      return;
    }

    // Prefer resizing an edge, then moving a note body, otherwise defer creation.
    const edgeHit = this.hitTestNoteEdge(pos);
    if (edgeHit) {
      this.#editing.beginResize(edgeHit);
    } else {
      const bodyHit = this.hitTestNote(pos);
      if (bodyHit) {
        this.#editing.beginMove(bodyHit);
      } else {
        this.#pendingCreateStart = pos.clone();
      }
    }
  };

  /** Captures a pointer and begins the gesture associated with its button. */
  private readonly handlePointerDown = (event: PointerEvent): void => {
    // Ignore events without an active mouse button.
    if (event.button === PointerButton.None) {
      return;
    }

    event.preventDefault();

    // Record the active pointer and its starting canvas position.
    const pointer = this.#context.getPointerContext();
    pointer.id = event.pointerId;
    pointer.button = event.button as PointerButtonType;
    this.#clickButton = event.button;
    const local = this.toCanvasLocal(event.clientX, event.clientY);
    Object.assign(this.#clickStart, local);
    Object.assign(pointer.position, local);

    // Keep keyboard shortcuts available and continue tracking outside the canvas.
    this.#canvas?.focus();
    this.#canvas?.setPointerCapture(event.pointerId);

    // Start button-specific actions; middle-button movement pans later.
    if (event.button === PointerButton.Right) {
      this.handleRightPointerDown(event, local);
    } else if (event.button === PointerButton.Left) {
      this.handleLeftPointerDown(local);
    }
  };

  /** Updates cursor and header hover state when no gesture is active. */
  private handleUpdateHover(pos: Vector2) {
    if (this.#canvas) {
      this.#canvas.style.cursor = this.hitTestNoteEdge(pos)
        ? "ew-resize"
        : this.hitTestNote(pos)
          ? "move"
          : "";
    }
    this.#header.updateHover(pos);
    this.#context.requestRender();
  }

  /** Advances the active left-button action or starts creating a note. */
  private handleLeftPointerMove(local: Vector2) {
    if (local.y < HeaderHeight) {
      this.#header.updateDrag(local);
    } else if (this.#editing.isResizing) {
      this.#editing.updateResize(local);
    } else if (this.#editing.isMoving) {
      this.#editing.updateMove(local);
    } else if (this.#pendingCreateStart) {
      // Begin creation only after the pointer has moved beyond the click threshold.
      const delta = Math.hypot(
        local.x - this.#pendingCreateStart.x,
        local.y - this.#pendingCreateStart.y,
      );
      if (delta > ClickMovementThreshold) {
        this.#editing.beginCreate(this.#pendingCreateStart);
        this.#pendingCreateStart = null;
        this.#editing.updateResize(local);
      }
    }
  }

  /** Erases notes or updates the selection box during a right-button drag. */
  private handleRightPointerMove(local: Vector2) {
    if (this.#isErasing) {
      const hit = this.hitTestNote(local);
      if (hit) {
        this.#editing.eraseNote(hit);
      }
      return;
    }

    // Non-erasing right drags update the box selection.
    this.updateSelection();
  }

  /** Updates hover state or advances the active pointer gesture. */
  private readonly handlePointerMove = (event: PointerEvent): void => {
    const local = this.toCanvasLocal(event.clientX, event.clientY);
    const pointer = this.#context.getPointerContext();

    // Track the latest hover position for clipboard pastes.
    Object.assign(this.#hoverPosition, local);
    this.#hasHovered = true;

    // A different pointer may update hover but must not alter the active gesture.
    if (pointer.id === null || event.pointerId !== pointer.id) {
      this.handleUpdateHover(local);
      return;
    }

    const deltaX = local.x - pointer.position.x;
    const deltaY = local.y - pointer.position.y;
    Object.assign(pointer.position, local);

    // Dispatch movement to the handler for the active mouse button.
    switch (pointer.button) {
      case PointerButton.Right:
        this.handleRightPointerMove(local);
        break;
      case PointerButton.Left:
        this.handleLeftPointerMove(local);
        break;
      case PointerButton.Middle:
        // Middle-button movement pans the coordinate system.
        this.#coordinates.pan(deltaX, deltaY);
        break;
      default:
        return;
    }

    // Keep header hover and rendered gesture state in sync.
    this.#header.updateHover(pointer.position);
    this.#context.requestRender();
  };

  /** Clears header hover unless the pointer moved into a header control. */
  private readonly handlePointerLeave = (event: PointerEvent): void => {
    const isEditInput = event.relatedTarget === this.#header.getEditInput();
    const isDeleteButton =
      event.relatedTarget === this.#header.getDeleteButton();
    if (isEditInput || isDeleteButton) {
      return;
    }
    this.#header.updateHover(null);
    this.#context.requestRender();
  };

  /** Finishes the active gesture and releases temporary selection state. */
  private readonly handlePointerUp = (event: PointerEvent): void => {
    const pointer = this.#context.getPointerContext();
    if (pointer.id === null || event.pointerId !== pointer.id) return;

    // Release capture and clear active pointer state.
    if (this.#canvas?.hasPointerCapture(event.pointerId)) {
      this.#canvas.releasePointerCapture(event.pointerId);
    }
    pointer.id = null;
    pointer.button = null;
    const wasErasing = this.#isErasing;
    this.#isErasing = false;

    // A click on empty space seeks; a drag has already started note creation.
    if (this.#pendingCreateStart) {
      this.#context.requestSeek(
        this.#coordinates.snapTickToNearest(
          this.#coordinates.tickAtScreenX(this.#pendingCreateStart.x),
        ),
      );
      this.#pendingCreateStart = null;
    }

    // Finish editing and release any temporary header or selection state.
    this.#editing.finishGesture();
    this.#header.endDrag();
    if (wasErasing) this.#context.endEdit();
    const selection = this.#context.getSelectionContext();
    if (selection.bounds !== null) selection.bounds = null;
    this.#context.requestRender();
  };

  /** Prevents the browser's middle-button auxiliary click behavior. */
  private readonly handleAuxClick = (event: MouseEvent): void => {
    if (event.button === PointerButton.Middle) event.preventDefault();
  };

  /** Applies the zoom or pan gesture recognized from the wheel event. */
  private readonly handleWheel = (event: WheelEvent): void => {
    event.preventDefault();
    if (!this.#canvas) return;

    // Normalize wheel position and direction to canvas coordinates.
    const bounds = this.#canvas.getBoundingClientRect();
    const pos = new Vector2(
      event.clientX - bounds.left,
      event.clientY - bounds.top,
    );
    const delta = new Vector2(-event.deltaX, -event.deltaY);

    // Apply the zoom or pan behavior inferred from the input device gesture.
    switch (getScrollGesture(event)) {
      case "mouse-zoom":
        if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) {
          this.#coordinates.zoomHorizontal(
            this.#coordinates.getZoomFactor(-event.deltaX),
            pos.x,
          );
        } else {
          this.#coordinates.zoomVertical(
            this.#coordinates.getZoomFactor(-event.deltaY),
            pos.y - (this.#coordinates.getGridTop?.() ?? HeaderHeight),
          );
        }
        break;
      case "trackpad-pan":
        if (event.altKey) {
          this.#coordinates.zoomHorizontal(
            this.#coordinates.getZoomFactor(-delta.y),
            delta.x,
          );
        } else this.#coordinates.pan(delta.x, delta.y);
        break;
      case "trackpad-pinch":
        this.#coordinates.zoomAtCursor(
          this.#coordinates.getZoomFactor(-event.deltaY * 4),
          pos,
        );
        break;
    }
    this.#context.requestRender();
  };

  /** Updates the selection box and its intersecting notes during a drag. */
  private updateSelection(): void {
    const selection = this.#context.getSelectionContext();
    const pointer = this.#context.getPointerContext();
    if (selection.bounds === null) {
      return;
    }

    // Rebuild the selection bounds from the pointer-down and current positions.
    selection.bounds = new Box2(
      clone(this.#clickStart),
      clone(pointer.position),
    );

    // Add intersecting notes and remove notes that are no longer in the box.
    this.#geometry.geometry.map((geo) => {
      const screenRect = screenRectOf(geo, this.#coordinates);
      const screenBox = screenRect;
      if (!screenBox || !selection.intersects(screenBox)) {
        selection.delete(geo.note);
      } else {
        selection.add(geo.note);
      }
    });
  }

  /** Returns the note at a canvas-space point, if any. */
  private hitTestNote(point: Vector2): PianoRollNote | null {
    return this.#geometry.hitTest(point, this.#coordinates);
  }

  /** Returns the note edge at a canvas-space point, if any. */
  private hitTestNoteEdge(point: Vector2): PianoRollNote | null {
    return this.#geometry.hitTestEdge(point, this.#coordinates);
  }

  /** Converts viewport client coordinates to canvas-local coordinates. */
  private toCanvasLocal(clientX: number, clientY: number): Vector2 {
    if (!this.#canvas) {
      return new Vector2(clientX, clientY);
    }
    const bounds = this.#canvas.getBoundingClientRect();
    return new Vector2(clientX - bounds.left, clientY - bounds.top);
  }
}
