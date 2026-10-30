import type { Midi, MidiChannelEvent } from "@openchart/midi";
import type { ChartView, EditingSession, PreviewState } from "@openchart/views";
import type { ChartViewState } from "../AbstractChartView";
import type {
  HighwayGhostNoteLocation,
  HighwaySelectionRange,
  HighwayMarqueeDragState,
  HighwayPhraseHoverState,
} from "./types";
import type {
  HighwayMode,
  HighwayNotePlacementType,
  HighwayPhraseKind,
} from "./types";

/** Narrow view services available to highway-specific collaborators. */
export interface HighwayContext {
  getState(): ChartViewState;
  getMidi(): Midi | null;
  getPpqn(): number;
  getCurrentChart(): ChartView | null;
  getEditingSession(): EditingSession | undefined;
  getPreviewState(): PreviewState | null;
  setPreviewState(preview: PreviewState | null): void;
  getViewport(): { width: number; height: number };
  getPlayheadTick(): number;
  getCameraTick(): number;
  getScrollSpeedMultiplier?(): number;
  setCameraTick(tick: number): void;
  getMode(): HighwayMode;
  getNotePlacementType?(): HighwayNotePlacementType;
  getPhraseMode(): HighwayPhraseKind | null;
  getPhraseHoverState(): HighwayPhraseHoverState | null;
  getSelectionRange(): HighwaySelectionRange | null;
  getGhostNoteLocation(): HighwayGhostNoteLocation | null;
  getHoveredNoteOn(): MidiChannelEvent | null;
  canShowNotePlacementPreview(): boolean;
  getCanvas(): HTMLCanvasElement | null;
  requestRender(): void;
  requestSeek(tick: number): void;
  changeSnapDenominator(denominator: number): void;
  stepSnapDenominator(direction: -1 | 1): void;
  setPlayheadTick(tick: number): void;
  setSelectionRange(range: HighwaySelectionRange | null): void;
  updateMarqueeOutline(marquee: HighwayMarqueeDragState | null): void;
  clearHoverOutline(): void;
}
