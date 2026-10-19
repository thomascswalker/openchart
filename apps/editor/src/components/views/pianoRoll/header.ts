import {
  MetaType,
  type IEvent,
  type Midi,
  type TempoEvent,
  type TextEvent,
  type TimeSignatureEvent,
} from "@openchart/core";
import type { CSSProperties } from "react";
import type { Vector2 } from "three";
import { applyStyle } from "../../../util/css";
import {
  DefaultMicrosecondsPerQuarterNote,
  DefaultTimeSignature,
  HeaderHeight,
  HeaderLaneHeight,
  HeaderMarkerHitRadius,
  HeaderMarkerLabelHeight,
  HeaderMarkerLabelWidth,
  KeyboardWidth,
} from "./constants";
import type { CoordinateSystem } from "./coordinates";
import type { LyricPromptHandlers, PianoRollContext } from "./types";
import { IController } from "./controller";
import type { PianoRollHeaderOptions } from "./profile";
import {
  parseTempoString,
  parseTimeSignatureString,
} from "../../../audio/musicalTime";

/** The rows of the header strip. */
export type HeaderLane = "tempo" | "timeSignature" | "text";

/** Every lane, in display order; the header shows all of them by default. */
export const DefaultHeaderLanes: readonly HeaderLane[] = [
  "tempo",
  "timeSignature",
  "text",
];

/** Any event that can appear as a header marker. */
type HeaderMarkerEvent = TempoEvent | TimeSignatureEvent | TextEvent;

/** Inclusive range of ticks. */
interface TickRange {
  /** First tick of the range. */
  start: number;

  /** Last tick of the range. */
  end: number;
}

/** Identifies a marker by its lane and tick. */
interface MarkerReference {
  /** Lane the marker is in. */
  lane: HeaderLane;

  /** Tick the marker sits at. */
  tick: number;
}

/**
 * What happened when an edited value was applied: `rejected` means the text
 * could not be parsed and editing should continue.
 */
type MarkerEditOutcome = "rejected" | "unchanged" | "changed";

/** An open lyric prompt: where it sits and who to tell when it ends. */
interface LyricPrompt {
  /** Tick the prompt is anchored to. */
  tick: number;

  /** Callbacks for commit, cancel and Tab. */
  handlers: LyricPromptHandlers;
}

/** How a lyric prompt ended. */
type PromptFinish = "commit" | "tab" | "blur";

/** Microseconds in one minute, to convert between BPM and MIDI tempo. */
const MicrosecondsPerMinute = 60_000_000;

/** Text a new section marker is created with. */
const NewSectionMarkerText = "[section New]";

/** Pixels between a marker's tick and the start of its label. */
const MarkerLabelOffset = 3;

/** Pixels kept between a clipped label and the next one. */
const ClippedLabelGap = 4;

/** Pixels between the edit input and the delete button beside it. */
const DeleteButtonGap = 2;

/** Width assumed for the edit input before the browser has laid it out. */
const FallbackInputWidth = 48;

/** Style of every marker label. */
const MARKER_LABEL_STYLE: CSSProperties = {
  position: "absolute",
  color: "#ccc",
  font: "11px sans-serif",
  whiteSpace: "nowrap",
  pointerEvents: "none",
};

/** Style of the box highlighting the hovered marker. */
const MARKER_HIGHLIGHT_STYLE: CSSProperties = {
  position: "absolute",
  background: "rgba(255, 0, 0, 0.3)",
  pointerEvents: "none",
};

/** Converts a MIDI tempo to beats per minute. */
function toBeatsPerMinute(microsecondsPerQuarterNote: number): number {
  return Math.round(MicrosecondsPerMinute / microsecondsPerQuarterNote);
}

/** Converts beats per minute to a MIDI tempo. */
function toMicrosecondsPerQuarterNote(beatsPerMinute: number): number {
  return Math.round(MicrosecondsPerMinute / beatsPerMinute);
}

/** Label text of a tempo marker, e.g. "♪=120". */
function formatTempoLabel(event: TempoEvent): string {
  return `\u266a=${toBeatsPerMinute(event.microsecondsPerQuarterNote)}`;
}

/** Text of a time signature, e.g. "6/8"; the denominator is a power of two. */
function formatTimeSignatureLabel(event: TimeSignatureEvent): string {
  return `${event.numerator}/${2 ** event.denominator}`;
}

/** Label text of a text marker. */
function formatTextLabel(event: TextEvent): string {
  return event.text;
}

/** True when the lanes are the same lanes in the same order. */
function haveSameLanes(
  first: readonly HeaderLane[],
  second: readonly HeaderLane[],
): boolean {
  return (
    first.length === second.length &&
    first.every((lane, index) => lane === second[index])
  );
}

/** Manages header markers, inline editing, and lyric prompts for the piano roll. */
export class HeaderController extends IController {
  /** Lanes currently shown, top to bottom. */
  #visibleLanes: readonly HeaderLane[];

  /** Marker under the pointer, if any. */
  #hoveredMarker: MarkerReference | null = null;

  /** Element the header's DOM is appended to; null while unmounted. */
  #host: HTMLElement | null = null;

  /** Line drawn under the header. */
  #bottomBorderRef: HTMLDivElement | null = null;

  /** Inline input used for editing markers and entering lyrics. */
  #editInputRef: HTMLInputElement | null = null;

  /** Button that deletes the hovered marker. */
  #deleteButtonRef: HTMLButtonElement | null = null;

  /** Key of the marker whose value the input currently shows. */
  #editingMarkerKey: string | null = null;

  /** Marker being edited in the input, if any. */
  #editingMarker: MarkerReference | null = null;

  /** Text marker being dragged to a new tick, if any. */
  #draggingText: TextEvent | null = null;

  /** Open lyric prompt, if any. */
  #prompt: LyricPrompt | null = null;

  /** Key of the prompt whose initial text the input currently shows. */
  #promptKey: string | null = null;

  /** Width of the header in pixels, set by the renderer each frame. */
  #width: number = 0;

  /** Reusable marker labels for each lane. */
  readonly #labelPools: Record<HeaderLane, HTMLDivElement[]> = {
    tempo: [],
    timeSignature: [],
    text: [],
  };

  /** Reusable highlight boxes, indexed by marker position within its lane. */
  readonly #highlightRefs: HTMLDivElement[] = [];

  public constructor(
    context: PianoRollContext,
    coordinates: CoordinateSystem,
    visibleLanes: readonly HeaderLane[] = DefaultHeaderLanes,
  ) {
    super(context, coordinates);
    this.#visibleLanes = [...new Set(visibleLanes)];
  }

  /** Width of the header in pixels. */
  get width(): number {
    return this.#width;
  }

  set width(value: number) {
    this.#width = value;
  }

  /** Lanes currently shown, top to bottom. */
  public get visibleLanes(): readonly HeaderLane[] {
    return this.#visibleLanes;
  }

  /** Whether an inline lyric prompt is currently open. */
  public get isPrompting(): boolean {
    return this.#prompt !== null;
  }

  /** Returns the active header display options from the current profile. */
  private get options(): PianoRollHeaderOptions {
    return this.context.getProfile().header;
  }

  /** Attaches the header's border, edit input and delete button to `host`. */
  public mount(host: HTMLElement): void {
    this.#host = host;

    const bottomBorder = document.createElement("div");
    applyStyle(bottomBorder, {
      position: "absolute",
      left: "0",
      height: "0",
      pointerEvents: "none",
      borderBottom: "var(--border-primary)",
    });
    host.appendChild(bottomBorder);
    this.#bottomBorderRef = bottomBorder;

    this.createEditInput();
    this.createDeleteButton();
  }

  /** Removes every DOM element the header created and resets its state. */
  public destroy(): void {
    // Remove HTML elements.
    this.#bottomBorderRef?.remove();
    this.#bottomBorderRef = null;
    this.#editInputRef?.remove();
    this.#editInputRef = null;
    this.#deleteButtonRef?.remove();
    this.#deleteButtonRef = null;

    for (const labels of Object.values(this.#labelPools)) {
      labels.forEach((label) => label.remove());
      labels.length = 0;
    }
    this.#highlightRefs.forEach((highlight) => highlight.remove());
    this.#highlightRefs.length = 0;

    // Forget interaction state.
    this.#host = null;
    this.#hoveredMarker = null;
    this.#editingMarkerKey = null;
    this.#editingMarker = null;
    this.#prompt = null;
    this.#promptKey = null;
  }

  /** Redraws marker labels and positions the edit controls. */
  public draw(): void {
    if (!this.#host) return;

    this.positionBottomBorder();

    // Reset highlights before marking the currently hovered marker.
    this.#highlightRefs.forEach((highlight) => {
      highlight.style.display = "none";
    });

    const { start, end } = this.getVisibleRange();
    const isInView = (event: { tick: number }): boolean =>
      event.tick >= start && event.tick <= end;

    this.drawLane(
      "tempo",
      this.context.getTempoEvents().filter(isInView),
      formatTempoLabel,
    );
    this.drawLane(
      "timeSignature",
      this.context.getTimeSignatureEvents().filter(isInView),
      formatTimeSignatureLabel,
    );
    this.drawLane(
      "text",
      this.context.getTextEvents().filter(isInView),
      formatTextLabel,
    );

    // After drawing the markers, sync the edit controls.
    this.syncEditControls();
  }

  /**
   * Opens the inline text input at `tick` for a lyric. Used right after a
   * vocal note is created and when Tab moves to a note with no lyric yet.
   */
  public promptText(tick: number, handlers: LyricPromptHandlers): void {
    if (this.#prompt) this.cancelPrompt();

    this.#editingMarker = null;
    this.#prompt = { tick, handlers };
    this.#promptKey = null;
    this.syncEditControls();
  }

  /** Closes the prompt without committing (e.g. playback started). */
  public cancelPrompt(): void {
    const prompt = this.#prompt;
    if (!prompt) return;

    this.#prompt = null;
    this.#promptKey = null;
    this.#editInputRef?.blur();
    prompt.handlers.onCancel();
    this.syncEditControls();
  }

  /** Opens the edit input on the existing text event at `tick`. */
  public editTextAt(tick: number): void {
    if (this.#prompt) this.cancelPrompt();

    this.#editingMarker = { lane: "text", tick };
    this.#editingMarkerKey = null;
    this.syncEditControls();
  }

  /** Returns the inline edit input, if it has been mounted. */
  public getEditInput(): HTMLInputElement | null {
    return this.#editInputRef;
  }

  /** Returns the marker delete button, if it has been mounted. */
  public getDeleteButton(): HTMLButtonElement | null {
    return this.#deleteButtonRef;
  }

  /** Sets the lanes rendered and hit-tested by the header. */
  public setVisibleLanes(lanes: readonly HeaderLane[]): void {
    const visibleLanes = [...new Set(lanes)];
    if (haveSameLanes(visibleLanes, this.#visibleLanes)) return;

    this.#visibleLanes = visibleLanes;

    // Drop interaction state that points at a lane that is no longer shown.
    if (
      this.#hoveredMarker &&
      !visibleLanes.includes(this.#hoveredMarker.lane)
    ) {
      this.#hoveredMarker = null;
    }
    if (
      this.#editingMarker &&
      !visibleLanes.includes(this.#editingMarker.lane)
    ) {
      this.#editingMarker = null;
      this.#editingMarkerKey = null;
    }

    this.context.requestRender();
  }

  /** Resolves the header lane containing the given local vertical coordinate. */
  public laneAt(y: number): HeaderLane | null {
    if (y < 0 || y >= HeaderHeight || this.#visibleLanes.length === 0) {
      return null;
    }

    const laneHeight = HeaderHeight / this.#visibleLanes.length;
    const index = Math.min(
      Math.floor(y / laneHeight),
      this.#visibleLanes.length - 1,
    );

    return this.#visibleLanes[index];
  }

  /** Updates the hovered marker and synchronizes the inline controls. */
  public updateHover(local: Vector2 | null): void {
    this.#hoveredMarker = local ? this.findMarkerReferenceAt(local) : null;
    this.syncEditControls();
  }

  /** Adds a default marker to an empty lane at the clicked tick. */
  public click(point: Vector2): void {
    if (this.context.getState().isPlaying) return;

    const midi = this.context.getMidi();
    const lane = this.laneAt(point.y);
    if (!midi || !lane) return;

    // Clicking an existing marker never creates another one.
    if (this.findMarkerNearInLane(lane, point.x)) return;

    // Create the lane-specific default value at the snapped tick.
    const tick = this.coordinates.snapTick(
      this.coordinates.tickAtScreenX(point.x),
    );
    if (this.createDefaultMarker(midi, lane, tick)) this.notifyMarkersChanged();

    this.context.requestRender();
  }

  /** Removes the marker under the pointer when the matching lane permits deletion. */
  public rightClick(x: number, y: number): void {
    if (this.context.getState().isPlaying) return;

    const midi = this.context.getMidi();
    const lane = this.laneAt(y);
    if (!midi || !lane) return;

    const marker = this.findMarkerNearInLane(lane, x);
    if (marker && this.removeMarker(lane, marker.tick)) {
      this.notifyMarkersChanged();
    }

    this.context.requestRender();
  }

  /** Starts dragging a text marker when text dragging is enabled. */
  public beginDrag(point: Vector2): void {
    if (this.context.getState().isPlaying) return;
    if (this.laneAt(point.y) !== "text" || !this.options.dragText) return;

    this.#draggingText = this.findTextEventNear(point.x);
    if (this.#draggingText) this.context.beginEdit();
  }

  /** Moves the active text marker to the nearest snapped tick. */
  public updateDrag(point: Vector2): void {
    if (!this.#draggingText || this.context.getState().isPlaying) return;

    const tick = this.coordinates.snapTickToNearest(
      this.coordinates.tickAtScreenX(point.x),
    );
    const track = this.context.getSelectedTrack();
    if (!track?.moveEvent(this.#draggingText, tick)) return;

    this.context.notifyNotesChanged();
    this.context.requestRender();
  }

  /** Ends an active text-marker drag and closes its edit transaction. */
  public endDrag(): void {
    const hadDrag = this.#draggingText !== null;
    this.#draggingText = null;

    if (hadDrag) this.context.endEdit();
  }

  /** Places the line under the header and sizes it to the header width. */
  private positionBottomBorder(): void {
    if (!this.#bottomBorderRef) return;

    this.#bottomBorderRef.style.top = `${HeaderHeight - 1}px`;
    this.#bottomBorderRef.style.width = `${this.#width}px`;
  }

  /** Calculates the tick range currently visible within the header viewport. */
  private getVisibleRange(): TickRange {
    const visibleWidth = Math.max(0, this.width - KeyboardWidth);
    const visibleStart = this.coordinates.getCamera().x;
    const visibleEnd = this.coordinates.tickAtScreenX(
      KeyboardWidth + visibleWidth,
    );

    return { start: visibleStart, end: visibleEnd };
  }

  /** Draws one lane's markers, or hides its labels when the lane is off. */
  private drawLane<T extends IEvent>(
    lane: HeaderLane,
    events: T[],
    formatText: (event: T) => string,
  ): void {
    const labels = this.#labelPools[lane];
    const laneIndex = this.#visibleLanes.indexOf(lane);

    if (laneIndex === -1) {
      labels.forEach((label) => {
        label.style.display = "none";
      });
      return;
    }

    const y = (HeaderHeight / this.#visibleLanes.length) * laneIndex;
    this.drawMarkers(lane, labels, events, y, formatText);
  }

  /** Creates or updates marker labels and highlights for one lane. */
  private drawMarkers<T extends IEvent>(
    lane: HeaderLane,
    labels: HTMLDivElement[],
    events: T[],
    y: number,
    formatText: (event: T) => string,
  ): void {
    events.forEach((event, index) => {
      const label = this.getMarkerLabel(labels, index);
      const x = this.coordinates.screenXForTick(event.tick);

      if (this.isHovered(lane, event.tick)) this.drawHighlight(index, x, y);

      label.textContent = formatText(event);
      this.limitLabelWidth(lane, label, x, events[index + 1]);
      label.style.left = `${x + MarkerLabelOffset}px`;
      label.style.top = `${y}px`;
      label.style.display = x >= KeyboardWidth ? "block" : "none";
    });

    // Hide labels left over from a frame that had more markers.
    for (let index = events.length; index < labels.length; index++) {
      labels[index].style.display = "none";
    }
  }

  /** True when the marker at `tick` in `lane` is the hovered one. */
  private isHovered(lane: HeaderLane, tick: number): boolean {
    return (
      this.#hoveredMarker?.lane === lane && this.#hoveredMarker.tick === tick
    );
  }

  /** Gets the label at `index` in `labels`, creating it if it is new. */
  private getMarkerLabel(
    labels: HTMLDivElement[],
    index: number,
  ): HTMLDivElement {
    let label = labels[index];
    if (label) return label;

    label = document.createElement("div");
    applyStyle(label, MARKER_LABEL_STYLE);
    labels[index] = label;
    this.#host?.appendChild(label);

    return label;
  }

  /**
   * Lyrics are dense, so clipped lanes stop each label at the next one's X.
   * Other lanes let labels grow freely.
   */
  private limitLabelWidth(
    lane: HeaderLane,
    label: HTMLDivElement,
    x: number,
    next: IEvent | undefined,
  ): void {
    if (lane !== "text" || !this.options.clipLabels) {
      label.style.maxWidth = "";
      return;
    }

    label.style.maxWidth = next
      ? `${Math.max(
          0,
          this.coordinates.screenXForTick(next.tick) - x - ClippedLabelGap,
        )}px`
      : "";
    label.style.overflow = "hidden";
    label.style.textOverflow = "clip";
  }

  /** Shows the hover highlight for the marker at `index`, at `x` and `y`. */
  private drawHighlight(index: number, x: number, y: number): void {
    const highlight = this.getHighlight(index);

    highlight.style.display = "block";
    highlight.style.left = `${x}px`;
    highlight.style.top = `${y}px`;
    highlight.style.width = `${HeaderMarkerLabelWidth}px`;
    highlight.style.height = `${HeaderMarkerLabelHeight}px`;
  }

  /** Returns the highlight element for a marker, creating it on demand. */
  private getHighlight(index: number): HTMLDivElement {
    let highlight = this.#highlightRefs[index];
    if (highlight) return highlight;

    highlight = document.createElement("div");
    applyStyle(highlight, MARKER_HIGHLIGHT_STYLE);
    this.#highlightRefs[index] = highlight;
    this.#host?.appendChild(highlight);

    return highlight;
  }

  /** The marker under `local`, if the pointer is over one. */
  private findMarkerReferenceAt(local: Vector2): MarkerReference | null {
    const lane = this.laneAt(local.y);
    if (!lane || !this.context.getMidi()) return null;

    const marker = this.findMarkerNearInLane(lane, local.x);
    return marker ? { lane, tick: marker.tick } : null;
  }

  /** Events that belong to a lane. */
  private getLaneEvents(lane: HeaderLane): HeaderMarkerEvent[] {
    switch (lane) {
      case "tempo":
        return this.context.getTempoEvents();
      case "timeSignature":
        return this.context.getTimeSignatureEvents();
      case "text":
        return this.context.getTextEvents();
    }
  }

  /** Finds the marker in `lane` nearest the given horizontal coordinate. */
  private findMarkerNearInLane(
    lane: HeaderLane,
    x: number,
  ): HeaderMarkerEvent | null {
    return this.findMarkerNear(this.getLaneEvents(lane), x);
  }

  /** Finds the text marker nearest the given horizontal coordinate. */
  private findTextEventNear(x: number): TextEvent | null {
    return this.findMarkerNear(this.context.getTextEvents(), x);
  }

  /** Selects the closest marker whose hit area contains the given coordinate. */
  private findMarkerNear<T extends { tick: number }>(
    events: T[],
    x: number,
  ): T | null {
    let closest: T | null = null;
    let closestDistance = Infinity;

    for (const event of events) {
      const markerX = this.coordinates.screenXForTick(event.tick);

      // The hit area runs from just left of the tick to the end of the label.
      if (
        x < markerX - HeaderMarkerHitRadius ||
        x > markerX + HeaderMarkerLabelWidth
      ) {
        continue;
      }

      const distance = Math.abs(markerX - x);
      if (distance < closestDistance) {
        closest = event;
        closestDistance = distance;
      }
    }

    return closest;
  }

  /** Returns the tempo value effective at the given tick. */
  private effectiveTempoAt(tick: number): number {
    const tempoEvents = this.context.getTempoEvents();
    let value =
      tempoEvents[0]?.microsecondsPerQuarterNote ??
      DefaultMicrosecondsPerQuarterNote;

    for (const event of tempoEvents) {
      if (event.tick > tick) break;
      value = event.microsecondsPerQuarterNote;
    }

    return value;
  }

  /** Returns the time signature effective at the given tick. */
  private effectiveTimeSignatureAt(tick: number): {
    numerator: number;
    denominator: number;
  } {
    const events = this.context.getTimeSignatureEvents();
    let value = events[0] ?? DefaultTimeSignature;

    for (const event of events) {
      if (event.tick > tick) break;
      value = event;
    }

    return { numerator: value.numerator, denominator: value.denominator };
  }

  /**
   * Adds the default marker for `lane` at `tick`, copying the value in effect
   * there. Returns whether the document changed.
   */
  private createDefaultMarker(
    midi: Midi,
    lane: HeaderLane,
    tick: number,
  ): boolean {
    if (lane === "tempo") {
      midi.addTempoEvent(tick, this.effectiveTempoAt(tick));
      return true;
    }

    if (lane === "timeSignature") {
      const current = this.effectiveTimeSignatureAt(tick);
      midi.addTimeSignatureEvent(tick, current.numerator, current.denominator);
      return true;
    }

    if (!this.options.createOnClick) return false;

    const track = this.context.getSelectedTrack();
    if (!track) return false;

    track.addTextEvent(MetaType.Marker, tick, NewSectionMarkerText);
    return true;
  }

  /**
   * Removes the marker at `tick` in `lane`. Text markers are only removed when
   * the profile allows it. Returns whether the document changed.
   */
  private removeMarker(lane: HeaderLane, tick: number): boolean {
    const midi = this.context.getMidi();
    if (!midi) return false;

    if (lane === "tempo") return midi.removeTempoEventAt(tick);
    if (lane === "timeSignature") return midi.removeTimeSignatureEventAt(tick);
    if (!this.options.deleteText) return false;

    const text = this.findTextEventNear(this.coordinates.screenXForTick(tick));
    if (!text) return false;

    return this.context.getSelectedTrack()?.removeEvent(text) ?? false;
  }

  /** Tells the host that tempo, signature or text markers changed. */
  private notifyMarkersChanged(): void {
    this.context.invalidateTempoCache();
    this.context.notifyNotesChanged();
  }

  /** Finishes a lyric prompt by committing, advancing with Tab, or cancelling. */
  private finishPrompt(mode: PromptFinish): void {
    const prompt = this.#prompt;
    const input = this.#editInputRef;
    if (!prompt || !input) return;

    const text = input.value;
    if (mode === "commit" && !text.trim()) return;

    this.#prompt = null;
    this.#promptKey = null;

    // Blur first so the blur handler can't apply this text to whatever the
    // handlers open next (Tab opens the following lyric).
    if (mode !== "blur" && document.activeElement === input) input.blur();

    this.deliverPromptText(prompt.handlers, mode, text);
    this.syncEditControls();
    this.context.requestRender();
  }

  /** Passes the typed text to the handler that matches how the prompt ended. */
  private deliverPromptText(
    handlers: LyricPromptHandlers,
    mode: PromptFinish,
    text: string,
  ): void {
    if (!text.trim()) {
      handlers.onCancel();
      return;
    }

    if (mode === "tab" && handlers.onTab) {
      handlers.onTab(text);
      return;
    }

    if (!handlers.onCommit(text)) handlers.onCancel();
  }

  /** Creates the inline input and wires its focus, keyboard, and blur behavior. */
  private createEditInput(): void {
    if (!this.#host || this.#editInputRef) return;

    const input = document.createElement("input");
    input.type = "text";
    input.className = "piano-roll-header-input";
    input.style.display = "none";

    // Selecting a marker on focus or click keeps the input tied to the hovered item.
    input.addEventListener("focus", () => {
      if (!this.#editingMarker && this.#hoveredMarker) {
        this.#editingMarker = { ...this.#hoveredMarker };
      }
    });
    input.addEventListener("click", () => {
      if (this.#hoveredMarker) this.#editingMarker = { ...this.#hoveredMarker };
    });
    input.addEventListener("keydown", (event) =>
      this.handleInputKeyDown(event, input),
    );

    // A blur commits marker edits, while lyric prompts have their own finish flow.
    input.addEventListener("blur", () => this.handleInputBlur(input));

    this.#host.appendChild(input);
    this.#editInputRef = input;
  }

  /** Routes a key press in the input to the prompt or marker editing flow. */
  private handleInputKeyDown(
    event: KeyboardEvent,
    input: HTMLInputElement,
  ): void {
    if (this.#prompt) {
      this.handlePromptKeyDown(event);
      return;
    }

    const lyricMarker = this.getLyricTabTarget(event);
    if (lyricMarker) {
      event.preventDefault();
      this.commitEdit(input.value);
      input.blur();
      this.context.editNextLyric(lyricMarker.tick);
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      this.commitEdit(input.value);
      input.blur();
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      this.#editingMarker = null;
      input.blur();
      this.syncEditControls();
    }
  }

  /** Enter commits, Escape cancels and Tab commits and moves on. */
  private handlePromptKeyDown(event: KeyboardEvent): void {
    if (event.key === "Enter") {
      event.preventDefault();
      this.finishPrompt("commit");
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      this.cancelPrompt();
      return;
    }

    if (event.key === "Tab") {
      event.preventDefault();
      this.finishPrompt("tab");
    }
  }

  /**
   * The lyric being edited when `event` is Tab in a vocal profile, i.e. the
   * lyric after which editing should move on. Null for any other key press.
   */
  private getLyricTabTarget(event: KeyboardEvent): MarkerReference | null {
    const isVocal = this.context.getProfile().editing === "vocal";
    if (event.key !== "Tab" || !isVocal) return null;

    return this.#editingMarker?.lane === "text" ? this.#editingMarker : null;
  }

  /** Commits the marker being edited, or finishes the open prompt. */
  private handleInputBlur(input: HTMLInputElement): void {
    if (this.#prompt) {
      this.finishPrompt("blur");
      return;
    }

    if (this.#editingMarker) this.commitEdit(input.value);
    this.syncEditControls();
  }

  /** Creates the marker delete button and attaches its click handler. */
  private createDeleteButton(): void {
    if (!this.#host || this.#deleteButtonRef) return;

    const button = document.createElement("button");
    button.type = "button";
    button.className = "piano-roll-header-delete";
    button.textContent = "\u00d7";
    button.style.display = "none";

    // Keep focus in the input so pressing the button does not blur it first.
    button.addEventListener("mousedown", (event) => event.preventDefault());
    button.addEventListener("click", () => this.deleteHoveredMarker());

    this.#host.appendChild(button);
    this.#deleteButtonRef = button;
  }

  /** Deletes the currently hovered marker, respecting playback and profile settings. */
  private deleteHoveredMarker(): void {
    if (this.context.getState().isPlaying) return;

    const midi = this.context.getMidi();
    const marker = this.#hoveredMarker;
    if (!midi || !marker) return;
    if (marker.lane === "text" && !this.options.deleteText) return;

    const changed = this.removeMarker(marker.lane, marker.tick);

    this.#hoveredMarker = null;
    if (changed) this.notifyMarkersChanged();

    this.syncEditControls();
    this.context.requestRender();
  }

  /** Parses and applies the edited value to the active tempo, signature, or text marker. */
  private commitEdit(raw: string): void {
    if (this.context.getState().isPlaying) return;

    const midi = this.context.getMidi();
    const marker = this.#editingMarker ?? this.#hoveredMarker;
    if (!midi || !marker) return;

    // Unparseable text keeps the editor open so the user can correct it.
    const outcome = this.applyMarkerEdit(midi, marker, raw);
    if (outcome === "rejected") return;

    this.#editingMarker = null;
    if (outcome === "changed") this.notifyMarkersChanged();

    this.context.requestRender();
  }

  /** Replaces the marker's value with the parsed `raw` text. */
  private applyMarkerEdit(
    midi: Midi,
    marker: MarkerReference,
    raw: string,
  ): MarkerEditOutcome {
    if (marker.lane === "tempo") {
      const beatsPerMinute = parseTempoString(raw);
      if (beatsPerMinute === null) return "rejected";

      midi.removeTempoEventAt(marker.tick);
      midi.addTempoEvent(
        marker.tick,
        toMicrosecondsPerQuarterNote(beatsPerMinute),
      );
      return "changed";
    }

    if (marker.lane === "timeSignature") {
      const parsed = parseTimeSignatureString(raw);
      if (parsed === null) return "rejected";

      midi.removeTimeSignatureEventAt(marker.tick);
      midi.addTimeSignatureEvent(
        marker.tick,
        parsed.numerator,
        parsed.denominator,
      );
      return "changed";
    }

    const text = this.findTextEventNear(
      this.coordinates.screenXForTick(marker.tick),
    );
    if (!text) return "unchanged";

    const updated = this.context.getSelectedTrack()?.updateTextEvent(text, raw);
    return updated ? "changed" : "unchanged";
  }

  /** Formats the current marker value for display in the inline edit input. */
  private formatMarkerValue(marker: MarkerReference): string {
    if (marker.lane === "text") {
      const text = this.findTextEventNear(
        this.coordinates.screenXForTick(marker.tick),
      );
      return text?.text ?? "";
    }

    if (marker.lane === "tempo") {
      const tempo = this.context
        .getTempoEvents()
        .find((candidate) => candidate.tick === marker.tick);
      return tempo
        ? String(toBeatsPerMinute(tempo.microsecondsPerQuarterNote))
        : "";
    }

    const timeSignature = this.context
      .getTimeSignatureEvents()
      .find((candidate) => candidate.tick === marker.tick);
    return timeSignature ? formatTimeSignatureLabel(timeSignature) : "";
  }

  /** Positions and updates the inline editor and delete button for the active state. */
  private syncEditControls(): void {
    const input = this.#editInputRef;
    const deleteButton = this.#deleteButtonRef;
    if (!input || !deleteButton) return;

    if (this.#prompt) {
      this.syncPromptControls(input, deleteButton, this.#prompt);
      return;
    }

    this.syncMarkerControls(input, deleteButton);
  }

  /** Shows the input for a lyric prompt; prompts disable marker deletion. */
  private syncPromptControls(
    input: HTMLInputElement,
    deleteButton: HTMLButtonElement,
    prompt: LyricPrompt,
  ): void {
    // Prompts always use the text lane.
    input.style.left = `${this.coordinates.screenXForTick(prompt.tick)}px`;
    input.style.top = `${
      this.laneTop("text") ?? HeaderHeight - HeaderLaneHeight
    }px`;
    input.style.display = "block";
    input.placeholder = "lyric";
    deleteButton.style.display = "none";

    // Fill in the starting text once per prompt, not on every redraw.
    const key = `prompt:${prompt.tick}`;
    if (key !== this.#promptKey) {
      this.#promptKey = key;
      input.value = prompt.handlers.initialText ?? "";
    }

    this.focusInput(input);
  }

  /** Shows the input and delete button beside the edited or hovered marker. */
  private syncMarkerControls(
    input: HTMLInputElement,
    deleteButton: HTMLButtonElement,
  ): void {
    input.placeholder = "";
    const marker = this.#editingMarker ?? this.#hoveredMarker;

    // With no marker, hide the controls unless the input is being typed in.
    if (!marker) {
      if (document.activeElement !== input) {
        input.style.display = "none";
        deleteButton.style.display = "none";
        this.#editingMarkerKey = null;
      }
      return;
    }

    // Position controls based on the marker lane.
    const x = this.coordinates.screenXForTick(marker.tick);
    const y = this.laneTop(marker.lane) ?? HeaderHeight - HeaderLaneHeight;
    const inputWidth =
      input.getBoundingClientRect().width || FallbackInputWidth;
    input.style.left = `${x}px`;
    input.style.top = `${y}px`;
    input.style.display = "block";
    deleteButton.style.left = `${x + inputWidth + DeleteButtonGap}px`;
    deleteButton.style.top = `${y}px`;
    deleteButton.style.display =
      marker.lane === "text" && !this.options.deleteText ? "none" : "block";

    // Keep the value in sync when the marker changes.
    const key = `${marker.lane}:${marker.tick}`;
    if (key !== this.#editingMarkerKey) {
      this.#editingMarkerKey = key;
      input.value = this.formatMarkerValue(marker);
    }

    if (this.#editingMarker) this.focusInput(input);
  }

  /** Focuses and selects the input's text unless it already has focus. */
  private focusInput(input: HTMLInputElement): void {
    if (document.activeElement === input) return;

    input.focus();
    input.select();
  }

  /** Screen Y of a lane's top edge, or null when the lane is not shown. */
  private laneTop(lane: HeaderLane): number | null {
    const index = this.#visibleLanes.indexOf(lane);
    if (index === -1) return null;

    return (HeaderHeight / this.#visibleLanes.length) * index;
  }
}
