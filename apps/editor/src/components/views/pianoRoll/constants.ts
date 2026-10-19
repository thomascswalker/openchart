import type { TempoEvent, TimeSignatureEvent } from "@openchart/core";
import type { VocalMarks } from "./types";

export const BlackPitchClasses = new Set([
  1, // C#
  3, // D#
  6, // F#
  8, // G#
  10, // A#
]);
export const MinimumPixelsPerQuarter = 20;
export const MaximumPixelsPerQuarter = 2000;
export const MinimumPixelsPerSemitone = 6;
export const MaximumPixelsPerSemitone = 64;

/**
 * Height, in pixels, of the tempo/time-signature strip above the grid.
 */
export const HeaderHeight = 36;
export const HeaderLaneHeight = HeaderHeight / 3;

/**
 * Distance, in pixels, within which a click is considered "on" a tempo/TS marker.
 */
export const HeaderMarkerHitRadius = 6;

/**
 * Width, in pixels, of a marker's label hit-box, extending rightward from
 * its tick position (matching the drawn label so hover/click land on the
 * visible text, not just the marker's exact tick pixel).
 */
export const HeaderMarkerLabelWidth = 50;

/**
 * Height, in pixels, of a marker's label hit-box.
 */
export const HeaderMarkerLabelHeight = 25;

/**
 * Width, in pixels, of the draggable hit-region along a note's right edge
 * used to resize its duration.
 */
export const NoteResizeHandleWidth = 6;

/**
 * Controls how quickly wheel input zooms.
 */
export const ZoomSensitivity = 0.0015;

/**
 * Selectable snap-to-grid note-value denominators (as in "1/N").
 */
export const SnapDenominators = [
  1, 2, 3, 4, 6, 8, 12, 16, 24, 32, 48, 64,
] as const;

export const KeyboardWidth = 64;

export const ClickMovementThreshold = 4;

export const EmptyMarks: VocalMarks = {
  missingLyric: new Set(),
  missingTicks: [],
};

export const DefaultTempoEvents: TempoEvent[] = [
  { tick: 0, microsecondsPerQuarterNote: 500_000 },
];
export const DefaultTimeSignatureEvents: TimeSignatureEvent[] = [
  { tick: 0, numerator: 4, denominator: 2 },
];

export const DefaultCamera = {
  x: 0,
  y: 84,
  h: 120,
  v: 18,
};
