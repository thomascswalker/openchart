import type { AbstractEditingMode } from "./mode";
import { EditingModeRegistry } from "./registry";
import { ChartLanesMode } from "./lanes/chartLanes";
import { GlobalTrackMode } from "./global/globalTrack";
import { RawMidiMode } from "./midi/rawMidi";
import { VocalsMode } from "./vocals/vocals";

/** Creates the modes implemented so far in the plan's priority order. */
export function createDefaultModes(): readonly AbstractEditingMode[] {
  return [
    new GlobalTrackMode(),
    new VocalsMode(),
    new ChartLanesMode(),
    new RawMidiMode(),
  ];
}

/** Default editing modes in their resolution priority order. */
export const defaultModes: readonly AbstractEditingMode[] =
  createDefaultModes();

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
