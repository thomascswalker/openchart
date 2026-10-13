import { point, type CanvasPoint } from "../../../rendering/geometry";
import { getScrollGesture } from "../../../util/scroll";
import { HeaderHeight } from "./constants";
import type { CoordinateSystem } from "./coordinates";
import { HeaderController } from "./header";
import type { NoteEditingController } from "./noteEditing";
import { screenRectOf, type NoteGeometryCache } from "./noteGeometry";
import {
  PointerButton,
  type PointerButton as PointerButtonType,
} from "./pointer";
import type { PianoRollContext, PianoRollNote } from "./types";

/** Owns DOM listeners and transient pointer/keyboard gesture state. */
export class PianoRollInputController {
  private readonly context: PianoRollContext;
  private readonly coordinates: CoordinateSystem;
  private readonly geometry: NoteGeometryCache;
  private readonly editing: NoteEditingController;
  private readonly header: HeaderController;

  private canvas: HTMLCanvasElement | null = null;
  private clickButton: number | null = null;
  private readonly clickStart = point();
  private readonly hoverPosition = point();
  private hasHovered = false;
  private erasing = false;
  private pendingCreateStart: CanvasPoint | null = null;
  private lastWidth = 1;
  private lastHeight = 1;
  private static readonly clickMovementThreshold = 4;

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

  public cancelNoteEditing(): void {
    this.editing.cancelGesture();
    this.pendingCreateStart = null;
    if (this.erasing) this.context.endEdit();
    this.erasing = false;
    this.header.endDrag();
  }

  public attach(canvas: HTMLCanvasElement): void {
    this.canvas = canvas;
    canvas.style.touchAction = "none";
    canvas.tabIndex = 0;
    canvas.addEventListener("keydown", this.handleKeyDown);
    canvas.addEventListener("click", this.handleClick);
    canvas.addEventListener("contextmenu", this.handleContextMenu);
    canvas.addEventListener("pointerdown", this.handlePointerDown);
    canvas.addEventListener("pointermove", this.handlePointerMove);
    canvas.addEventListener("pointerup", this.handlePointerUp);
    canvas.addEventListener("pointercancel", this.handlePointerUp);
    canvas.addEventListener("pointerleave", this.handlePointerLeave);
    canvas.addEventListener("wheel", this.handleWheel, { passive: false });
    canvas.addEventListener("auxclick", this.handleAuxClick);
    window.addEventListener("pointerup", this.handlePointerUp);
  }

  public detach(): void {
    const canvas = this.canvas;
    if (canvas) {
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
    window.removeEventListener("pointerup", this.handlePointerUp);
    this.canvas = null;
    const pointer = this.context.getPointerContext();
    pointer.id = null;
    pointer.button = null;
    this.pendingCreateStart = null;
    if (this.erasing) this.context.endEdit();
    this.erasing = false;
    this.editing.cancelGesture();
    this.header.endDrag();
  }

  public setViewport(width: number, height: number): void {
    this.lastWidth = width;
    this.lastHeight = height;
  }

  public pasteClipboard(): void {
    this.editing.pasteClipboard(this.hoverPosition.x, this.hasHovered);
  }

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    const key = event.key.toLowerCase();
    const selection = this.context.getSelectionContext();
    if (key === "arrowup" || key === "arrowdown") {
      event.preventDefault();
      this.editing.transposeSelection(
        (key === "arrowup" ? 1 : -1) * (event.shiftKey ? 12 : 1),
      );
      return;
    }
    if (key === "arrowleft" || key === "arrowright") {
      event.preventDefault();
      this.editing.moveSelectionTicks(
        (key === "arrowleft" ? -1 : 1) *
          (this.context.getState().snap.enabled
            ? this.coordinates.getSnapTicks()
            : 7.5),
      );
      return;
    }
    if (event.ctrlKey || event.metaKey) {
      if (key === "a") {
        event.preventDefault();
        selection.notes = this.context.getCurrentNotes();
        this.context.requestRender();
      } else if (key === "d") {
        event.preventDefault();
        selection.clear();
        this.context.requestRender();
      } else if (key === "c") {
        event.preventDefault();
        this.editing.copySelection();
      } else if (key === "x") {
        event.preventDefault();
        this.editing.cutSelection();
      } else if (key === "v") {
        event.preventDefault();
        this.pasteClipboard();
      }
      return;
    }
    switch (key) {
      case "c":
        event.preventDefault();
        this.editing.copySelection();
        break;
      case "x":
        event.preventDefault();
        this.editing.cutSelection();
        break;
      case "v":
        event.preventDefault();
        this.editing.pasteClipboard(this.hoverPosition.x, this.hasHovered);
        break;
      case "f":
        event.preventDefault();
        this.coordinates.focusSelection(
          selection.notes,
          this.lastWidth,
          this.lastHeight,
        );
        this.context.requestRender();
        break;
      case "delete":
        event.preventDefault();
        this.editing.deleteSelection();
        break;
    }
  };

  private readonly handleClick = (event: MouseEvent): void => {
    const button = this.clickButton;
    this.clickButton = null;
    if (button !== PointerButton.Left) return;
    const pointer = this.context.getPointerContext();
    if (
      Math.hypot(
        pointer.position.x - this.clickStart.x,
        pointer.position.y - this.clickStart.y,
      ) > PianoRollInputController.clickMovementThreshold
    ) {
      return;
    }
    event.preventDefault();
    if (this.clickStart.y < HeaderHeight) {
      this.header.click(this.clickStart);
      return;
    }
    const hit = this.hitTestNote(this.clickStart);
    if (hit) {
      this.context.getSelectionContext().notes = [hit];
      this.context.requestRender();
    }
  };

  private readonly handleContextMenu = (event: MouseEvent): void => {
    event.preventDefault();
  };

  private readonly handlePointerDown = (event: PointerEvent): void => {
    if (event.button === PointerButton.None) return;
    event.preventDefault();
    const pointer = this.context.getPointerContext();
    pointer.id = event.pointerId;
    pointer.button = event.button as PointerButtonType;
    const local = this.toCanvasLocal(event.clientX, event.clientY);
    this.clickButton = event.button;
    Object.assign(this.clickStart, local);
    this.canvas?.focus();
    if (event.button === PointerButton.Right) {
      if (local.y < HeaderHeight) this.header.rightClick(local.x, local.y);
      else if (event.altKey) {
        this.erasing = true;
        this.context.beginEdit();
        const hit = this.hitTestNote(local);
        if (hit) this.editing.eraseNote(hit);
      } else {
        this.erasing = false;
        this.context.getSelectionContext().bounds = {
          x: local.x,
          y: local.y,
          width: 1,
          height: 1,
        };
      }
    } else if (event.button === PointerButton.Left && local.y >= HeaderHeight) {
      const edgeHit = this.hitTestNoteEdge(local);
      if (edgeHit) {
        this.editing.beginResize(edgeHit);
      } else {
        const bodyHit = this.hitTestNote(local);
        if (bodyHit) {
          this.editing.beginMove(bodyHit);
        } else {
          this.pendingCreateStart = { x: local.x, y: local.y };
        }
      }
    } else if (event.button === PointerButton.Left) {
      this.header.beginDrag(local);
    }
    Object.assign(pointer.position, local);
    this.canvas?.setPointerCapture(event.pointerId);
  };

  private readonly handlePointerMove = (event: PointerEvent): void => {
    const local = this.toCanvasLocal(event.clientX, event.clientY);
    Object.assign(this.hoverPosition, local);
    this.hasHovered = true;
    const pointer = this.context.getPointerContext();
    if (pointer.id === null || event.pointerId !== pointer.id) {
      if (this.canvas) {
        this.canvas.style.cursor = this.hitTestNoteEdge(local)
          ? "ew-resize"
          : this.hitTestNote(local)
            ? "move"
            : "";
      }
      this.header.updateHover(local);
      this.context.requestRender();
      return;
    }
    const dx = local.x - pointer.position.x;
    const dy = local.y - pointer.position.y;
    Object.assign(pointer.position, local);
    if (pointer.button === PointerButton.Right) {
      if (this.erasing) {
        const hit = this.hitTestNote(local);
        if (hit) this.editing.eraseNote(hit);
      } else this.updateSelection();
    } else if (pointer.button === PointerButton.Left) {
      if (local.y < HeaderHeight) this.header.updateDrag(local);
      else if (this.editing.isResizing) this.editing.updateResize(local);
      else if (this.editing.isMoving) this.editing.updateMove(local);
      else if (this.pendingCreateStart) {
        if (
          Math.hypot(
            local.x - this.pendingCreateStart.x,
            local.y - this.pendingCreateStart.y,
          ) > PianoRollInputController.clickMovementThreshold
        ) {
          this.editing.beginCreate(this.pendingCreateStart);
          this.pendingCreateStart = null;
          this.editing.updateResize(local);
        }
      }
    } else if (pointer.button === PointerButton.Middle) {
      this.coordinates.pan(dx, dy);
    } else return;
    this.header.updateHover(pointer.position);
    this.context.requestRender();
  };

  private readonly handlePointerLeave = (event: PointerEvent): void => {
    if (
      event.relatedTarget === this.header.getEditInput() ||
      event.relatedTarget === this.header.getDeleteButton()
    ) {
      return;
    }
    this.header.updateHover(null);
    this.context.requestRender();
  };

  private readonly handlePointerUp = (event: PointerEvent): void => {
    const pointer = this.context.getPointerContext();
    if (pointer.id === null || event.pointerId !== pointer.id) return;
    if (this.canvas?.hasPointerCapture(event.pointerId)) {
      this.canvas.releasePointerCapture(event.pointerId);
    }
    pointer.id = null;
    pointer.button = null;
    const wasErasing = this.erasing;
    this.erasing = false;
    if (this.pendingCreateStart) {
      this.context.requestSeek(
        this.coordinates.snapTickToNearest(
          this.coordinates.tickAtScreenX(this.pendingCreateStart.x),
        ),
      );
      this.pendingCreateStart = null;
    }
    this.editing.finishGesture();
    this.header.endDrag();
    if (wasErasing) this.context.endEdit();
    const selection = this.context.getSelectionContext();
    if (selection.bounds !== null) selection.bounds = null;
    this.context.requestRender();
  };

  private readonly handleAuxClick = (event: MouseEvent): void => {
    if (event.button === PointerButton.Middle) event.preventDefault();
  };

  private readonly handleWheel = (event: WheelEvent): void => {
    event.preventDefault();
    if (!this.canvas) return;
    const bounds = this.canvas.getBoundingClientRect();
    const pos = point(event.clientX - bounds.left, event.clientY - bounds.top);
    const delta = point(-event.deltaX, -event.deltaY);
    switch (getScrollGesture(event)) {
      case "mouse-zoom":
        if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) {
          this.coordinates.zoomHorizontal(
            this.coordinates.getZoomFactor(-event.deltaX),
            pos.x,
          );
        } else {
          this.coordinates.zoomVertical(
            this.coordinates.getZoomFactor(-event.deltaY),
            pos.y - (this.coordinates.getGridTop?.() ?? HeaderHeight),
          );
        }
        break;
      case "trackpad-pan":
        if (event.altKey) {
          this.coordinates.zoomHorizontal(
            this.coordinates.getZoomFactor(-delta.y),
            delta.x,
          );
        } else this.coordinates.pan(delta.x, delta.y);
        break;
      case "trackpad-pinch":
        this.coordinates.zoomAtCursor(
          this.coordinates.getZoomFactor(-event.deltaY * 4),
          pos,
        );
        break;
    }
    this.context.requestRender();
  };

  private updateSelection(): void {
    const selection = this.context.getSelectionContext();
    const pointer = this.context.getPointerContext();
    if (selection.bounds === null) return;
    selection.bounds = {
      x: this.clickStart.x,
      y: this.clickStart.y,
      width: pointer.position.x - this.clickStart.x,
      height: pointer.position.y - this.clickStart.y,
    };
    for (const geo of this.geometry.geometry) {
      const screenRect = screenRectOf(geo, this.coordinates);
      if (!screenRect || !selection.intersects(screenRect)) {
        selection.delete(geo.note);
      } else selection.add(geo.note);
    }
  }

  private hitTestNote(point: CanvasPoint): PianoRollNote | null {
    return this.geometry.hitTest(point, this.coordinates);
  }

  private hitTestNoteEdge(point: CanvasPoint): PianoRollNote | null {
    return this.geometry.hitTestEdge(point, this.coordinates);
  }

  private toCanvasLocal(clientX: number, clientY: number): CanvasPoint {
    if (!this.canvas) return point(clientX, clientY);
    const bounds = this.canvas.getBoundingClientRect();
    return point(clientX - bounds.left, clientY - bounds.top);
  }
}
