import type { TempoChange, TimeSignatureChange } from "@midiedit/core";
import { Container, Graphics, Point, Text } from "pixi.js";
import {
  HeaderHeight,
  HeaderMarkerHitRadius,
  HeaderMarkerLabelHeight,
  HeaderMarkerLabelWidth,
  HeaderTempoLaneHeight,
} from "./constants";
import type { CoordinateSystem } from "./coordinates";
import type { PianoRollContext } from "./types";

type HeaderLane = "tempo" | "timeSignature";

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

  public readonly graphics = new Graphics();
  public readonly labels = new Container();
  public readonly boxes = new Container();

  private readonly tempoLabelPool: Text[] = [];
  private readonly timeSignatureLabelPool: Text[] = [];
  private hoveredMarker: { lane: HeaderLane; tick: number } | null = null;
  private host: HTMLElement | null = null;
  private editInput: HTMLInputElement | null = null;
  private deleteButton: HTMLButtonElement | null = null;
  private editingMarkerKey: string | null = null;
  private suppressNextEditCommit = false;

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
    this.editInput = null;
    this.deleteButton = null;
    this.host = null;
    this.hoveredMarker = null;
    this.editingMarkerKey = null;
  }

  public getDisplayObjects(): [Graphics, Container, Container] {
    return [this.graphics, this.labels, this.boxes];
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
    return y < HeaderTempoLaneHeight ? "tempo" : "timeSignature";
  }

  public updateHover(local: Point | null): void {
    const lane = local ? this.laneAt(local.y) : null;
    const marker =
      lane && this.context.getMidi()
        ? lane === "tempo"
          ? this.findTempoMarkerNear(local!.x)
          : this.findTimeSignatureMarkerNear(local!.x)
        : null;

    this.hoveredMarker = marker ? { lane: lane!, tick: marker.tick } : null;
    this.syncEditControls();
  }

  public click(point: Point): void {
    const midi = this.context.getMidi();
    const lane = this.laneAt(point.y);
    if (!midi || !lane) {
      return;
    }

    const existing =
      lane === "tempo"
        ? this.findTempoMarkerNear(point.x)
        : this.findTimeSignatureMarkerNear(point.x);
    if (existing) {
      return;
    }

    const tick = this.coordinates.snapTick(
      this.coordinates.tickAtScreenX(point.x),
    );
    if (lane === "tempo") {
      midi.addTempoChange(tick, this.effectiveTempoAt(tick));
    } else {
      const current = this.effectiveTimeSignatureAt(tick);
      midi.addTimeSignatureChange(tick, current.numerator, current.denominator);
    }
    this.context.invalidateTempoCache();
    this.context.requestRender();
  }

  public rightClick(x: number, y: number): void {
    const midi = this.context.getMidi();
    const lane = this.laneAt(y);
    if (!midi || !lane) {
      return;
    }

    const marker =
      lane === "tempo"
        ? this.findTempoMarkerNear(x)
        : this.findTimeSignatureMarkerNear(x);
    if (marker) {
      if (lane === "tempo") {
        midi.removeTempoChangeAt(marker.tick);
      } else {
        midi.removeTimeSignatureChangeAt(marker.tick);
      }
    }
    this.context.invalidateTempoCache();
    this.context.requestRender();
  }

  public draw(width: number): void {
    this.graphics.beginFill(0x1c1c1c);
    this.graphics.drawRect(0, 0, width, HeaderTempoLaneHeight);
    this.graphics.endFill();
    this.graphics.beginFill(0x181818);
    this.graphics.drawRect(
      0,
      HeaderTempoLaneHeight,
      width,
      HeaderHeight - HeaderTempoLaneHeight,
    );
    this.graphics.endFill();
    this.graphics.lineStyle(1, 0x3a3a3a);
    this.graphics
      .moveTo(0, HeaderTempoLaneHeight)
      .lineTo(width, HeaderTempoLaneHeight);
    this.graphics.lineStyle(1, 0x555555);
    this.graphics.moveTo(0, HeaderHeight).lineTo(width, HeaderHeight);

    const visibleWidth = Math.max(0, width - this.context.getKeyboardWidth());
    const visibleStart = this.coordinates.getCamera().x;
    const visibleEnd = this.coordinates.tickAtScreenX(
      this.context.getKeyboardWidth() + visibleWidth,
    );
    const inView = (change: { tick: number }) =>
      change.tick >= visibleStart && change.tick <= visibleEnd;

    this.boxes.removeChildren();
    this.drawMarkers(
      "tempo",
      this.tempoLabelPool,
      this.context.getTempoChanges().filter(inView),
      2,
      (change) =>
        `\u266a=${Math.round(60_000_000 / change.microsecondsPerQuarterNote)}`,
    );
    this.drawMarkers(
      "timeSignature",
      this.timeSignatureLabelPool,
      this.context.getTimeSignatureChanges().filter(inView),
      HeaderTempoLaneHeight + 2,
      (change) => `${change.numerator}/${2 ** change.denominator}`,
    );
    this.syncEditControls();
  }

  private drawMarkers<T extends { tick: number }>(
    lane: HeaderLane,
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
        this.labels.addChild(label);
      }

      const x = this.coordinates.screenXForTick(change.tick);
      const isHovered =
        this.hoveredMarker?.lane === lane &&
        this.hoveredMarker.tick === change.tick;
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
        this.boxes.addChild(highlight);
      }
      label.text = formatText(change);
      label.position.set(x + 3, y);
      label.visible = x >= this.context.getKeyboardWidth();
    });

    for (let index = changes.length; index < pool.length; index++) {
      pool[index].visible = false;
    }
  }

  private findTempoMarkerNear(x: number): TempoChange | null {
    return this.findMarkerNear(this.context.getTempoChanges(), x);
  }

  private findTimeSignatureMarkerNear(x: number): TimeSignatureChange | null {
    return this.findMarkerNear(this.context.getTimeSignatureChanges(), x);
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
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") input.blur();
      else if (event.key === "Escape") {
        this.suppressNextEditCommit = true;
        input.blur();
      }
    });
    input.addEventListener("blur", () => {
      if (this.suppressNextEditCommit) this.suppressNextEditCommit = false;
      else this.commitEdit(input.value);
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
    const midi = this.context.getMidi();
    const marker = this.hoveredMarker;
    if (!midi || !marker) return;
    if (marker.lane === "tempo") midi.removeTempoChangeAt(marker.tick);
    else midi.removeTimeSignatureChangeAt(marker.tick);
    this.hoveredMarker = null;
    this.context.invalidateTempoCache();
    this.syncEditControls();
    this.context.requestRender();
  }

  private commitEdit(raw: string): void {
    const midi = this.context.getMidi();
    const marker = this.hoveredMarker;
    if (!midi || !marker) return;
    if (marker.lane === "tempo") {
      const parsed = parseTempoBpm(raw);
      if (parsed === null) return;
      midi.removeTempoChangeAt(marker.tick);
      midi.addTempoChange(marker.tick, Math.round(60_000_000 / parsed));
    } else {
      const parsed = parseTimeSignatureInput(raw);
      if (parsed === null) return;
      midi.removeTimeSignatureChangeAt(marker.tick);
      midi.addTimeSignatureChange(
        marker.tick,
        parsed.numerator,
        parsed.denominator,
      );
    }
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
    const change = this.context
      .getTimeSignatureChanges()
      .find((candidate) => candidate.tick === marker.tick);
    return change ? `${change.numerator}/${2 ** change.denominator}` : "";
  }

  private syncEditControls(): void {
    const input = this.editInput;
    const deleteButton = this.deleteButton;
    if (!input || !deleteButton) return;
    const marker = this.hoveredMarker;
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
      input.value = this.formatMarkerValue(marker);
    }
  }
}
