import { rgbFromHex } from "./rendering/materials";

export const defaultCameraPosition = { x: 0, y: 7, z: 7 };
export const defaultCameraRotation = { x: -0.65, y: 0, z: 0 };
export const defaultCameraFieldOfView = 45;
export const wheelTicksPerPixel = 1 / 100;
export const phraseAutoScrollEdgeMargin = 48;
export const phraseAutoScrollMaximumTicksPerFrame = 96;
export const phrasePlacementIndicatorColor = 0xff0000;
export const phrasePlacementIndicatorThickness = 0.08;
export const phraseStartBoundaryIndicatorColor = phrasePlacementIndicatorColor;
export const phraseEndBoundaryIndicatorColor = phrasePlacementIndicatorColor;
export const phraseBoundaryIndicatorThickness =
  phrasePlacementIndicatorThickness;
/** Most visual columns a chart can have; the board pre-allocates this many. */
export const maxLaneColumns = 8;
/** Used only for lanes whose ruleset definition has no `color`. */
export const fallbackLaneColors = [
  0x00a651, 0xdc2626, 0xfacc15, 0x2563eb, 0xf97316, 0x8b5cf6, 0x14b8a6,
  0xec4899,
];
export const fallbackBarColor = 0x9ca3af;
export const instanceSizeBeatLines = 64;
export const instanceSizePhraseSpans = 128;
export const strikeLineZ = -3.5;
export const farBoardZ = -44;
export const nearBoardZ = 0.5;
export const fallbackLaneRgbColors = fallbackLaneColors.map(rgbFromHex);
export const fallbackBarRgb = rgbFromHex(fallbackBarColor);
