import type { MidiChannelEvent, MidiNote } from "@openchart/midi";
import {
  findSection,
  getNotePhrases,
  getPhrasePitch,
  type ChartView,
  type EditablePhraseKind,
  type MidiNotePhrase,
} from "@openchart/views";
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
import {
  farBoardZ,
  nearBoardZ,
  phraseAutoScrollEdgeMargin,
  phraseAutoScrollMaximumTicksPerFrame,
  wheelTicksPerPixel,
} from "./constants";
import {
  getPhraseAutoScrollDelta,
  getPhrasePointerAction,
} from "./interaction";
import type { PhraseHoverState } from "./types";
import { getDrumNoteProfile } from "./drumProfile";

function physicalLaneForNote(chart: ChartView, note: MidiNote): number {
  if (chart.getTrack().getKey() === "drums") {
    const profile = getDrumNoteProfile(note.note, chart.getOffset());
    return profile?.kind === "kick" ? 0 : (profile?.lane ?? -1);
  }
  return note.note - chart.getOffset();
}

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
  private phraseHoverState: PhraseHoverState | null = null;
  private phrasePointerEvent: PointerEvent | null = null;
  private phraseScrollFrame: number | null = null;
  private suppressNextClick = false;
  private keyboardSelectionAnchor: number | null = null;
  private readonly heldLaneNotes = new Map<
    number,
    { noteOn: MidiChannelEvent; startTick: number }
  >();

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
    canvas.addEventListener("contextmenu", this.handleContextMenu);
    canvas.addEventListener("wheel", this.handleWheel, { passive: false });
    canvas.addEventListener("pointerdown", this.handlePointerDown);
    canvas.addEventListener("pointermove", this.handlePointerMove);
    canvas.addEventListener("pointerleave", this.handlePointerLeave);
    canvas.addEventListener("pointerup", this.handlePointerUp);
    canvas.addEventListener("pointercancel", this.handlePointerCancel);
    window.addEventListener("pointerup", this.handlePointerUp);
    window.addEventListener("pointercancel", this.handlePointerCancel);
    window.addEventListener("keydown", this.handleModifierKey);
    window.addEventListener("keyup", this.handleModifierKey);
  }

  public detach(): void {
    this.cancelActiveGestures();
    this.clearKeyboardSelectionAnchor();
    for (const lane of this.heldLaneNotes.keys()) {
      this.releaseLaneNote(lane);
    }
    if (this.canvas) {
      this.canvas.removeEventListener("click", this.handleClick);
      this.canvas.removeEventListener("contextmenu", this.handleContextMenu);
      this.canvas.removeEventListener("wheel", this.handleWheel);
      this.canvas.removeEventListener("pointerdown", this.handlePointerDown);
      this.canvas.removeEventListener("pointermove", this.handlePointerMove);
      this.canvas.removeEventListener("pointerleave", this.handlePointerLeave);
      this.canvas.removeEventListener("pointerup", this.handlePointerUp);
      this.canvas.removeEventListener(
        "pointercancel",
        this.handlePointerCancel,
      );
    }
    window.removeEventListener("pointerup", this.handlePointerUp);
    window.removeEventListener("pointercancel", this.handlePointerCancel);
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

  public getPhraseHoverState(): PhraseHoverState | null {
    return this.phraseHoverState;
  }

  public clearKeyboardSelectionAnchor(): void {
    this.keyboardSelectionAnchor = null;
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
    this.stopPhraseAutoScroll();
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
    this.cancelPhraseGesture();
    this.ghostNoteLocation = null;
    this.hoveredNoteOn = null;
    this.suppressNextClick = false;
    this.context.updateMarqueeOutline(null);
    this.context.clearHoverOutline();
  }

  public cancelPhraseGesture(): void {
    const phraseDrag = this.phraseEditing.getDragState();
    if (phraseDrag && this.canvas?.hasPointerCapture(phraseDrag.pointerId)) {
      this.canvas.releasePointerCapture(phraseDrag.pointerId);
    }
    this.stopPhraseAutoScroll();
    this.phraseEditing.cancelPhraseDrag();
    this.phrasePointerEvent = null;
    this.phraseHoverState = null;
    if (phraseDrag) this.suppressNextClick = true;
  }

  private get tool(): "select" | "place" | "remove" {
    const mode = this.context.getMode();
    return mode === "stagepower" || mode === "solo" ? "select" : mode;
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
    const changed = this.editing.placeNoteAt(
      chart,
      location.lane,
      location.tick,
      event.shiftKey || event.altKey,
    );
    if (changed) this.context.notifyNotesChanged();
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
    if (!chart) return;
    const location = this.coordinates.getChartLocation(event);
    const sustainHit = location
      ? (this.hitTesting.getSustainAt(chart, event, location.tick) ?? null)
      : null;
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
      const world = this.coordinates.getWorldLocation(event);
      const inPhraseBand =
        world !== null &&
        world.x >= -3 &&
        world.x <= 3 &&
        world.z >= farBoardZ &&
        world.z <= nearBoardZ;
      const phraseAction = getPhrasePointerAction(
        existingPhrase !== undefined,
        inPhraseBand,
        note !== undefined,
      );
      if (phraseAction === "edit-phrase" && existingPhrase) {
        const tick = location?.tick ?? existingPhrase.start;
        const operation = this.hitTesting.getPhraseDragOperation(
          existingPhrase,
          tick,
          event,
        );
        this.beginPhraseGesture(
          event,
          phraseMode,
          tick,
          existingPhrase,
          operation,
        );
        return;
      }
      if (phraseAction === "create-phrase" && location) {
        this.beginPhraseGesture(
          event,
          phraseMode,
          location.tick,
          null,
          "create",
        );
        return;
      }
      this.beginMarquee(event);
      return;
    }
    if (phraseMode) return;
    if (!location && this.tool === "select" && event.button === 0) {
      this.beginMarquee(event);
      return;
    }
    if (!location) return;
    if (this.tool === "place") {
      if (event.button !== 0 || !sustainHit) return;
      event.preventDefault();
      this.canvas?.focus();
      this.suppressNextClick = true;
      const lane = physicalLaneForNote(chart, sustainHit);
      this.drag = {
        pointerId: event.pointerId,
        button: 0,
        shiftKey: event.shiftKey,
        moved: false,
        sustainHit,
        noteOn: sustainHit.noteOn,
        noteOns: [sustainHit.noteOn],
        targets: [
          {
            noteOn: sustainHit.noteOn,
            initialTick: sustainHit.start,
            initialLane: lane,
          },
        ],
        initialLane: lane,
        initialTick: sustainHit.start,
        pointerLane: location.lane,
        pointerTick: location.tick,
        resizing: true,
        changed: false,
      };
      this.canvas?.setPointerCapture(event.pointerId);
      this.context.requestRender();
      return;
    }
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
      this.beginMarquee(event);
      return;
    }
    event.preventDefault();
    this.canvas?.focus();
    this.suppressNextClick = event.button === 0;
    const selection = this.context.getSelectionContext();
    const chartNotes = chart.getNotes();
    const interactiveNotes = chartNotes.filter(
      (candidate) => physicalLaneForNote(chart, candidate) >= 0,
    );
    const chord = interactiveNotes.filter(
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
    const selectedTargets = interactiveNotes.filter((candidate) =>
      selection.isSelected(candidate.noteOn),
    );
    const resizeChord = event.button === 2;
    const targets = (resizeChord ? chord : selectedTargets).map(
      (candidate) => ({
        noteOn: candidate.noteOn,
        initialTick: candidate.start,
        initialLane: physicalLaneForNote(chart, candidate),
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
      initialLane: physicalLaneForNote(chart, note),
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
      this.phrasePointerEvent = event;
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
      this.updatePhraseAutoScroll();
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
        const dragTarget = getHighwayDragTarget(
          target.initialTick,
          target.initialLane,
          location.tick - drag.pointerTick,
          location.lane - drag.pointerLane,
          this.coordinates.getSnapTicks(),
          this.context.getState().snap.enabled,
          this.coordinates.getPhysicalLaneCount(),
        );
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
    if (!this.phraseEditing.getDragState()) this.phraseHoverState = null;
    this.context.clearHoverOutline();
    const phraseDrag = this.phraseEditing.getDragState();
    if (this.canvas) {
      this.canvas.style.cursor =
        phraseDrag?.operation === "move"
          ? "grabbing"
          : phraseDrag?.operation === "resize-start" ||
              phraseDrag?.operation === "resize-end"
            ? "ns-resize"
            : phraseDrag?.operation === "create"
              ? "default"
              : "default";
    }
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
        const phrasePitchSet = this.getPhrasePitches(chart);
        const selected = new Set(
          (chart?.getNotes() ?? [])
            .filter((note) => {
              if (phrasePitchSet.has(note.note)) return false;
              const drumProfile =
                chart?.getTrack().getKey() === "drums"
                  ? getDrumNoteProfile(note.note, chart.getOffset())
                  : null;
              if (drumProfile?.kind === "kick") {
                const noteBounds = this.hitTesting.getKickScreenBounds(note);
                return (
                  noteBounds !== null &&
                  noteBounds.right >= bounds.left &&
                  noteBounds.left <= bounds.right &&
                  noteBounds.bottom >= bounds.top &&
                  noteBounds.top <= bounds.bottom
                );
              }
              const noteBounds = this.hitTesting.getGemScreenBounds(
                note,
                chart ? physicalLaneForNote(chart, note) : -1,
                drumProfile?.kind === "pad" || drumProfile?.kind === "cymbal"
                  ? drumProfile.kind
                  : "note",
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
        const phraseMode = this.context.getPhraseMode();
        if (chart && phraseMode) {
          this.phraseEditing.selectPhrases(
            this.getPhrasesInMarquee(chart, phraseMode, bounds),
            marquee.additive,
          );
        }
      } else if (!marquee.additive && !this.context.getPhraseMode()) {
        this.context.getSelectionContext().clear();
      }
      this.context.updateMarqueeOutline(null);
      this.updateCanvasCursor(false, event);
      this.context.requestRender();
      return;
    }

    const phraseDrag = this.phraseEditing.getDragState();
    if (phraseDrag?.pointerId === event.pointerId) {
      this.stopPhraseAutoScroll();
      this.phrasePointerEvent = null;
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
        changed = this.editing.placeNoteAt(
          chart,
          lane,
          drag.pointerTick,
          drag.shiftKey || event.altKey,
          drag.sustainHit,
        );
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

  private readonly handlePointerCancel = (event: PointerEvent): void => {
    if (this.phraseEditing.getDragState()?.pointerId === event.pointerId) {
      this.cancelPhraseGesture();
      this.suppressNextClick = false;
      this.updateCanvasCursor(false, event);
      this.context.requestRender();
      return;
    }
    if (this.marqueeDrag?.pointerId === event.pointerId) {
      this.canvas?.releasePointerCapture(event.pointerId);
      this.marqueeDrag = null;
      this.suppressNextClick = false;
      this.context.updateMarqueeOutline(null);
      this.context.requestRender();
      return;
    }
    if (this.drag?.pointerId === event.pointerId) this.handlePointerUp(event);
  };

  private readonly handleWheel = (event: WheelEvent): void => {
    event.preventDefault();
    const nextTick = getHighwayWheelTick(
      this.context.getCameraTick(),
      -event.deltaY,
      this.context.getPpqn(),
      wheelTicksPerPixel,
    );
    this.context.setCameraTick(nextTick);
    if (this.context.getState().lockCursor) {
      this.context.requestSeek(
        getHighwayWheelTick(
          this.context.getPlayheadTick(),
          -event.deltaY,
          this.context.getPpqn(),
          wheelTicksPerPixel,
        ),
      );
    }
    this.updateHoveredNote(event);
    this.updateGhostLocation(event);
  };

  // Keyboard commands. Hotkeys are declared in `src/input/highway.ts` and reach
  // the view through actions; these methods are the view-side implementations.

  /** Adds or removes the note in `lane` (0-based) at the playhead. */
  public toggleLaneNote(lane: number, preserveSustain = false): void {
    if (!this.canEditNotes || this.context.getPhraseMode()) return;
    const chart = this.getCurrentChart();
    if (!chart) return;
    const playheadTick = this.context.getPlayheadTick();
    const note = chart
      .getNotes()
      .find(
        (candidate) =>
          candidate.start === playheadTick &&
          physicalLaneForNote(chart, candidate) === lane &&
          (chart.getTrack().getKey() !== "drums" ||
            getDrumNoteProfile(candidate.note, chart.getOffset())?.kind ===
              this.context.getDrumPlacementKind()),
      );
    let releaseHeldNote = false;
    if (note) {
      this.editing.removeNote(chart, note, false);
      releaseHeldNote = this.heldLaneNotes.delete(lane);
    } else {
      const previousNotes = new Set(
        chart.getNotes().map((candidate) => candidate.noteOn),
      );
      this.context.beginEdit();
      const changed = this.editing.placeNoteAt(
        chart,
        lane,
        playheadTick,
        preserveSustain,
      );
      if (!changed) {
        this.context.endEdit();
        return;
      }
      const placedNote = chart
        .getNotes()
        .find(
          (candidate) =>
            !previousNotes.has(candidate.noteOn) &&
            candidate.start === playheadTick &&
            physicalLaneForNote(chart, candidate) === lane,
        );
      if (placedNote) {
        this.heldLaneNotes.set(lane, {
          noteOn: placedNote.noteOn,
          startTick: placedNote.start,
        });
      } else {
        this.context.endEdit();
      }
    }
    this.context.notifyNotesChanged();
    if (releaseHeldNote) this.context.endEdit();
    this.context.requestRender();
  }

  /** Ends a held lane's sustain edit and commits its history transaction. */
  public releaseLaneNote(lane: number): void {
    if (!this.heldLaneNotes.delete(lane)) return;
    this.context.endEdit();
  }

  /** Moves the playhead one snap interval (or tick step) forward/backward. */
  public stepPlayhead(direction: -1 | 1, extendSelection = false): void {
    const chart = this.getCurrentChart();
    if (!this.canEditNotes || !chart) return;
    const currentTick = this.context.getPlayheadTick();
    const nextTick = getHighwaySteppedTick(
      currentTick,
      direction,
      this.coordinates.getSnapTicks(),
      this.context.getState().snap.enabled,
    );
    if (extendSelection) {
      this.keyboardSelectionAnchor ??= currentTick;
      const start = Math.min(this.keyboardSelectionAnchor, nextTick);
      const end = Math.max(this.keyboardSelectionAnchor, nextTick);
      this.context.setSelectionRange({ start, end });
      // Same selection context as the mouse marquee, so copy/cut/paste behave identically.
      const phrasePitches = this.getPhrasePitches(chart);
      this.context.getSelectionContext().set(
        chart
          .getNotes()
          .filter(
            (note) =>
              !phrasePitches.has(note.note) &&
              note.start >= start &&
              note.start < end,
          )
          .map((note) => note.noteOn),
      );
    }
    let changed = false;
    const chartNotes = chart.getNotes();
    for (const [lane, held] of this.heldLaneNotes) {
      const note = chartNotes.find(
        (candidate) => candidate.noteOn === held.noteOn,
      );
      if (!note) {
        this.releaseLaneNote(lane);
        continue;
      }
      const otherNoteStarts = chartNotes
        .filter((candidate) => candidate.noteOn !== held.noteOn)
        .map((candidate) => candidate.start);
      const nextEnd = getHighwaySustainEnd(
        held.startTick,
        nextTick,
        otherNoteStarts,
      );
      if (note.end !== nextEnd) {
        changed = this.editing.resizeNote(chart, note, nextEnd) || changed;
      }
    }
    if (changed) this.context.notifyNotesChanged();
    this.context.requestSeek(nextTick);
    if (changed) this.context.requestRender();
  }

  /** Seeks to the next (1) or previous (-1) section marker. */
  public seekSection(direction: -1 | 1): void {
    if (!this.canEditNotes) return;
    const chart = this.getCurrentChart();
    const track = chart?.getTrack().getMidiTrack();
    const section = track
      ? findSection(track, this.context.getPlayheadTick(), direction)
      : null;
    if (section) this.context.requestSeek(section.tick);
  }

  /** Deletes selected notes, or the selected phrase while a phrase tool is on. */
  public deleteSelection(): void {
    if (!this.canEditNotes || !this.getCurrentChart()) return;
    if (this.context.getPhraseMode()) {
      this.phraseEditing.deleteSelectedPhrase();
      this.context.requestRender();
      return;
    }
    this.editing.deleteSelection();
  }

  private updateHoveredNote(event: MouseEvent): void {
    if (this.context.getPhraseMode()) {
      this.updatePhraseHover(event);
      return;
    }
    const chart = this.getCurrentChart();
    const note = chart ? this.hitTesting.getNoteAt(chart, event) : undefined;
    const next = note?.noteOn ?? null;
    this.updateCanvasCursor(note !== undefined, event);
    if (next === this.hoveredNoteOn) return;
    this.hoveredNoteOn = next;
    this.context.requestRender();
  }

  private updateCanvasCursor(hoveringNote: boolean, event?: MouseEvent): void {
    const canvas = this.canvas;
    if (!canvas) return;
    if (!this.canEditNotes) {
      canvas.style.cursor = "default";
      return;
    }
    const phraseMode = this.context.getPhraseMode();
    if (phraseMode) {
      const activeDrag = this.phraseEditing.getDragState();
      const pointerId =
        event && "pointerId" in event ? event.pointerId : undefined;
      if (activeDrag && pointerId === activeDrag.pointerId) {
        canvas.style.cursor =
          activeDrag.operation === "move"
            ? "grabbing"
            : activeDrag.operation === "create"
              ? "default"
              : "ns-resize";
        return;
      }
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
          event,
        );
        const isDragging = Boolean(event && event.buttons & 1);
        canvas.style.cursor =
          operation === "move"
            ? isDragging
              ? "grabbing"
              : "grab"
            : "ns-resize";
      } else {
        canvas.style.cursor =
          this.phraseHoverState?.operation === "resize-start" ||
          this.phraseHoverState?.operation === "resize-end"
            ? "ns-resize"
            : this.phraseHoverState?.operation === "move"
              ? "grab"
              : this.phraseHoverState?.operation === "create"
                ? "default"
                : "default";
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

  private updateGhostLocation(event: MouseEvent): void {
    if (!this.canEditNotes || this.context.getPhraseMode()) {
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
    if (event.key === "Shift" && event.type === "keyup") {
      this.clearKeyboardSelectionAnchor();
    }
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

  private beginMarquee(event: PointerEvent): void {
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
  }

  private beginPhraseGesture(
    event: PointerEvent,
    kind: EditablePhraseKind,
    tick: number,
    phrase: MidiNotePhrase | null | undefined,
    operation: "create" | "move" | "resize-start" | "resize-end",
  ): void {
    this.phraseEditing.beginPhraseDrag(
      event.pointerId,
      kind,
      tick,
      phrase ?? null,
      operation,
    );
    this.phrasePointerEvent = event;
    this.phraseHoverState = {
      noteOn: phrase?.note.noteOn ?? null,
      operation,
      placementTick: operation === "create" ? tick : null,
    };
    if (this.canvas) {
      this.canvas.style.cursor =
        operation === "move"
          ? "grabbing"
          : operation === "create"
            ? "default"
            : "ns-resize";
    }
    this.canvas?.setPointerCapture(event.pointerId);
    this.context.requestRender();
  }

  private updatePhraseHover(event: MouseEvent): void {
    const chart = this.getCurrentChart();
    const kind = this.context.getPhraseMode();
    if (!chart || !kind) return;
    const phrase = this.hitTesting.getPhraseAt(chart, event, kind);
    const location = this.coordinates.getChartLocation(event);
    const world = this.coordinates.getWorldLocation(event);
    const sustainHit = location
      ? this.hitTesting.getSustainAt(chart, event, location.tick)
      : undefined;
    const noteHit = sustainHit ?? this.hitTesting.getNoteAt(chart, event);
    const inPhraseBand =
      world !== null &&
      world.x >= -3 &&
      world.x <= 3 &&
      world.z >= farBoardZ &&
      world.z <= nearBoardZ;
    const next: PhraseHoverState =
      phrase && location
        ? {
            noteOn: phrase.note.noteOn,
            operation: this.hitTesting.getPhraseDragOperation(
              phrase,
              location.tick,
              event,
            ),
            placementTick: null,
          }
        : {
            noteOn: null,
            operation: inPhraseBand && !noteHit ? "create" : null,
            placementTick:
              inPhraseBand && !noteHit ? (location?.tick ?? null) : null,
          };
    const previous = this.phraseHoverState;
    if (
      previous?.noteOn === next.noteOn &&
      previous?.operation === next.operation &&
      previous?.placementTick === next.placementTick
    )
      return;
    this.phraseHoverState = next;
    this.updateCanvasCursor(false, event);
    this.context.requestRender();
  }

  private getPhrasePitches(chart: ChartView | null): Set<number> {
    if (!chart) return new Set();
    const descriptor = chart
      .getSong()
      .getTrackDescriptors()
      .find((item) => item.key === chart.getTrack().getKey());
    if (!descriptor) return new Set();
    return new Set(
      (["solo", "stagepower"] as const)
        .map((kind) => getPhrasePitch(descriptor, kind))
        .filter((pitch): pitch is number => pitch !== null),
    );
  }

  private getPhrasesInMarquee(
    chart: ChartView,
    kind: EditablePhraseKind,
    bounds: { left: number; right: number; top: number; bottom: number },
  ): MidiChannelEvent[] {
    const track = chart.getTrack().getMidiTrack();
    const descriptor = chart
      .getSong()
      .getTrackDescriptors()
      .find((item) => item.key === chart.getTrack().getKey());
    const pitch = descriptor ? getPhrasePitch(descriptor, kind) : null;
    if (!track || pitch === null) return [];
    return getNotePhrases(track, pitch, kind)
      .filter((phrase) => {
        const phraseBounds = this.hitTesting.getPhraseScreenBounds(phrase);
        return (
          phraseBounds !== null &&
          phraseBounds.right >= bounds.left &&
          phraseBounds.left <= bounds.right &&
          phraseBounds.bottom >= bounds.top &&
          phraseBounds.top <= bounds.bottom
        );
      })
      .map((phrase) => phrase.note.noteOn);
  }

  private updatePhraseAutoScroll(): void {
    const drag = this.phraseEditing.getDragState();
    const pointer = this.phrasePointerEvent;
    if (
      !drag ||
      !pointer ||
      (drag.operation !== "resize-start" && drag.operation !== "resize-end")
    ) {
      this.stopPhraseAutoScroll();
      return;
    }
    const bounds = this.canvas?.getBoundingClientRect();
    const delta = bounds
      ? getPhraseAutoScrollDelta(
          pointer.clientY - bounds.top,
          bounds.height,
          drag.operation,
          phraseAutoScrollEdgeMargin,
          phraseAutoScrollMaximumTicksPerFrame,
        )
      : 0;
    if (delta === 0) {
      this.stopPhraseAutoScroll();
      return;
    }
    if (this.phraseScrollFrame !== null) return;
    this.phraseScrollFrame = requestAnimationFrame(() => {
      this.phraseScrollFrame = null;
      const currentDrag = this.phraseEditing.getDragState();
      const currentPointer = this.phrasePointerEvent;
      const currentBounds = this.canvas?.getBoundingClientRect();
      if (
        !currentDrag ||
        !currentPointer ||
        !currentBounds ||
        (currentDrag.operation !== "resize-start" &&
          currentDrag.operation !== "resize-end")
      )
        return;
      const scroll = getPhraseAutoScrollDelta(
        currentPointer.clientY - currentBounds.top,
        currentBounds.height,
        currentDrag.operation,
        phraseAutoScrollEdgeMargin,
        phraseAutoScrollMaximumTicksPerFrame,
      );
      if (scroll === 0) return;
      this.context.setCameraTick(this.context.getCameraTick() + scroll);
      const location = this.coordinates.getChartLocation(currentPointer);
      if (location) this.phraseEditing.updatePhraseDrag(location.tick);
      this.context.requestRender();
      this.updatePhraseAutoScroll();
    });
  }

  private stopPhraseAutoScroll(): void {
    if (this.phraseScrollFrame === null) return;
    cancelAnimationFrame(this.phraseScrollFrame);
    this.phraseScrollFrame = null;
  }
}
