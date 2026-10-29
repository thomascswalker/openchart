import type { EditingMode } from "./mode.js";
import { EditingModeRegistry } from "./registry.js";
import { createChartLanesMode } from "./lanes/chartLanes.js";
import { createGlobalTrackMode } from "./global/globalTrack.js";
import { createRawMidiMode } from "./midi/rawMidi.js";
import { createVocalsMode } from "./vocals/vocals.js";

/** Creates the modes implemented so far in the plan's priority order. */
export function createDefaultModes(): readonly EditingMode[] {
  return [
    createGlobalTrackMode(),
    createVocalsMode(),
    createChartLanesMode(),
    createRawMidiMode(),
  ];
}

/** Default editing modes in their resolution priority order. */
export const defaultModes: readonly EditingMode[] = createDefaultModes();

/** Creates a fresh registry with every mode currently implemented. */
export function createDefaultModeRegistry(): EditingModeRegistry {
  const registry = new EditingModeRegistry();
  createDefaultModes().forEach((mode) => registry.register(mode));
  return registry;
}
