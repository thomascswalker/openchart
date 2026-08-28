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

/**
 * Height, in pixels, of the tempo lane within the header (top half).
 */
export const HeaderTempoLaneHeight = HeaderHeight / 2;

/**
 * Distance, in pixels, within which a click is considered "on" a tempo/TS marker.
 */
export const HeaderMarkerHitRadius = 6;

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
