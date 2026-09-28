import type { MidiChannelEvent } from "@midiedit/core";
import { findSection, type ChartView, type Note } from "@midiedit/views";
import { HighwayCoordinateSystem } from "./coordinates";
import type { HighwayContext } from "./context";
import { HighwayHitTester } from "./hitTesting";
import {
  getHighwayDragTarget,
  getHighwaySteppedTick,
  getHighwaySustainEnd,
  getHighwayWheelTick,
} from "./interaction";
import { HighwayNoteEditingController } from "./noteEditing";
import { HighwayPhraseEditingController } from "./phraseEditing";
import type { DragState, GhostNoteLocation, MarqueeDragState } from "./types";
import { laneCount, wheelTicksPerPixel } from "./constants";

export class HighwayInputController {
  private readonly context: HighwayContext;
  private readonly coordinates: HighwayCoordinateSystem;
  private readonly hitTesting: HighwayHitTester;
  private readonly editing: HighwayNoteEditingController;
  private readonly phraseEditing: HighwayPhraseEditingController;
  private canvas: HTMLCanvasElement | null = null;
  private drag: DragState | null = null;
  private marqueeDrag: MarqueeDragState | null = null;
  private hoveredNoteOn: MidiChannelEvent | null = null;
  private ghostNoteLocation: GhostNoteLocation | null = null;
  private suppressNextClick = false;

  public constructor(
    context: HighwayContext,
    coordinates: HighwayCoordinateSystem,
    hitTesting: HighwayHitTester,
    editing: HighwayNoteEditingController,
    phraseEditing: HighwayPhraseEditingController,
  ) {
    this.context = context;
    this.coordinates = coordinates;
    this.hitTesting = hitTesting;
    this.editing = editing;
    this.phraseEditing = phraseEditing;
  }

  public attach(canvas: HTMLCanvasElement): void {
    this.detach();
    this.canvas = canvas;
    canvas.tabIndex = 0;
    canvas.style.touchAction = "none";
    canvas.addEventListener("click", this.handleClick);
    canvas.addEventListener("keydown", this.handleKeyDown);
    canvas.addEventListener("contextmenu", this.handleContextMenu);
    canvas.addEventListener("wheel", this.handleWheel, { passive: false });
    canvas.addEventListener("pointerdown", this.handlePointerDown);
    canvas.addEventListener("pointermove", this.handlePointerMove);
    canvas.addEventListener("pointerleave", this.handlePointerLeave);
    canvas.addEventListener("pointerup", this.handlePointerUp);
    canvas.addEventListener("pointercancel", this.handlePointerUp);
    window.addEventListener("pointerup", this.handlePointerUp);
    window.addEventListener("keydown", this.handleModifierKey);
    window.addEventListener("keyup", this.handleModifierKey);
  }

  public detach(): void {
    if (this.canvas) {
      this.canvas.removeEventListener("click", this.handleClick);
      this.canvas.removeEventListener("keydown", this.handleKeyDown);
      this.canvas.removeEventListener("contextmenu", this.handleContextMenu);
      this.canvas.removeEventListener("wheel", this.handleWheel);
      this.canvas.removeEventListener("pointerdown", this.handlePointerDown);
      this.canvas.removeEventListener("pointermove", this.handlePointerMove);
      this.canvas.removeEventListener("pointerleave", this.handlePointerLeave);
      this.canvas.removeEventListener("pointerup", this.handlePointerUp);
      this.canvas.removeEventListener("pointercancel", this.handlePointerUp);
    }
    window.removeEventListener("pointerup", this.handlePointerUp);
    window.removeEventListener("keydown", this.handleModifierKey);
    window.removeEventListener("keyup", this.handleModifierKey);
    this.canvas = null;
  }

  public getGhostNoteLocation(): GhostNoteLocation | null {
    return this.ghostNoteLocation;
  }

  public getHoveredNoteOn(): MidiChannelEvent | null {
    return this.hoveredNoteOn;
  }

  public canShowNotePlacementPreview(): boolean {
    return (
      !this.context.getState().isPlaying &&
      !this.drag &&
      !this.context.getPhraseMode() &&
      this.tool === "place"
    );
  }

  public refreshCursor(): void {
    this.updateCanvasCursor(this.hoveredNoteOn !== null);
  }

  public cancelActiveGestures(): void {
    for (const pointerId of [
      this.drag?.pointerId,
      this.marqueeDrag?.pointerId,
      this.phraseEditing.getDragState()?.pointerId,
    ]) {
      if (
        pointerId !== undefined &&
        this.canvas?.hasPointerCapture(pointerId)
      ) {
        this.canvas.releasePointerCapture(pointerId);
      }
    }
    this.drag = null;
    this.marqueeDrag = null;
    this.phraseEditing.cancelPhraseDrag();
    this.ghostNoteLocation = null;
    this.hoveredNoteOn = null;
    this.suppressNextClick = false;
    this.context.updateMarqueeOutline(null);
    this.context.clearHoverOutline();
  }

  private get tool(): "select" | "place" | "remove" {
    const mode = this.context.getMode();
    return mode === "starpower" || mode === "solo" ? "select" : mode;
  }

  private get canEditNotes(): boolean {
    return !this.context.getState().isPlaying;
  }

  private getCurrentChart(): ChartView | null {
    return this.context.getCurrentChart();
  }

  private readonly handleClick = (event: MouseEvent): void => {
    if (event.button !== 0) return;
    if (!this.canEditNotes) {
      this.suppressNextClick = false;
      return;
    }
    if (this.suppressNextClick) {
      this.suppressNextClick = false;
      return;
    }
    if (this.tool !== "place") return;
    const chart = this.getCurrentChart();
    const location = this.coordinates.getChartLocation(event);
    if (!chart || !location) return;
    this.editing.placeNoteAt(
      chart,
      location.lane as Note,
      location.tick,
      event.shiftKey || event.altKey,
    );
    this.context.notifyNotesChanged();
    this.context.requestRender();
  };

  private readonly handleContextMenu = (event: MouseEvent): void => {
    event.preventDefault();
    this.canvas?.focus();
  };

  private readonly handlePointerDown = (event: PointerEvent): void => {
    if (!this.canEditNotes || (event.button !== 0 && event.button !== 2))
      return;
    const chart = this.getCurrentChart();
    const location = this.coordinates.getChartLocation(event);
    if (!chart || !location) return;
    const sustainHit =
      this.hitTesting.getSustainAt(chart, event, location.tick) ?? null;
    const note = sustainHit ?? this.hitTesting.getNoteAt(chart, event);
    this.updateCanvasCursor(note !== undefined, event);
    const phraseMode = this.context.getPhraseMode();
    if (phraseMode && event.button === 0) {
      event.preventDefault();
      this.canvas?.focus();
      this.suppressNextClick = true;
      const existingPhrase = this.hitTesting.getPhraseAt(
        chart,
        event,
        phraseMode,
      );
      const operation = existingPhrase
        ? this.hitTesting.getPhraseDragOperation(existingPhrase, location.tick)
        : "create";
      this.phraseEditing.beginPhraseDrag(
        event.pointerId,
        phraseMode,
        location.tick,
        existingPhrase ?? null,
        operation,
      );
      this.canvas?.setPointerCapture(event.pointerId);
      this.context.requestRender();
      return;
    }
    if (this.tool === "place") return;
    if (this.tool === "remove") {
      if (event.button !== 0) return;
      event.preventDefault();
      this.canvas?.focus();
      this.suppressNextClick = true;
      if (note && this.editing.removeNote(chart, note)) {
        this.context.notifyNotesChanged();
      }
      this.context.requestRender();
      return;
    }
    if (!note) {
      if (event.button !== 0) return;
      const point = this.coordinates.getCanvasPoint(event);
      if (!point) return;
      this.canvas?.focus();
      this.marqueeDrag = {
        pointerId: event.pointerId,
        startX: point.x,
        startY: point.y,
        currentX: point.x,
        currentY: point.y,
        additive: event.shiftKey || event.ctrlKey || event.metaKey,
        moved: false,
      };
      this.suppressNextClick = true;
      this.canvas?.setPointerCapture(event.pointerId);
      this.context.updateMarqueeOutline(null);
      this.context.requestRender();
      return;
    }
    event.preventDefault();
    this.canvas?.focus();
    this.suppressNextClick = event.button === 0;
    const selection = this.context.getSelectionContext();
    const chartNotes = chart.getNotes();
    const chord = chartNotes.filter(
      (candidate) => candidate.start === note.start,
    );
    const chordNoteOns = chord.map((candidate) => candidate.noteOn);
    if (event.button === 0) {
      if ((event.shiftKey || event.ctrlKey || event.metaKey) && !sustainHit) {
        const shouldRemove = chordNoteOns.every((noteOn) =>
          selection.isSelected(noteOn),
        );
        chordNoteOns.forEach((noteOn) =>
          shouldRemove ? selection.remove(noteOn) : selection.add(noteOn),
        );
        if (shouldRemove) {
          this.context.requestRender();
          return;
        }
      } else if (
        !event.shiftKey &&
        !event.ctrlKey &&
        !event.metaKey &&
        !selection.isSelected(note.noteOn)
      ) {
        selection.set(chordNoteOns);
      }
    } else {
      selection.set(chordNoteOns);
    }
    this.ghostNoteLocation = null;
    const selectedTargets = chartNotes.filter((candidate) =>
      selection.isSelected(candidate.noteOn),
    );
    const resizeChord = event.button === 2;
    const targets = (resizeChord ? chord : selectedTargets).map(
      (candidate) => ({
        noteOn: candidate.noteOn,
        initialTick: candidate.start,
        initialLane: candidate.note - chart.getOffset(),
      }),
    );
    this.drag = {
      pointerId: event.pointerId,
      button: event.button as 0 | 2,
      shiftKey: event.shiftKey,
      moved: false,
      sustainHit,
      noteOn: note.noteOn,
      noteOns: targets.map((target) => target.noteOn),
      targets,
      initialLane: note.note - chart.getOffset(),
      initialTick: note.start,
      pointerLane: location.lane,
      pointerTick: location.tick,
      resizing: resizeChord,
      changed: false,
    };
    this.canvas?.setPointerCapture(event.pointerId);
    this.context.requestRender();
  };

  private readonly handlePointerMove = (event: PointerEvent): void => {
    const phraseDrag = this.phraseEditing.getDragState();
    if (phraseDrag?.pointerId === event.pointerId) {
      const location = this.coordinates.getChartLocation(event);
      if (location) {
        const canvas = this.canvas;
        if (canvas) {
          canvas.style.cursor =
            phraseDrag.operation === "move"
              ? "grabbing"
              : phraseDrag.operation === "create"
                ? "default"
                : "ns-resize";
        }
        this.phraseEditing.updatePhraseDrag(location.tick);
        this.context.requestRender();
      }
      return;
    }
    if (this.marqueeDrag?.pointerId === event.pointerId) {
      const point = this.coordinates.getCanvasPoint(event);
      if (point) {
        const marquee = this.marqueeDrag;
        marquee.currentX = point.x;
        marquee.currentY = point.y;
        marquee.moved ||=
          Math.hypot(
            marquee.currentX - marquee.startX,
            marquee.currentY - marquee.startY,
          ) >= 4;
        if (marquee.moved) {
          this.suppressNextClick = true;
          if (this.canvas) this.canvas.style.cursor = "crosshair";
          this.context.updateMarqueeOutline(marquee);
        }
        this.context.requestRender();
      }
      return;
    }

    const drag = this.drag;
    if (!drag || drag.pointerId !== event.pointerId) {
      this.updateHoveredNote(event);
      this.updateGhostLocation(event);
      return;
    }
    this.ghostNoteLocation = null;
    const chart = this.getCurrentChart();
    const location = this.coordinates.getChartLocation(event);
    const anchor = chart
      ?.getNotes()
      .find((note) => note.noteOn === drag.noteOn);
    if (!chart || !location || !anchor) return;

    drag.moved ||=
      location.tick !== drag.pointerTick || location.lane !== drag.pointerLane;
    const chartNotes = chart.getNotes();
    const otherNoteStarts = chartNotes
      .filter((note) => !drag.noteOns.includes(note.noteOn))
      .map((note) => note.start);
    let changed = false;
    for (const target of drag.targets) {
      const candidate = chartNotes.find(
        (note) => note.noteOn === target.noteOn,
      );
      if (!candidate) continue;
      const dragTarget = getHighwayDragTarget(
        target.initialTick,
        target.initialLane,
        location.tick - drag.pointerTick,
        location.lane - drag.pointerLane,
        this.coordinates.getSnapTicks(),
        this.context.getState().snap.enabled,
        laneCount,
      );
      if (drag.resizing) {
        const nextEnd = getHighwaySustainEnd(
          candidate.start,
          location.tick,
          otherNoteStarts,
          event.shiftKey || event.altKey,
        );
        if (nextEnd !== candidate.end) {
          changed =
            this.editing.resizeNote(chart, candidate, nextEnd) || changed;
        }
      } else {
        changed =
          this.editing.moveNote(
            chart,
            candidate,
            dragTarget.lane,
            dragTarget.tick,
          ) || changed;
      }
    }
    drag.changed ||= changed;
    if (changed) this.context.requestRender();
  };

  private readonly handlePointerLeave = (): void => {
    this.hoveredNoteOn = null;
    this.ghostNoteLocation = null;
    this.context.clearHoverOutline();
    if (this.canvas) this.canvas.style.cursor = "default";
    this.context.requestRender();
  };

  private readonly handlePointerUp = (event: PointerEvent): void => {
    const marquee = this.marqueeDrag;
    if (marquee?.pointerId === event.pointerId) {
      this.canvas?.releasePointerCapture(event.pointerId);
      this.marqueeDrag = null;
      if (marquee.moved) {
        const bounds = {
          left: Math.min(marquee.startX, marquee.currentX),
          right: Math.max(marquee.startX, marquee.currentX),
          top: Math.min(marquee.startY, marquee.currentY),
          bottom: Math.max(marquee.startY, marquee.currentY),
        };
        const chart = this.getCurrentChart();
        const selected = new Set(
          (chart?.getNotes() ?? [])
            .filter((note) => {
              const noteBounds = this.hitTesting.getGemScreenBounds(
                note,
                note.note - (chart?.getOffset() ?? 0),
              );
              return (
                noteBounds !== null &&
                noteBounds.right >= bounds.left &&
                noteBounds.left <= bounds.right &&
                noteBounds.bottom >= bounds.top &&
                noteBounds.top <= bounds.bottom
              );
            })
            .map((note) => note.noteOn),
        );
        const selection = this.context.getSelectionContext();
        selection.set(
          marquee.additive ? [...selection.notes, ...selected] : selected,
        );
      } else if (!marquee.additive) {
        this.context.getSelectionContext().clear();
      }
      this.context.updateMarqueeOutline(null);
      this.updateCanvasCursor(false, event);
      this.context.requestRender();
      return;
    }

    const phraseDrag = this.phraseEditing.getDragState();
    if (phraseDrag?.pointerId === event.pointerId) {
      this.canvas?.releasePointerCapture(event.pointerId);
      this.phraseEditing.finishPhraseDrag();
      this.updateCanvasCursor(false, event);
      this.context.requestRender();
      return;
    }

    const drag = this.drag;
    if (!drag || drag.pointerId !== event.pointerId) return;
    this.canvas?.releasePointerCapture(event.pointerId);
    this.drag = null;
    let changed = drag.changed;
    if (!drag.moved && drag.sustainHit) {
      const chart = this.getCurrentChart();
      if (chart && drag.button === 0) {
        const lane = drag.sustainHit.note - chart.getOffset();
        this.editing.placeNoteAt(
          chart,
          lane as Note,
          drag.pointerTick,
          drag.shiftKey || event.altKey,
          drag.sustainHit,
        );
        changed = true;
      } else if (chart) {
        changed =
          this.editing.cutSustainsAtTick(
            chart,
            drag.pointerTick,
            drag.shiftKey || event.altKey,
            drag.sustainHit,
          ) || changed;
      }
    }
    if (changed) this.context.notifyNotesChanged();
    if (drag.button === 2 && event.button === 2) {
      this.suppressNextClick = false;
    }
  };

  private readonly handleWheel = (event: WheelEvent): void => {
    event.preventDefault();
    const nextTick = getHighwayWheelTick(
      this.context.getPlayheadTick(),
      -event.deltaY,
      this.context.getPpqn(),
      wheelTicksPerPixel,
    );
    this.context.setPlayheadTick(nextTick);
    this.context.requestSeek(nextTick);
  };

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (!this.canEditNotes || event.target !== this.canvas) return;
    const key = event.key.toLowerCase();
    const ghost = this.ghostNoteLocation;
    if ((event.ctrlKey || event.metaKey) && !event.altKey) {
      if (key === "c") this.editing.copySelection();
      else if (key === "x") this.editing.cutSelection();
      else if (key === "v") {
        this.editing.pasteClipboard(
          ghost?.tick ?? this.context.getPlayheadTick(),
          ghost?.lane ?? 0,
        );
      } else return;
      event.preventDefault();
      return;
    }
    if (event.ctrlKey || event.metaKey) return;
    const chart = this.getCurrentChart();
    if (!chart) return;
    if (
      event.altKey &&
      (event.key === "ArrowUp" || event.key === "ArrowDown")
    ) {
      event.preventDefault();
      const track = chart.getTrack().getMidiTrack();
      const section = track
        ? findSection(
            track,
            this.context.getPlayheadTick(),
            event.key === "ArrowUp" ? 1 : -1,
          )
        : null;
      if (section) this.context.requestSeek(section.tick);
      return;
    }
    if (event.altKey) return;
    if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      if (this.context.getPhraseMode()) {
        this.phraseEditing.deleteSelectedPhrase();
        this.context.requestRender();
        return;
      }
      this.editing.deleteSelection();
      return;
    }
    const snap = this.coordinates.getSnapTicks();
    if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      event.preventDefault();
      this.context.requestSeek(
        getHighwaySteppedTick(
          this.context.getPlayheadTick(),
          event.key === "ArrowUp" ? 1 : -1,
          snap,
          this.context.getState().snap.enabled,
        ),
      );
      return;
    }
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      this.context.stepSnapDenominator(event.key === "ArrowLeft" ? -1 : 1);
      return;
    }
    if (/^[1-5]$/.test(event.key)) {
      event.preventDefault();
      const lane = Number(event.key) - 1;
      const note = chart
        .getNotes()
        .find(
          (candidate) =>
            candidate.start === this.context.getPlayheadTick() &&
            candidate.note - chart.getOffset() === lane,
        );
      if (note) this.editing.removeNote(chart, note, false);
      else
        this.editing.placeNoteAt(
          chart,
          lane as Note,
          this.context.getPlayheadTick(),
          event.shiftKey,
        );
      this.context.notifyNotesChanged();
      this.context.requestRender();
      return;
    }
    if (event.key === "[" || event.key === "]") {
      const track = chart.getTrack().getMidiTrack();
      const section = track
        ? findSection(
            track,
            this.context.getPlayheadTick(),
            event.key === "]" ? 1 : -1,
          )
        : null;
      if (section) this.context.requestSeek(section.tick);
    }
  };

  private updateHoveredNote(event: PointerEvent): void {
    const chart = this.getCurrentChart();
    const note = chart ? this.hitTesting.getNoteAt(chart, event) : undefined;
    const next = note?.noteOn ?? null;
    this.updateCanvasCursor(note !== undefined, event);
    if (next === this.hoveredNoteOn) return;
    this.hoveredNoteOn = next;
    this.context.requestRender();
  }

  private updateCanvasCursor(
    hoveringNote: boolean,
    event?: PointerEvent,
  ): void {
    const canvas = this.canvas;
    if (!canvas) return;
    if (!this.canEditNotes) {
      canvas.style.cursor = "default";
      return;
    }
    const phraseMode = this.context.getPhraseMode();
    if (phraseMode) {
      const chart = event ? this.getCurrentChart() : null;
      const location = event ? this.coordinates.getChartLocation(event) : null;
      const phrase =
        chart && event
          ? this.hitTesting.getPhraseAt(chart, event, phraseMode)
          : null;
      if (phrase && location) {
        const operation = this.hitTesting.getPhraseDragOperation(
          phrase,
          location.tick,
        );
        const isDragging = Boolean(event && event.buttons & 1);
        canvas.style.cursor =
          operation === "move"
            ? isDragging
              ? "grabbing"
              : "grab"
            : "ns-resize";
      } else {
        canvas.style.cursor = "default";
      }
      return;
    }
    if (hoveringNote && this.tool === "select" && event?.buttons) {
      canvas.style.cursor = event.buttons & 2 ? "ns-resize" : "grabbing";
      return;
    }
    switch (this.tool) {
      case "select":
        canvas.style.cursor = hoveringNote ? "grab" : "default";
        break;
      case "place":
        canvas.style.cursor = "default";
        break;
      case "remove":
        canvas.style.cursor = hoveringNote ? "pointer" : "default";
        break;
    }
  }

  private updateGhostLocation(event: PointerEvent): void {
    if (!this.canEditNotes) {
      this.ghostNoteLocation = null;
      return;
    }
    const chart = this.getCurrentChart();
    const location = chart ? this.coordinates.getChartLocation(event) : null;
    this.ghostNoteLocation = location
      ? {
          ...location,
          shiftKey: event.shiftKey || event.altKey,
          sustainHit:
            this.hitTesting.getSustainAt(chart!, event, location.tick) ?? null,
        }
      : null;
    this.context.requestRender();
  }

  private readonly handleModifierKey = (event: KeyboardEvent): void => {
    if (
      (event.key !== "Shift" && event.key !== "Alt") ||
      !this.ghostNoteLocation
    )
      return;
    const allowSustainOverlap = event.shiftKey || event.altKey;
    if (this.ghostNoteLocation.shiftKey === allowSustainOverlap) return;
    this.ghostNoteLocation = {
      ...this.ghostNoteLocation,
      shiftKey: allowSustainOverlap,
    };
    this.context.requestRender();
  };
}
