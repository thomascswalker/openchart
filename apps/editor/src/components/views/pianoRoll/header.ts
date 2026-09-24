import { MetaType, type TempoChange, type TextMidiEvent, type TimeSignatureChange } from "@midiedit/core";
import type { CanvasPoint } from "../../../rendering/geometry";
import {
  HeaderHeight,
  HeaderMarkerHitRadius,
  HeaderMarkerLabelHeight,
  HeaderMarkerLabelWidth,
  HeaderTempoLaneHeight,
} from "./constants";
import type { CoordinateSystem } from "./coordinates";
import type { PianoRollContext } from "./types";

type HeaderLane = "tempo" | "timeSignature" | "text";

export function parseTempoBpm(raw: string): number | null {
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

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

/** Owns marker hit-testing, editing controls, and header rendering. */
export class HeaderController {
  private readonly context: PianoRollContext;
  private readonly coordinates: CoordinateSystem;

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

  public constructor(context: PianoRollContext, coordinates: CoordinateSystem) {
    this.context = context;
    this.coordinates = coordinates;
  }

  public mount(host: HTMLElement): void {
    this.host = host;
    this.createEditInput();
    this.createDeleteButton();
  }

  public destroy(): void {
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
  }

  public getEditInput(): HTMLInputElement | null {
    return this.editInput;
  }

  public getDeleteButton(): HTMLButtonElement | null {
    return this.deleteButton;
  }

  public laneAt(y: number): HeaderLane | null {
    if (y < 0 || y >= HeaderHeight) {
      return null;
    }
    return y < HeaderTempoLaneHeight ? "tempo" : y < HeaderHeight - 10 ? "timeSignature" : "text";
  }

  public updateHover(local: CanvasPoint | null): void {
    const lane = local ? this.laneAt(local.y) : null;
    const marker =
      lane && this.context.getMidi()
        ? lane === "tempo"
          ? this.findTempoMarkerNear(local!.x)
          : lane === "timeSignature"
            ? this.findTimeSignatureMarkerNear(local!.x)
            : this.findTextMarkerNear(local!.x)
        : null;

    this.hoveredMarker = marker ? { lane: lane!, tick: marker.tick } : null;
    this.syncEditControls();
  }

  public click(point: CanvasPoint): void {
    if (this.context.getState().isPlaying) return;
    const midi = this.context.getMidi();
    const lane = this.laneAt(point.y);
    if (!midi || !lane) {
      return;
    }

    const existing =
      lane === "tempo"
        ? this.findTempoMarkerNear(point.x)
        : lane === "timeSignature"
          ? this.findTimeSignatureMarkerNear(point.x)
          : this.findTextMarkerNear(point.x);
    if (existing) {
      return;
    }

    const tick = this.coordinates.snapTick(
      this.coordinates.tickAtScreenX(point.x),
    );
    if (lane === "tempo") {
      midi.addTempoChange(tick, this.effectiveTempoAt(tick));
    } else if (lane === "timeSignature") {
      const current = this.effectiveTimeSignatureAt(tick);
      midi.addTimeSignatureChange(tick, current.numerator, current.denominator);
    } else {
      const track = this.context.getSelectedTrack();
      if (track) {
        track.addTextEvent(MetaType.Marker, tick, "[section New]");
        this.context.notifyNotesChanged();
      }
    }
    this.context.invalidateTempoCache();
    this.context.requestRender();
  }

  public rightClick(x: number, y: number): void {
    if (this.context.getState().isPlaying) return;
    const midi = this.context.getMidi();
    const lane = this.laneAt(y);
    if (!midi || !lane) {
      return;
    }

    const marker =
      lane === "tempo"
        ? this.findTempoMarkerNear(x)
        : lane === "timeSignature"
          ? this.findTimeSignatureMarkerNear(x)
          : this.findTextMarkerNear(x);
    if (marker) {
      if (lane === "tempo") {
        midi.removeTempoChangeAt(marker.tick);
      } else if (lane === "timeSignature") {
        midi.removeTimeSignatureChangeAt(marker.tick);
      } else {
        const text = this.findTextMarkerNear(x);
        if (text) this.context.getSelectedTrack()?.removeEvent(text.event);
      }
    }
    this.context.invalidateTempoCache();
    this.context.requestRender();
  }

  public beginDrag(point: CanvasPoint): void {
    if (this.context.getState().isPlaying || this.laneAt(point.y) !== "text") return;
    this.draggingText = this.findTextMarkerNear(point.x)?.event ?? null;
  }

  public updateDrag(point: CanvasPoint): void {
    if (!this.draggingText || this.context.getState().isPlaying) return;
    const tick = this.coordinates.snapTickToNearest(this.coordinates.tickAtScreenX(point.x));
    const track = this.context.getSelectedTrack();
    if (track?.moveEvent(this.draggingText, tick)) {
      this.context.notifyNotesChanged();
      this.context.requestRender();
    }
  }

  public endDrag(): void {
    this.draggingText = null;
  }

  public draw(width: number): void {
    if (!this.host) return;
    this.host.style.background = "#1c1c1c";
    this.host.style.borderBottom = "1px solid #555";

    const visibleWidth = Math.max(0, width - this.context.getKeyboardWidth());
    const visibleStart = this.coordinates.getCamera().x;
    const visibleEnd = this.coordinates.tickAtScreenX(
      this.context.getKeyboardWidth() + visibleWidth,
    );
    const inView = (change: { tick: number }) =>
      change.tick >= visibleStart && change.tick <= visibleEnd;

    this.highlightInstance.forEach((highlight) => {
      highlight.style.display = "none";
    });
    this.drawMarkers(
      "tempo",
      this.tempoLabelInstance,
      this.context.getTempoChanges().filter(inView),
      2,
      (change) =>
        `\u266a=${Math.round(60_000_000 / change.microsecondsPerQuarterNote)}`,
    );
    this.drawMarkers(
      "timeSignature",
      this.timeSignatureLabelInstance,
      this.context.getTimeSignatureChanges().filter(inView),
      HeaderTempoLaneHeight + 2,
      (change) => `${change.numerator}/${2 ** change.denominator}`,
    );
    this.drawMarkers(
      "text",
      this.textLabelInstance,
      this.context.getTextEvents().filter(inView),
      HeaderHeight - 12,
      (change) => change.event.data.text,
    );
    this.syncEditControls();
  }

  private drawMarkers<T extends { tick: number }>(
    lane: HeaderLane,
    instance: HTMLDivElement[],
    changes: T[],
    y: number,
    formatText: (change: T) => string,
  ): void {
    changes.forEach((change, index) => {
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

      const x = this.coordinates.screenXForTick(change.tick);
      const isHovered =
        this.hoveredMarker?.lane === lane &&
        this.hoveredMarker.tick === change.tick;
      if (isHovered) {
        const highlight = this.getHighlight(index);
        highlight.style.display = "block";
        highlight.style.left = `${x}px`;
        highlight.style.top = `${y}px`;
        highlight.style.width = `${HeaderMarkerLabelWidth}px`;
        highlight.style.height = `${HeaderMarkerLabelHeight}px`;
      }
      label.textContent = formatText(change);
      label.style.left = `${x + 3}px`;
      label.style.top = `${y}px`;
      label.style.display =
        x >= this.context.getKeyboardWidth() ? "block" : "none";
    });

    for (let index = changes.length; index < instance.length; index++) {
      instance[index].style.display = "none";
    }
  }

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

  private findTempoMarkerNear(x: number): TempoChange | null {
    return this.findMarkerNear(this.context.getTempoChanges(), x);
  }

  private findTimeSignatureMarkerNear(x: number): TimeSignatureChange | null {
    return this.findMarkerNear(this.context.getTimeSignatureChanges(), x);
  }

  private findTextMarkerNear(x: number): { tick: number; event: TextMidiEvent } | null {
    return this.findMarkerNear(this.context.getTextEvents(), x) as {
      tick: number;
      event: TextMidiEvent;
    } | null;
  }

  private findMarkerNear<T extends { tick: number }>(
    changes: T[],
    x: number,
  ): T | null {
    let closest: T | null = null;
    let closestDistance = Infinity;
    for (const change of changes) {
      const markerX = this.coordinates.screenXForTick(change.tick);
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

  private effectiveTempoAt(tick: number): number {
    let value =
      this.context.getTempoChanges()[0]?.microsecondsPerQuarterNote ?? 500_000;
    for (const change of this.context.getTempoChanges()) {
      if (change.tick > tick) break;
      value = change.microsecondsPerQuarterNote;
    }
    return value;
  }

  private effectiveTimeSignatureAt(tick: number): {
    numerator: number;
    denominator: number;
  } {
    let value = this.context.getTimeSignatureChanges()[0] ?? {
      numerator: 4,
      denominator: 2,
    };
    for (const change of this.context.getTimeSignatureChanges()) {
      if (change.tick > tick) break;
      value = change;
    }
    return { numerator: value.numerator, denominator: value.denominator };
  }

  private createEditInput(): void {
    if (!this.host || this.editInput) return;
    const input = document.createElement("input");
    input.type = "text";
    input.className = "piano-roll-header-input";
    input.style.display = "none";
    input.addEventListener("focus", () => {
      if (!this.editingMarker && this.hoveredMarker) {
        this.editingMarker = { ...this.hoveredMarker };
      }
    });
    input.addEventListener("click", () => {
      if (this.hoveredMarker) this.editingMarker = { ...this.hoveredMarker };
    });
    input.addEventListener("keydown", (event) => {
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
    input.addEventListener("blur", () => {
      if (this.editingMarker) this.commitEdit(input.value);
      this.syncEditControls();
    });
    this.host.appendChild(input);
    this.editInput = input;
  }

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

  private deleteHoveredMarker(): void {
    if (this.context.getState().isPlaying) return;
    const midi = this.context.getMidi();
    const marker = this.hoveredMarker;
    if (!midi || !marker) return;
    if (marker.lane === "tempo") midi.removeTempoChangeAt(marker.tick);
    else if (marker.lane === "timeSignature") midi.removeTimeSignatureChangeAt(marker.tick);
    else {
      const text = this.findTextMarkerNear(this.coordinates.screenXForTick(marker.tick));
      if (text) this.context.getSelectedTrack()?.removeEvent(text.event);
    }
    this.hoveredMarker = null;
    this.context.invalidateTempoCache();
    this.syncEditControls();
    this.context.requestRender();
  }

  private commitEdit(raw: string): void {
    if (this.context.getState().isPlaying) return;
    const midi = this.context.getMidi();
    const marker = this.editingMarker ?? this.hoveredMarker;
    if (!midi || !marker) return;
    if (marker.lane === "tempo") {
      const parsed = parseTempoBpm(raw);
      if (parsed === null) return;
      midi.removeTempoChangeAt(marker.tick);
      midi.addTempoChange(marker.tick, Math.round(60_000_000 / parsed));
    } else if (marker.lane === "timeSignature") {
      const parsed = parseTimeSignatureInput(raw);
      if (parsed === null) return;
      midi.removeTimeSignatureChangeAt(marker.tick);
      midi.addTimeSignatureChange(
        marker.tick,
        parsed.numerator,
        parsed.denominator,
      );
    } else {
      const text = this.findTextMarkerNear(this.coordinates.screenXForTick(marker.tick));
      if (text) this.context.getSelectedTrack()?.updateTextEvent(text.event, raw);
    }
    this.editingMarker = null;
    this.context.invalidateTempoCache();
    this.context.requestRender();
  }

  private formatMarkerValue(marker: {
    lane: HeaderLane;
    tick: number;
  }): string {
    if (marker.lane === "tempo") {
      const change = this.context
        .getTempoChanges()
        .find((candidate) => candidate.tick === marker.tick);
      return change
        ? String(Math.round(60_000_000 / change.microsecondsPerQuarterNote))
        : "";
    }
    if (marker.lane === "text") {
      return this.findTextMarkerNear(this.coordinates.screenXForTick(marker.tick))?.event.data.text ?? "";
    }
    const change = this.context
      .getTimeSignatureChanges()
      .find((candidate) => candidate.tick === marker.tick);
    return change ? `${change.numerator}/${2 ** change.denominator}` : "";
  }

  private syncEditControls(): void {
    const input = this.editInput;
    const deleteButton = this.deleteButton;
    if (!input || !deleteButton) return;
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
    const x = this.coordinates.screenXForTick(marker.tick);
    const y = marker.lane === "tempo" ? 2 : marker.lane === "timeSignature" ? HeaderTempoLaneHeight + 2 : HeaderHeight - 12;
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
      input.value = this.formatMarkerValue(marker);
    }
    if (this.editingMarker && document.activeElement !== input) {
      input.focus();
      input.select();
    }
  }
}
