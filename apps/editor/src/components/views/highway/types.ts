import type { MidiChannelEvent, MidiNote } from "@openchart/core";
import type { EditablePhraseKind } from "@openchart/views";
import type { DrumNoteKind } from "./drumProfile";

export type HighwayTool = "select" | "place" | "remove";
/** Phrases the Highway can place; vocal phrases live in the Piano Roll. */
export type HighwayPhraseKind = Extract<
  EditablePhraseKind,
  "stagepower" | "solo"
>;
export type HighwayMode = HighwayTool | HighwayPhraseKind;
export type HighwayNotePlacementType =
  "normal" | "force-hopo" | "force-strum" | "tap";

export function getPhraseModeForHighwayMode(
  mode: HighwayMode,
): EditablePhraseKind | null {
  return mode === "stagepower" || mode === "solo" ? mode : null;
}

export interface HighwayClipboardNote {
  relativeTick: number;
  relativeLane: number;
  durationTicks: number;
  velocity: number;
  drumKind?: DrumNoteKind;
  originalPitch?: number;
}

export interface PhraseDragState {
  pointerId: number;
  kind: EditablePhraseKind;
  startTick: number;
  endTick: number;
  pointerTick: number;
  initialStartTick: number;
  initialEndTick: number;
  operation: "create" | "move" | "resize-start" | "resize-end";
  note: MidiNote | null;
  moved: boolean;
}

export interface PhraseHoverState {
  noteOn: MidiChannelEvent | null;
  operation: PhraseDragState["operation"] | null;
  placementTick: number | null;
}

export interface DragState {
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

export interface MarqueeDragState {
  pointerId: number;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
  additive: boolean;
  moved: boolean;
}

export interface ScreenBounds {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export interface GhostNoteLocation {
  lane: number;
  tick: number;
  shiftKey: boolean;
  sustainHit: MidiNote | null;
}
