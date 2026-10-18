import {
  MetaType,
  type TempoEvent,
  type TextMidiEvent,
  type TimeSignatureEvent,
} from "@openchart/core";
import type { CanvasPoint } from "../../../rendering/geometry";
import {
  HeaderHeight,
  HeaderMarkerHitRadius,
  HeaderMarkerLabelHeight,
  HeaderMarkerLabelWidth,
  HeaderTempoLaneHeight,
  KeyboardWidth,
} from "./constants";
import type { LyricPromptHandlers } from "./types";
import { IController } from "./controller";
import { applyStyle } from "../../../util/css";

type HeaderLane = "tempo" | "timeSignature" | "text";

interface Range {
  start: number;
  end: number;
}

/** Parses a positive tempo value in beats per minute. */
export function parseTempoBpm(raw: string): number | null {
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

/** Parses a time signature and returns its numerator and MIDI denominator exponent. */
export function parseTimeSignatureInput(
  raw: string,
): { numerator: number; denominator: number } | null {
  const match = /^(\d+)\s*\/\s*(\d+)$/.exec(raw.trim());
  if (!match) return null;
  const numerator = Number(match[1]);
  const denominatorValue = Number(match[2]);
  const denominator = Math.round(Math.log2(denominatorValue));
  if (
    !Number.isInteger(numerator) ||
    numerator <= 0 ||
    !Number.isInteger(denominatorValue) ||
    denominatorValue <= 0 ||
    2 ** denominator !== denominatorValue
  ) {
    return null;
  }
  return { numerator, denominator };
}

/** Manages header markers, inline editing, and lyric prompts for the piano roll. */
export class HeaderController extends IController {
  private readonly tempoLabelInstance: HTMLDivElement[] = [];
  private readonly timeSignatureLabelInstance: HTMLDivElement[] = [];
  private readonly textLabelInstance: HTMLDivElement[] = [];
  private readonly highlightInstance: HTMLDivElement[] = [];
  private hoveredMarker: { lane: HeaderLane; tick: number } | null = null;
  private host: HTMLElement | null = null;
  private editInput: HTMLInputElement | null = null;
  private deleteButton: HTMLButtonElement | null = null;
  private editingMarkerKey: string | null = null;
  private editingMarker: { lane: HeaderLane; tick: number } | null = null;
  private draggingText: TextMidiEvent | null = null;
  private prompt: { tick: number; handlers: LyricPromptHandlers } | null = null;
  private promptKey: string | null = null;
  #width: number = 0;

  get width(): number {
    return this.#width;
  }

  set width(value: number) {
    this.#width = value;
  }

  /** Returns the active header display options from the current profile. */
  private get options() {
    return this.context.getProfile().header;
  }

  /** Whether an inline lyric prompt is currently open. */
  public get isPrompting(): boolean {
    return this.prompt !== null;
  }

  mount(host: HTMLElement): void {
    this.host = host;
    this.createEditInput();
    this.createDeleteButton();
  }

  destroy(): void {
    this.editInput?.remove();
    this.deleteButton?.remove();
    this.tempoLabelInstance.forEach((label) => label.remove());
    this.timeSignatureLabelInstance.forEach((label) => label.remove());
    this.textLabelInstance.forEach((label) => label.remove());
    this.highlightInstance.forEach((highlight) => highlight.remove());
    this.tempoLabelInstance.length = 0;
    this.timeSignatureLabelInstance.length = 0;
    this.textLabelInstance.length = 0;
    this.highlightInstance.length = 0;
    this.editInput = null;
    this.deleteButton = null;
    this.host = null;
    this.hoveredMarker = null;
    this.editingMarkerKey = null;
    this.editingMarker = null;
    this.prompt = null;
    this.promptKey = null;
  }

  public draw(): void {
    if (!this.host) {
      return;
    }

    applyStyle(this.host, {
      background: "#1c1c1c",
      borderBottom: "1px solid #555",
    });

    const { start, end } = this.getVisibleRange();
    const inView = (event: { tick: number }) =>
      event.tick >= start && event.tick <= end;

    // Reset highlights before marking the currently hovered marker.
    this.highlightInstance.forEach((highlight) => {
      highlight.style.display = "none";
    });

    // Draw tempo markers
    const tempoEvents = this.context.getTempoEvents().filter(inView);
    this.drawMarkers(
      "tempo",
      this.tempoLabelInstance,
      tempoEvents,
      2,
      (event) =>
        `\u266a=${Math.round(60_000_000 / event.microsecondsPerQuarterNote)}`,
    );

    // Draw time signature markers
    const timeSignatureEvents = this.context
      .getTimeSignatureEvents()
      .filter(inView);
    this.drawMarkers(
      "timeSignature",
      this.timeSignatureLabelInstance,
      timeSignatureEvents,
      HeaderTempoLaneHeight + 2,
      (event) => `${event.numerator}/${2 ** event.denominator}`,
    );

    // Draw text markers
    const textEvents = this.context.getTextEvents().filter(inView);
    this.drawMarkers(
      "text",
      this.textLabelInstance,
      textEvents,
      HeaderHeight - 12,
      (event) => event.event.data.text,
      this.options.clipLabels,
    );

    // After drawing the markers, sync the edit controls
    this.syncEditControls();
  }

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
  public promptText(tick: number, handlers: LyricPromptHandlers): void {
    if (this.prompt) this.cancelPrompt();
    this.editingMarker = null;
    this.prompt = { tick, handlers };
    this.promptKey = null;
    this.syncEditControls();
  }

  /** Closes the prompt without committing (e.g. playback started). */
  public cancelPrompt(): void {
    const prompt = this.prompt;
    if (!prompt) return;
    this.prompt = null;
    this.promptKey = null;
    this.editInput?.blur();
    prompt.handlers.onCancel();
    this.syncEditControls();
  }

  /** Opens the edit input on the existing text event at `tick`. */
  public editTextAt(tick: number): void {
    if (this.prompt) this.cancelPrompt();
    this.editingMarker = { lane: "text", tick };
    this.editingMarkerKey = null;
    this.syncEditControls();
  }

  /** Finishes a lyric prompt by committing, advancing with Tab, or cancelling. */
  private finishPrompt(mode: "commit" | "tab" | "blur"): void {
    const prompt = this.prompt;
    const input = this.editInput;
    if (!prompt || !input) return;
    const text = input.value;
    if (mode === "commit" && !text.trim()) return;
    this.prompt = null;
    this.promptKey = null;
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
    return this.editInput;
  }

  /** Returns the marker delete button, if it has been mounted. */
  public getDeleteButton(): HTMLButtonElement | null {
    return this.deleteButton;
  }

  /** Resolves the header lane containing the given local vertical coordinate. */
  public laneAt(y: number): HeaderLane | null {
    if (y < 0 || y >= HeaderHeight) {
      return null;
    }
    return y < HeaderTempoLaneHeight
      ? "tempo"
      : y < HeaderHeight - 10
        ? "timeSignature"
        : "text";
  }

  /** Updates the hovered marker and synchronizes the inline controls. */
  public updateHover(local: CanvasPoint | null): void {
    const lane = local ? this.laneAt(local.y) : null;
    const marker =
      lane && this.context.getMidi()
        ? lane === "tempo"
          ? this.findTempoEventNear(local!.x)
          : lane === "timeSignature"
            ? this.findTimeSignatureEventNear(local!.x)
            : this.findTextEventNear(local!.x)
        : null;

    this.hoveredMarker = marker ? { lane: lane!, tick: marker.tick } : null;
    this.syncEditControls();
  }

  /** Adds a default marker to an empty lane at the clicked tick. */
  public click(point: CanvasPoint): void {
    if (this.context.getState().isPlaying) return;
    const midi = this.context.getMidi();
    const lane = this.laneAt(point.y);
    if (!midi || !lane) {
      return;
    }

    const existing =
      lane === "tempo"
        ? this.findTempoEventNear(point.x)
        : lane === "timeSignature"
          ? this.findTimeSignatureEventNear(point.x)
          : this.findTextEventNear(point.x);
    if (existing) {
      return;
    }

    // Create the lane-specific default value at the snapped tick.
    const tick = this.coordinates.snapTick(
      this.coordinates.tickAtScreenX(point.x),
    );
    let changed = false;
    if (lane === "tempo") {
      midi.addTempoEvent(tick, this.effectiveTempoAt(tick));
      changed = true;
    } else if (lane === "timeSignature") {
      const current = this.effectiveTimeSignatureAt(tick);
      midi.addTimeSignatureEvent(tick, current.numerator, current.denominator);
      changed = true;
    } else if (this.options.createOnClick) {
      const track = this.context.getSelectedTrack();
      if (track) {
        track.addTextEvent(MetaType.Marker, tick, "[section New]");
        changed = true;
      }
    }
    if (changed) {
      this.context.invalidateTempoCache();
      this.context.notifyNotesChanged();
    }
    this.context.requestRender();
  }

  /** Removes the marker under the pointer when the matching lane permits deletion. */
  public rightClick(x: number, y: number): void {
    if (this.context.getState().isPlaying) return;
    const midi = this.context.getMidi();
    const lane = this.laneAt(y);
    if (!midi || !lane) {
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
        changed = midi.removeTempoEventAt(marker.tick);
      } else if (lane === "timeSignature") {
        changed = midi.removeTimeSignatureEventAt(marker.tick);
      } else if (this.options.deleteText) {
        const text = this.findTextEventNear(x);
        if (text)
          changed =
            this.context.getSelectedTrack()?.removeEvent(text.event) ?? false;
      }
    }
    if (changed) {
      this.context.invalidateTempoCache();
      this.context.notifyNotesChanged();
    }
    this.context.requestRender();
  }

  /** Starts dragging a text marker when text dragging is enabled. */
  public beginDrag(point: CanvasPoint): void {
    if (
      this.context.getState().isPlaying ||
      this.laneAt(point.y) !== "text" ||
      !this.options.dragText
    )
      return;
    this.draggingText = this.findTextEventNear(point.x)?.event ?? null;
    if (this.draggingText) this.context.beginEdit();
  }

  /** Moves the active text marker to the nearest snapped tick. */
  public updateDrag(point: CanvasPoint): void {
    if (!this.draggingText || this.context.getState().isPlaying) return;
    const tick = this.coordinates.snapTickToNearest(
      this.coordinates.tickAtScreenX(point.x),
    );
    const track = this.context.getSelectedTrack();
    if (track?.moveEvent(this.draggingText, tick)) {
      this.context.notifyNotesChanged();
      this.context.requestRender();
    }
  }

  /** Ends an active text-marker drag and closes its edit transaction. */
  public endDrag(): void {
    const hadDrag = this.draggingText !== null;
    this.draggingText = null;
    if (hadDrag) this.context.endEdit();
  }

  /** Creates or updates marker labels and highlights for one lane. */
  private drawMarkers<T extends { tick: number }>(
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
        this.host?.appendChild(label);
      }

      const x = this.coordinates.screenXForTick(event.tick);
      const isHovered =
        this.hoveredMarker?.lane === lane &&
        this.hoveredMarker.tick === event.tick;
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
    let highlight = this.highlightInstance[index];
    if (!highlight) {
      highlight = document.createElement("div");
      highlight.style.position = "absolute";
      highlight.style.background = "rgba(255, 0, 0, 0.3)";
      highlight.style.pointerEvents = "none";
      this.highlightInstance[index] = highlight;
      this.host?.appendChild(highlight);
    }
    return highlight;
  }

  /** Finds the tempo marker nearest the given horizontal coordinate. */
  private findTempoEventNear(x: number): TempoEvent | null {
    return this.findMarkerNear(this.context.getTempoEvents(), x);
  }

  /** Finds the time-signature marker nearest the given horizontal coordinate. */
  private findTimeSignatureEventNear(x: number): TimeSignatureEvent | null {
    return this.findMarkerNear(this.context.getTimeSignatureEvents(), x);
  }

  /** Finds the text marker nearest the given horizontal coordinate. */
  private findTextEventNear(
    x: number,
  ): { tick: number; event: TextMidiEvent } | null {
    return this.findMarkerNear(this.context.getTextEvents(), x) as {
      tick: number;
      event: TextMidiEvent;
    } | null;
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
    if (!this.host || this.editInput) return;
    const input = document.createElement("input");
    input.type = "text";
    input.className = "piano-roll-header-input";
    input.style.display = "none";

    // Selecting a marker on focus or click keeps the input tied to the hovered item.
    input.addEventListener("focus", () => {
      if (!this.editingMarker && this.hoveredMarker) {
        this.editingMarker = { ...this.hoveredMarker };
      }
    });
    input.addEventListener("click", () => {
      if (this.hoveredMarker) this.editingMarker = { ...this.hoveredMarker };
    });

    // Handle prompt navigation separately from ordinary marker editing.
    input.addEventListener("keydown", (event) => {
      if (this.prompt) {
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
        this.context.getProfile().editing === "vocal" &&
        this.editingMarker?.lane === "text"
      ) {
        event.preventDefault();
        const tick = this.editingMarker.tick;
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
        this.editingMarker = null;
        input.blur();
        this.syncEditControls();
      }
    });

    // A blur commits marker edits, while lyric prompts have their own finish flow.
    input.addEventListener("blur", () => {
      if (this.prompt) {
        this.finishPrompt("blur");
        return;
      }
      if (this.editingMarker) this.commitEdit(input.value);
      this.syncEditControls();
    });
    this.host.appendChild(input);
    this.editInput = input;
  }

  /** Creates the marker delete button and attaches its click handler. */
  private createDeleteButton(): void {
    if (!this.host || this.deleteButton) return;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "piano-roll-header-delete";
    button.textContent = "\u00d7";
    button.style.display = "none";
    button.addEventListener("mousedown", (event) => event.preventDefault());
    button.addEventListener("click", () => this.deleteHoveredMarker());
    this.host.appendChild(button);
    this.deleteButton = button;
  }

  /** Deletes the currently hovered marker, respecting playback and profile settings. */
  private deleteHoveredMarker(): void {
    if (this.context.getState().isPlaying) return;
    const midi = this.context.getMidi();
    const marker = this.hoveredMarker;
    if (!midi || !marker) return;
    if (marker.lane === "text" && !this.options.deleteText) return;

    // Remove the selected marker through the MIDI or selected-track API.
    let changed = false;
    if (marker.lane === "tempo") changed = midi.removeTempoEventAt(marker.tick);
    else if (marker.lane === "timeSignature") {
      changed = midi.removeTimeSignatureEventAt(marker.tick);
    } else {
      const text = this.findTextEventNear(
        this.coordinates.screenXForTick(marker.tick),
      );
      if (text)
        changed =
          this.context.getSelectedTrack()?.removeEvent(text.event) ?? false;
    }
    this.hoveredMarker = null;
    if (changed) {
      this.context.invalidateTempoCache();
      this.context.notifyNotesChanged();
    }
    this.syncEditControls();
    this.context.requestRender();
  }

  /** Parses and applies the edited value to the active tempo, signature, or text marker. */
  private commitEdit(raw: string): void {
    if (this.context.getState().isPlaying) return;

    const midi = this.context.getMidi();
    const marker = this.editingMarker ?? this.hoveredMarker;
    if (!midi || !marker) return;

    let changed = false;

    // Parse and replace the marker according to its lane.
    if (marker.lane === "tempo") {
      const parsed = parseTempoBpm(raw);
      if (parsed === null) return;

      midi.removeTempoEventAt(marker.tick);
      midi.addTempoEvent(marker.tick, Math.round(60_000_000 / parsed));
      changed = true;
    } else if (marker.lane === "timeSignature") {
      const parsed = parseTimeSignatureInput(raw);
      if (parsed === null) return;

      midi.removeTimeSignatureEventAt(marker.tick);
      midi.addTimeSignatureEvent(
        marker.tick,
        parsed.numerator,
        parsed.denominator,
      );
      changed = true;
    } else {
      const text = this.findTextEventNear(
        this.coordinates.screenXForTick(marker.tick),
      );

      if (text)
        changed =
          this.context.getSelectedTrack()?.updateTextEvent(text.event, raw) ??
          false;
    }

    this.editingMarker = null;
    if (changed) {
      this.context.invalidateTempoCache();
      this.context.notifyNotesChanged();
    }
    this.context.requestRender();
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
          ?.event.data.text ?? ""
      );
    }
    const event = this.context
      .getTimeSignatureEvents()
      .find((candidate) => candidate.tick === marker.tick);
    return event ? `${event.numerator}/${2 ** event.denominator}` : "";
  }

  /** Positions and updates the inline editor and delete button for the active state. */
  private syncEditControls(): void {
    const input = this.editInput;
    const deleteButton = this.deleteButton;
    if (!input || !deleteButton) return;
    if (this.prompt) {
      // Prompts always use the text lane and disable marker deletion.
      const x = this.coordinates.screenXForTick(this.prompt.tick);
      input.style.left = `${x}px`;
      input.style.top = `${HeaderHeight - 12}px`;
      input.style.display = "block";
      input.placeholder = "lyric";
      deleteButton.style.display = "none";
      const key = `prompt:${this.prompt.tick}`;
      if (key !== this.promptKey) {
        this.promptKey = key;
        input.value = this.prompt.handlers.initialText ?? "";
      }
      if (document.activeElement !== input) {
        input.focus();
        input.select();
      }
      return;
    }

    input.placeholder = "";
    const marker = this.editingMarker ?? this.hoveredMarker;
    const focused = document.activeElement === input;

    if (!marker) {
      if (!focused) {
        input.style.display = "none";
        deleteButton.style.display = "none";
        this.editingMarkerKey = null;
      }
      return;
    }

    // Position controls based on the marker lane and keep the value in sync on selection changes.
    const x = this.coordinates.screenXForTick(marker.tick);
    let y = HeaderHeight - 12;
    switch (marker.lane) {
      case "tempo":
        y = 2;
        break;
      case "timeSignature":
        HeaderTempoLaneHeight + 2;
        break;
    }
    const inputWidth = input.getBoundingClientRect().width || 48;
    input.style.left = `${x}px`;
    input.style.top = `${y}px`;
    input.style.display = "block";
    deleteButton.style.left = `${x + inputWidth + 2}px`;
    deleteButton.style.top = `${y}px`;
    deleteButton.style.display =
      marker.lane === "text" && !this.options.deleteText ? "none" : "block";
    const key = `${marker.lane}:${marker.tick}`;
    if (key !== this.editingMarkerKey) {
      this.editingMarkerKey = key;
      input.value = this.formatMarkerValue(marker);
    }
    if (this.editingMarker && document.activeElement !== input) {
      input.focus();
      input.select();
    }
  }
}
