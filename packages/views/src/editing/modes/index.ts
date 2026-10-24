import type { EditingMode } from "../mode.js";
import { createRawMidiMode } from "./rawMidi.js";

/** Default editing modes in their resolution priority order. */
export const defaultModes: readonly EditingMode[] = [createRawMidiMode()];
