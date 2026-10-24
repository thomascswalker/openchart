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
export const laneColors = [0x00a651, 0xdc2626, 0xfacc15, 0x2563eb, 0xf97316];
export const laneCount = laneColors.length;
export const drumLaneColors = [0xdc2626, 0xfacc15, 0x2563eb, 0x00a651];
export const kickColor = rgbFromHex(0x9ca3af);
export const instanceSizeBeatLines = 64;
export const instanceSizePhraseSpans = 128;
export const strikeLineZ = -3.5;
export const farBoardZ = -44;
export const nearBoardZ = 0.5;
export const laneRgbColors = laneColors.map(rgbFromHex);
export const drumLaneRgbColors = drumLaneColors.map(rgbFromHex);
