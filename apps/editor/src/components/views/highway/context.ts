import type { Midi, MidiChannelEvent } from "@midiedit/core";
import type { ChartView } from "@midiedit/views";
import type { ChartViewState } from "../AbstractChartView";
import type { SelectionContext } from "./selection";
import type { EditablePhraseKind } from "@midiedit/views";
import type { GhostNoteLocation, MarqueeDragState } from "./types";
import type { HighwayMode } from "./types";

/** Narrow view services available to highway-specific collaborators. */
export interface HighwayContext {
  getState(): ChartViewState;
  getMidi(): Midi | null;
  getPpqn(): number;
  getCurrentChart(): ChartView | null;
  getViewport(): { width: number; height: number };
  getPlayheadTick(): number;
  getMode(): HighwayMode;
  getPhraseMode(): EditablePhraseKind | null;
  getSelectionContext(): SelectionContext;
  getGhostNoteLocation(): GhostNoteLocation | null;
  getHoveredNoteOn(): MidiChannelEvent | null;
  canShowNotePlacementPreview(): boolean;
  getCanvas(): HTMLCanvasElement | null;
  requestRender(): void;
  beginEdit(): void;
  endEdit(): void;
  notifyNotesChanged(): void;
  requestSeek(tick: number): void;
  changeSnapDenominator(denominator: number): void;
  stepSnapDenominator(direction: -1 | 1): void;
  setPlayheadTick(tick: number): void;
  updateMarqueeOutline(marquee: MarqueeDragState | null): void;
  clearHoverOutline(): void;
}
