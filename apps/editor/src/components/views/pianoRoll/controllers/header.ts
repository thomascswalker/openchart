import {
  MetaType,
  type TempoEvent,
  type TextMidiEvent,
  type TimeSignatureEvent,
} from "@openchart/midi";
import { Vector2 } from "three";
import {
  DomainCommandType,
  EditCommandType,
  EditingModeId,
  type EditCommand,
  type EditingSession,
  type EntityId,
  type GestureHandle,
} from "@openchart/views";
import { formatTextId } from "@openchart/views";
import {
  HeaderHeight,
  HeaderLaneHeight,
  HeaderMarkerHitRadius,
  HeaderMarkerLabelHeight,
  HeaderMarkerLabelWidth,
  KeyboardWidth,
} from "../constants";
import type { CoordinateSystem } from "../coordinates";
import type { PianoRollLyricPromptHandlers, PianoRollContext } from "../types";
import { IController } from "../controller";
import {
  parseTempoString,
  parseTimeSignatureString,
} from "../../../../audio/musicalTime";

export type HeaderLane = "tempo" | "timeSignature" | "text";
type HeaderEvent = TempoEvent | TimeSignatureEvent | TextMidiEvent;

export const DefaultHeaderLanes: readonly HeaderLane[] = [
  "tempo",
  "timeSignature",
  "text",
];

interface Range {
  start: number;
  end: number;
}

interface MarkerConfig {
  name: HeaderLane;
  instances: HTMLDivElement[];
  events: HeaderEvent[];
  format: (event: HeaderEvent) => string;
}

/** Manages header markers, inline editing, and lyric prompts for the piano roll. */
export class HeaderController extends IController {
  #visibleLanes: readonly HeaderLane[];
  #hoveredMarker: { lane: HeaderLane; tick: number } | null = null;
  #host: HTMLElement | null = null;
  #bottomBorderRef: HTMLDivElement | null = null;
  #editInputRef: HTMLInputElement | null = null;
  #deleteButtonRef: HTMLButtonElement | null = null;
  #editingMarkerKey: string | null = null;
  #editingMarker: { lane: HeaderLane; tick: number } | null = null;
  #editTextHandler: ((text: string) => boolean) | null = null;
  #draggingText: TextMidiEvent | null = null;
  #draggingTextTick: number | null = null;
  #dragGesture: GestureHandle | null = null;
  #prompt: { tick: number; handlers: PianoRollLyricPromptHandlers } | null =
    null;
  #promptKey: string | null = null;
  #width: number = 0;

  readonly #tempoLabelRefs: HTMLDivElement[] = [];
  readonly #timeSignatureLabelRefs: HTMLDivElement[] = [];
  readonly #textLabelRefs: HTMLDivElement[] = [];
  readonly #highlightRefs: HTMLDivElement[] = [];

  public constructor(
    context: PianoRollContext,
    coordinates: CoordinateSystem,
    visibleLanes: readonly HeaderLane[] = DefaultHeaderLanes,
  ) {
    super(context, coordinates);
    this.#visibleLanes = [...new Set(visibleLanes)];
  }

  get width(): number {
    return this.#width;
  }

  set width(value: number) {
    this.#width = value;
  }

  public get visibleLanes(): readonly HeaderLane[] {
    return this.#visibleLanes;
  }

  /** Returns the active header display options from the current profile. */
  private get options() {
    return this.context.getProfile().header;
  }

  /** Whether an inline lyric prompt is currently open. */
  public get isPrompting(): boolean {
    return this.#prompt !== null;
  }

  mount(host: HTMLElement): void {
    this.#host = host;
    const bottomBorder = document.createElement("div");
    bottomBorder.style.position = "absolute";
    bottomBorder.style.left = "0";
    bottomBorder.style.height = "0";
    bottomBorder.style.pointerEvents = "none";
    bottomBorder.style.borderBottom = "var(--border-primary)";
    host.appendChild(bottomBorder);
    this.#bottomBorderRef = bottomBorder;
    this.createEditInput();
    this.createDeleteButton();
  }

  destroy(): void {
    this.#dragGesture?.cancel();
    this.#dragGesture = null;
    this.#draggingText = null;
    this.#draggingTextTick = null;
    // Remove HTML elements
    this.#bottomBorderRef?.remove();
    this.#bottomBorderRef = null;
    this.#editInputRef?.remove();
    this.#editInputRef = null;
    this.#deleteButtonRef?.remove();
    this.#deleteButtonRef = null;
    this.#tempoLabelRefs.forEach((label) => label.remove());
    this.#tempoLabelRefs.length = 0;
    this.#timeSignatureLabelRefs.forEach((label) => label.remove());
    this.#timeSignatureLabelRefs.length = 0;
    this.#textLabelRefs.forEach((label) => label.remove());
    this.#textLabelRefs.length = 0;
    this.#highlightRefs.forEach((highlight) => highlight.remove());
    this.#highlightRefs.length = 0;

    this.#host = null;
    this.#hoveredMarker = null;
    this.#editingMarkerKey = null;
    this.#editingMarker = null;
    this.#prompt = null;
    this.#promptKey = null;
  }

  public draw(): void {
    if (!this.#host) {
      return;
    }

    if (this.#bottomBorderRef) {
      this.#bottomBorderRef.style.top = `${HeaderHeight - 1}px`;
      this.#bottomBorderRef.style.width = `${this.#width}px`;
    }

    // Reset highlights before marking the currently hovered marker.
    this.#highlightRefs.forEach((highlight) => {
      highlight.style.display = "none";
    });

    const markerConfigs = this.getMarkerConfigs();
    markerConfigs.forEach((config) => {
      const index = this.#visibleLanes.indexOf(config.name);
      if (index === -1) {
        config.instances.forEach((label) => {
          label.style.display = "none";
        });
        return;
      }
      const y = (HeaderHeight / this.#visibleLanes.length) * index;
      this.drawMarkers(
        config.name,
        config.instances,
        config.events,
        y,
        config.format,
        config.name === "text" && this.options.clipLabels,
      );
    });

    // After drawing the markers, sync the edit controls
    this.syncEditControls();
  }

  private getMarkerConfigs = (): MarkerConfig[] => {
    const { start, end } = this.getVisibleRange();

    const inView = (event: { tick: number }) =>
      event.tick >= start && event.tick <= end;

    const timeSignatureEvents = this.context
      .getTimeSignatureEvents()
      .filter(inView);
    const textEvents = this.context
      .getTextEvents()
      .filter(inView)
      .map((event) =>
        event === this.#draggingText && this.#draggingTextTick !== null
          ? { ...event, tick: this.#draggingTextTick }
          : event,
      );
    const tempoEvents = this.context.getTempoEvents().filter(inView);
    return [
      {
        name: "tempo",
        instances: this.#tempoLabelRefs,
        events: tempoEvents,
        format: (event: HeaderEvent) =>
          `\u266a=${Math.round(60_000_000 / (event as TempoEvent).microsecondsPerQuarterNote)}`,
      },
      {
        name: "timeSignature",
        instances: this.#timeSignatureLabelRefs,
        events: timeSignatureEvents,
        format: (event: HeaderEvent) =>
          `${(event as TimeSignatureEvent).numerator}/${2 ** (event as TimeSignatureEvent).denominator}`,
      },
      {
        name: "text",
        events: textEvents,
        instances: this.#textLabelRefs,
        format: (event: HeaderEvent) => (event as TextMidiEvent).text,
      },
    ];
  };

  /** Calculates the tick range currently visible within the header viewport. */
  private getVisibleRange(): Range {
    const visibleWidth = Math.max(0, this.width - KeyboardWidth);
    const visibleStart = this.coordinates.getCamera().x;
    const visibleEnd = this.coordinates.tickAtScreenX(
      KeyboardWidth + visibleWidth,
    );
    return { start: visibleStart, end: visibleEnd };
  }

  /**
   * Opens the inline text input at `tick` for a lyric. Used right after a
   * vocal note is created and when Tab moves to a note with no lyric yet.
   */
  public promptText(
    tick: number,
    handlers: PianoRollLyricPromptHandlers,
  ): void {
    if (this.#prompt) this.cancelPrompt();
    this.#editingMarker = null;
    this.#editTextHandler = null;
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
  public editTextAt(tick: number, onCommit?: (text: string) => boolean): void {
    if (this.#prompt) this.cancelPrompt();
    this.#editingMarker = { lane: "text", tick };
    this.#editTextHandler = onCommit ?? null;
    this.#editingMarkerKey = null;
    this.syncEditControls();
  }

  /** Finishes a lyric prompt by committing, advancing with Tab, or cancelling. */
  private finishPrompt(mode: "commit" | "tab" | "blur"): void {
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
    if (!text.trim()) {
      prompt.handlers.onCancel();
    } else if (mode === "tab" && prompt.handlers.onTab) {
      prompt.handlers.onTab(text);
    } else if (!prompt.handlers.onCommit(text)) {
      prompt.handlers.onCancel();
    }
    this.syncEditControls();
    this.context.requestRender();
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
    if (
      visibleLanes.length === this.#visibleLanes.length &&
      visibleLanes.every((lane, index) => lane === this.#visibleLanes[index])
    ) {
      return;
    }

    this.#visibleLanes = visibleLanes;
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
      this.#editTextHandler = null;
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
    const lane = local ? this.laneAt(local.y) : null;
    const marker =
      lane && this.context.getMidi()
        ? lane === "tempo"
          ? this.findTempoEventNear(local!.x)
          : lane === "timeSignature"
            ? this.findTimeSignatureEventNear(local!.x)
            : this.findTextEventNear(local!.x)
        : null;

    this.#hoveredMarker = marker ? { lane: lane!, tick: marker.tick } : null;
    this.syncEditControls();
  }

  /** Adds a default marker to an empty lane at the clicked tick. */
  public handleLeftClick(point: Vector2): void {
    if (this.context.getState().isPlaying) {
      return;
    }
    const laneType: HeaderLane | null = this.laneAt(point.y);
    if (!this.globalSession || !laneType) {
      return;
    }

    // If an event already exists at the clicked location, exit
    if (this.findEventNear(laneType, point.x)) {
      return;
    }

    // Create the lane-specific default value at the snapped tick.
    const clickTick = this.coordinates.tickAtScreenX(point.x);
    const snappedTick: number = this.coordinates.snapTick(clickTick);
    let changed = false;

    // Create a tempo event
    if (laneType === "tempo") {
      const current = this.effectiveTempoAt(snappedTick);
      changed = this.executeGlobal({
        type: EditCommandType.SetTempo,
        tick: snappedTick,
        microsecondsPerQuarterNote: current,
      });
    }
    // Create a time signature event
    else if (laneType === "timeSignature") {
      const current = this.effectiveTimeSignatureAt(snappedTick);
      changed = this.executeGlobal({
        type: EditCommandType.SetTimeSignature,
        tick: snappedTick,
        numerator: current.numerator,
        denominator: current.denominator,
      });
    }
    // Create a text event if we're NOT in a vocal track
    else if (this.options.createOnClick) {
      changed = this.executeGlobal({
        type: DomainCommandType.AddSection,
        tick: snappedTick,
        name: "New",
      });
    }

    // If the MIDI was updated, invalidate the tempo cache and notify that
    // the notes changed
    if (changed) {
      this.context.invalidateTempoCache();
    }

    // Rerender
    this.context.requestRender();
  }

  /** Removes the marker under the pointer when the matching lane permits deletion. */
  public handleRightPointerDown(x: number, y: number): void {
    if (this.context.getState().isPlaying) {
      return;
    }
    const lane = this.laneAt(y);
    if (!this.globalSession || !lane) {
      return;
    }

    const marker =
      lane === "tempo"
        ? this.findTempoEventNear(x)
        : lane === "timeSignature"
          ? this.findTimeSignatureEventNear(x)
          : this.findTextEventNear(x);
    let changed = false;
    if (marker) {
      // Text markers follow the profile's separate text-deletion option.
      if (lane === "tempo") {
        changed = this.executeGlobal({
          type: EditCommandType.RemoveTempo,
          tick: marker.tick,
        });
      } else if (lane === "timeSignature") {
        changed = this.executeGlobal({
          type: EditCommandType.RemoveTimeSignature,
          tick: marker.tick,
        });
      } else if (this.options.deleteText) {
        const text = this.findTextEventNear(x);
        if (text)
          changed = this.executeGlobal({
            type: EditCommandType.DeleteEntities,
            targetIds: [this.textEntityId(text)],
          });
      }
    }
    if (changed) {
      this.context.invalidateTempoCache();
    }
    this.context.requestRender();
  }

  /** Starts dragging a text marker when text dragging is enabled. */
  public beginDrag(point: Vector2): void {
    if (
      this.context.getState().isPlaying ||
      this.laneAt(point.y) !== "text" ||
      !this.options.dragText
    )
      return;
    const session = this.globalSession;
    this.#draggingText = this.findTextEventNear(point.x);
    if (this.#draggingText && session) {
      this.#draggingTextTick = this.#draggingText.tick;
      this.#dragGesture = session.beginGesture();
    } else {
      this.#draggingText = null;
    }
  }

  /** Moves the active text marker to the nearest snapped tick. */
  public updateDrag(point: Vector2): void {
    if (!this.#draggingText || this.context.getState().isPlaying) return;
    const tick = this.coordinates.snapTickToNearest(
      this.coordinates.tickAtScreenX(point.x),
    );
    this.#draggingTextTick = tick;
    this.#dragGesture?.preview({
      type: EditCommandType.UpdateText,
      id: this.textEntityId(this.#draggingText),
      tick,
    });
    this.context.requestRender();
  }

  /** Ends an active text-marker drag and closes its edit transaction. */
  public endDrag(): void {
    const gesture = this.#dragGesture;
    this.#draggingText = null;
    this.#draggingTextTick = null;
    this.#dragGesture = null;
    gesture?.commit();
    this.context.requestRender();
  }

  /** Creates or updates marker labels and highlights for one lane. */
  private drawMarkers<T extends HeaderEvent>(
    lane: HeaderLane,
    instance: HTMLDivElement[],
    events: T[],
    y: number,
    formatText: (event: T) => string,
    clip = false,
  ): void {
    events.forEach((event, index) => {
      let label = instance[index];
      if (!label) {
        label = document.createElement("div");
        label.style.position = "absolute";
        label.style.color = "#ccc";
        label.style.font = "11px sans-serif";
        label.style.whiteSpace = "nowrap";
        label.style.pointerEvents = "none";
        instance[index] = label;
        this.#host?.appendChild(label);
      }

      const x = this.coordinates.screenXForTick(event.tick);
      const isHovered =
        this.#hoveredMarker?.lane === lane &&
        this.#hoveredMarker.tick === event.tick;
      if (isHovered) {
        const highlight = this.getHighlight(index);
        highlight.style.display = "block";
        highlight.style.left = `${x}px`;
        highlight.style.top = `${y}px`;
        highlight.style.width = `${HeaderMarkerLabelWidth}px`;
        highlight.style.height = `${HeaderMarkerLabelHeight}px`;
      }
      label.textContent = formatText(event);
      if (clip) {
        // Lyrics are dense: stop each label at the next one's X.
        const next = events[index + 1];
        const nextX = next
          ? this.coordinates.screenXForTick(next.tick)
          : Number.POSITIVE_INFINITY;
        label.style.maxWidth = Number.isFinite(nextX)
          ? `${Math.max(0, nextX - x - 4)}px`
          : "";
        label.style.overflow = "hidden";
        label.style.textOverflow = "clip";
      } else {
        label.style.maxWidth = "";
      }
      label.style.left = `${x + 3}px`;
      label.style.top = `${y}px`;
      label.style.display = x >= KeyboardWidth ? "block" : "none";
    });

    for (let index = events.length; index < instance.length; index++) {
      instance[index].style.display = "none";
    }
  }

  /** Returns the highlight element for a marker, creating it on demand. */
  private getHighlight(index: number): HTMLDivElement {
    let highlight = this.#highlightRefs[index];
    if (!highlight) {
      highlight = document.createElement("div");
      highlight.style.position = "absolute";
      highlight.style.background = "rgba(255, 0, 0, 0.3)";
      highlight.style.pointerEvents = "none";
      this.#highlightRefs[index] = highlight;
      this.#host?.appendChild(highlight);
    }
    return highlight;
  }

  private findTempoEventNear(pos: number): TempoEvent | null {
    return this.findMarkerNear(this.context.getTempoEvents(), pos);
  }

  private findTimeSignatureEventNear(pos: number): TimeSignatureEvent | null {
    return this.findMarkerNear(this.context.getTimeSignatureEvents(), pos);
  }

  private findTextEventNear(pos: number): TextMidiEvent | null {
    return this.findMarkerNear(this.context.getTextEvents(), pos);
  }

  private findEventNear(type: HeaderLane, pos: number): HeaderEvent | null {
    switch (type) {
      case "tempo":
        return this.findTempoEventNear(pos);
      case "timeSignature":
        return this.findTimeSignatureEventNear(pos);
      case "text":
        return this.findTextEventNear(pos);
    }
    return null;
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
    let value =
      this.context.getTempoEvents()[0]?.microsecondsPerQuarterNote ?? 500_000;
    for (const event of this.context.getTempoEvents()) {
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
    let value = this.context.getTimeSignatureEvents()[0] ?? {
      numerator: 4,
      denominator: 2,
    };
    for (const event of this.context.getTimeSignatureEvents()) {
      if (event.tick > tick) break;
      value = event;
    }
    return { numerator: value.numerator, denominator: value.denominator };
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

    // Handle prompt navigation separately from ordinary marker editing.
    input.addEventListener("keydown", (event) => {
      if (this.#prompt) {
        if (event.key === "Enter") {
          event.preventDefault();
          this.finishPrompt("commit");
        } else if (event.key === "Escape") {
          event.preventDefault();
          this.cancelPrompt();
        } else if (event.key === "Tab") {
          event.preventDefault();
          this.finishPrompt("tab");
        }
        return;
      }
      if (
        event.key === "Tab" &&
        this.context.getProfile().id === EditingModeId.MidiVocals &&
        this.#editingMarker?.lane === "text"
      ) {
        event.preventDefault();
        const tick = this.#editingMarker.tick;
        this.commitEdit(input.value);
        input.blur();
        this.context.editNextLyric(tick);
        return;
      }
      if (event.key === "Enter") {
        event.preventDefault();
        this.commitEdit(input.value);
        input.blur();
      } else if (event.key === "Escape") {
        event.preventDefault();
        this.#editingMarker = null;
        input.blur();
        this.syncEditControls();
      }
    });

    // A blur commits marker edits, while lyric prompts have their own finish flow.
    input.addEventListener("blur", () => {
      if (this.#prompt) {
        this.finishPrompt("blur");
        return;
      }
      if (this.#editingMarker) this.commitEdit(input.value);
      this.syncEditControls();
    });
    this.#host.appendChild(input);
    this.#editInputRef = input;
  }

  /** Creates the marker delete button and attaches its click handler. */
  private createDeleteButton(): void {
    if (!this.#host || this.#deleteButtonRef) return;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "piano-roll-header-delete";
    button.textContent = "\u00d7";
    button.style.display = "none";
    button.addEventListener("mousedown", (event) => event.preventDefault());
    button.addEventListener("click", () => this.deleteHoveredMarker());
    this.#host.appendChild(button);
    this.#deleteButtonRef = button;
  }

  /** Deletes the currently hovered marker, respecting playback and profile settings. */
  private deleteHoveredMarker(): void {
    if (this.context.getState().isPlaying) return;
    const marker = this.#hoveredMarker;
    if (!this.globalSession || !marker) return;
    if (marker.lane === "text" && !this.options.deleteText) return;

    let changed = false;
    if (marker.lane === "tempo") {
      changed = this.executeGlobal({
        type: EditCommandType.RemoveTempo,
        tick: marker.tick,
      });
    } else if (marker.lane === "timeSignature") {
      changed = this.executeGlobal({
        type: EditCommandType.RemoveTimeSignature,
        tick: marker.tick,
      });
    } else {
      const text = this.findTextEventNear(
        this.coordinates.screenXForTick(marker.tick),
      );
      if (text)
        changed = this.executeGlobal({
          type: EditCommandType.DeleteEntities,
          targetIds: [this.textEntityId(text)],
        });
    }
    this.#hoveredMarker = null;
    if (changed) {
      this.context.invalidateTempoCache();
    }
    this.syncEditControls();
    this.context.requestRender();
  }

  /** Parses and applies the edited value to the active tempo, signature, or text marker. */
  private commitEdit(raw: string): void {
    if (this.context.getState().isPlaying) return;

    const marker = this.#editingMarker ?? this.#hoveredMarker;
    if (!marker || (marker.lane !== "text" && !this.globalSession)) return;

    let changed = false;

    // Parse and replace the marker according to its lane.
    if (marker.lane === "tempo") {
      const parsed = parseTempoString(raw);
      if (parsed === null) return;

      changed = this.executeGlobal({
        type: EditCommandType.SetTempo,
        tick: marker.tick,
        microsecondsPerQuarterNote: Math.round(60_000_000 / parsed),
      });
    } else if (marker.lane === "timeSignature") {
      const parsed = parseTimeSignatureString(raw);
      if (parsed === null) return;

      changed = this.executeGlobal({
        type: EditCommandType.SetTimeSignature,
        tick: marker.tick,
        numerator: parsed.numerator,
        denominator: parsed.denominator,
      });
    } else {
      const text = this.findTextEventNear(
        this.coordinates.screenXForTick(marker.tick),
      );

      if (text) {
        changed =
          text.type === MetaType.Lyric
            ? (this.#editTextHandler?.(raw) ?? false)
            : this.executeGlobal({
                type: EditCommandType.UpdateText,
                id: this.textEntityId(text),
                text: raw,
              });
      }
    }

    this.#editingMarker = null;
    this.#editTextHandler = null;
    if (changed) {
      this.context.invalidateTempoCache();
    }
    this.context.requestRender();
  }

  private get globalSession(): EditingSession | null {
    return this.context.getGlobalEditingSession?.() ?? null;
  }

  private executeGlobal(command: EditCommand): boolean {
    const session = this.globalSession;
    return session ? session.execute(command).changed : false;
  }

  private textEntityId(event: TextMidiEvent): EntityId {
    const track = this.context.getSelectedTrack();
    const trackIndex = this.context.getSelectedTrackIndex();
    if (!track || trackIndex === null) {
      throw new Error("A selected track is required to edit text events");
    }
    return formatTextId(trackIndex, track.getEventId(event));
  }

  /** Formats the current marker value for display in the inline edit input. */
  private formatMarkerValue(marker: {
    lane: HeaderLane;
    tick: number;
  }): string {
    if (marker.lane === "tempo") {
      const event = this.context
        .getTempoEvents()
        .find((candidate) => candidate.tick === marker.tick);
      return event
        ? String(Math.round(60_000_000 / event.microsecondsPerQuarterNote))
        : "";
    }
    if (marker.lane === "text") {
      return (
        this.findTextEventNear(this.coordinates.screenXForTick(marker.tick))
          ?.text ?? ""
      );
    }
    const event = this.context
      .getTimeSignatureEvents()
      .find((candidate) => candidate.tick === marker.tick);
    return event ? `${event.numerator}/${2 ** event.denominator}` : "";
  }

  /** Positions and updates the inline editor and delete button for the active state. */
  private syncEditControls(): void {
    const input = this.#editInputRef;
    const deleteButton = this.#deleteButtonRef;
    if (!input || !deleteButton) {
      return;
    }

    // Prompts always use the text lane and disable marker deletion.
    if (this.#prompt) {
      const x = this.coordinates.screenXForTick(this.#prompt.tick);
      input.style.left = `${x}px`;
      input.style.top = `${
        this.laneTop("text") ?? HeaderHeight - HeaderLaneHeight
      }px`;
      input.style.display = "block";
      input.placeholder = "lyric";
      deleteButton.style.display = "none";
      const key = `prompt:${this.#prompt.tick}`;
      if (key !== this.#promptKey) {
        this.#promptKey = key;
        input.value = this.#prompt.handlers.initialText ?? "";
      }
      if (document.activeElement !== input) {
        input.focus();
        input.select();
      }
      return;
    }

    input.placeholder = "";
    const marker = this.#editingMarker ?? this.#hoveredMarker;
    const focused = document.activeElement === input;

    if (!marker) {
      if (!focused) {
        input.style.display = "none";
        deleteButton.style.display = "none";
        this.#editingMarkerKey = null;
      }
      return;
    }

    // Position controls based on the marker lane and keep the value in sync on selection changes.
    const x = this.coordinates.screenXForTick(marker.tick);
    const y = this.laneTop(marker.lane) ?? HeaderHeight - HeaderLaneHeight;
    const inputWidth = input.getBoundingClientRect().width || 48;
    input.style.left = `${x}px`;
    input.style.top = `${y}px`;
    input.style.display = "block";
    deleteButton.style.left = `${x + inputWidth + 2}px`;
    deleteButton.style.top = `${y}px`;
    deleteButton.style.display =
      marker.lane === "text" && !this.options.deleteText ? "none" : "block";
    const key = `${marker.lane}:${marker.tick}`;
    if (key !== this.#editingMarkerKey) {
      this.#editingMarkerKey = key;
      input.value = this.formatMarkerValue(marker);
    }
    if (this.#editingMarker && document.activeElement !== input) {
      input.focus();
      input.select();
    }
  }

  private laneTop(lane: HeaderLane): number | null {
    const index = this.#visibleLanes.indexOf(lane);
    if (index === -1) {
      return null;
    }
    return (HeaderHeight / this.#visibleLanes.length) * index;
  }
}
