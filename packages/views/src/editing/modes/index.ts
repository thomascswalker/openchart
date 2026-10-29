import type { EditingMode } from "./mode";
import { EditingModeRegistry } from "./registry";
import { createChartLanesMode } from "./lanes/chartLanes";
import { createGlobalTrackMode } from "./global/globalTrack";
import { createRawMidiMode } from "./midi/rawMidi";
import { createVocalsMode } from "./vocals/vocals";

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

export * from "./mode";
export * from "./registry";
export * from "./lanes/chartLanes";
export * from "./global/globalTrack";
export * from "./index";
export * from "./midi/rawMidi";
export * from "./vocals/vocals";
