import type { MidiChannelEvent, MidiNote } from "@openchart/midi";
import type { EntityId } from "@openchart/views";

export type HighwayTool = "select" | "place" | "remove";

/** A phrase id from the track's ruleset (e.g. `stagePower`, `solo`). */
export type HighwayPhraseKind = string;
/** A tool (`select`/`place`/`remove`) or, for phrase tools, a phrase id. */
export type HighwayMode = HighwayTool | HighwayPhraseKind;
/** Ruleset placement token: `normal`, `padType:<t>`, `bar:<lane>`, `marker:<effect>`. */
export type HighwayNotePlacementType = string;

export function isHighwayTool(value: unknown): value is HighwayTool {
  return value === "select" || value === "place" || value === "remove";
}

export interface HighwaySelectionRange {
  start: number;
  end: number;
}

/** The phrase id for a phrase-tool mode, or null for the plain tools. */
export function getPhraseModeForHighwayMode(
  mode: HighwayMode,
): HighwayPhraseKind | null {
  return isHighwayTool(mode) ? null : mode;
}

export interface HighwayPhraseDragState {
  pointerId: number;
  kind: HighwayPhraseKind;
  startTick: number;
  endTick: number;
  pointerTick: number;
  initialStartTick: number;
  initialEndTick: number;
  operation: "create" | "move" | "resize-start" | "resize-end";
  id: EntityId | null;
  moved: boolean;
}

export interface HighwayPhraseHoverState {
  id: EntityId | null;
  operation: HighwayPhraseDragState["operation"] | null;
  placementTick: number | null;
}

export interface HighwayDragState {
  pointerId: number;
  button: 0 | 2;
  shiftKey: boolean;
  moved: boolean;
  sustainHit: MidiNote | null;
  noteOn: MidiChannelEvent;
  noteOns: MidiChannelEvent[];
  targets: Array<{
    noteOn: MidiChannelEvent;
    initialTick: number;
    initialLane: number;
  }>;
  initialLane: number;
  initialTick: number;
  pointerLane: number;
  pointerTick: number;
  resizing: boolean;
  changed: boolean;
}

export interface HighwayMarqueeDragState {
  pointerId: number;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
  additive: boolean;
  moved: boolean;
}

export interface HighwayScreenBounds {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export interface HighwayGhostNoteLocation {
  lane: number;
  tick: number;
  shiftKey: boolean;
  sustainHit: MidiNote | null;
}
