import type { EditingMode } from "../mode.js";
import { EditingModeRegistry } from "../modeRegistry.js";
import { createChartDrumsMode } from "./chartDrums.js";
import { createChartFretsMode } from "./chartFrets.js";
import { createGlobalTrackMode } from "./globalTrack.js";
import { createRawMidiMode } from "./rawMidi.js";
import { createVocalsMode } from "./vocals.js";

/** Creates the modes implemented so far in the plan's priority order. */
export function createDefaultModes(): readonly EditingMode[] {
  return [
    createGlobalTrackMode(),
    createVocalsMode(),
    createChartDrumsMode(),
    createChartFretsMode(),
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
