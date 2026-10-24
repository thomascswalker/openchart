import type { Midi, MidiChannelEvent } from "@openchart/midi";
import type { ChartView } from "@openchart/views";
import type { ChartViewState } from "../AbstractChartView";
import type { SelectionContext } from "./selection";
import type { EditablePhraseKind } from "@openchart/views";
import type {
  HighwayGhostNoteLocation,
  HighwaySelectionRange,
  HighwayMarqueeDragState,
  HighwayPhraseHoverState,
} from "./types";
import type { HighwayMode, HighwayNotePlacementType } from "./types";
import type { DrumPlacementKind } from "./profile";

/** Narrow view services available to highway-specific collaborators. */
export interface HighwayContext {
  getState(): ChartViewState;
  getMidi(): Midi | null;
  getPpqn(): number;
  getCurrentChart(): ChartView | null;
  getViewport(): { width: number; height: number };
  getPlayheadTick(): number;
  getCameraTick(): number;
  getScrollSpeedMultiplier?(): number;
  setCameraTick(tick: number): void;
  getMode(): HighwayMode;
  getNotePlacementType?(): HighwayNotePlacementType;
  getDrumPlacementKind(): DrumPlacementKind;
  getPhraseMode(): EditablePhraseKind | null;
  getPhraseHoverState(): HighwayPhraseHoverState | null;
  getSelectionRange(): HighwaySelectionRange | null;
  getSelectionContext(): SelectionContext;
  getGhostNoteLocation(): HighwayGhostNoteLocation | null;
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
  setSelectionRange(range: HighwaySelectionRange | null): void;
  updateMarqueeOutline(marquee: HighwayMarqueeDragState | null): void;
  clearHoverOutline(): void;
}
