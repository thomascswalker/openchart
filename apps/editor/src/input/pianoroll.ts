import { defineBindings } from "./define.ts";

/** Hotkeys active while the active viewport shows the Piano Roll. */
export const pianoRollBindings = defineBindings("pianoroll", {
  "piano-roll.transpose-selection#up": {
    hotkey: "ArrowUp",
    args: [1],
    target: "canvas",
    options: { requireReset: false },
    name: "Transpose up",
    group: "Piano roll",
  },
  "piano-roll.transpose-selection#down": {
    hotkey: "ArrowDown",
    args: [-1],
    target: "canvas",
    options: { requireReset: false },
    name: "Transpose down",
    group: "Piano roll",
  },
  "piano-roll.transpose-selection#octave-up": {
    hotkey: "Shift+ArrowUp",
    args: [12],
    target: "canvas",
    options: { requireReset: false },
    name: "Transpose up an octave",
    group: "Piano roll",
  },
  "piano-roll.transpose-selection#octave-down": {
    hotkey: "Shift+ArrowDown",
    args: [-12],
    target: "canvas",
    options: { requireReset: false },
    name: "Transpose down an octave",
    group: "Piano roll",
  },
  "piano-roll.move-selection#earlier": {
    hotkey: "ArrowLeft",
    args: [-1],
    target: "canvas",
    options: { requireReset: false },
    name: "Move earlier",
    group: "Piano roll",
  },
  "piano-roll.move-selection#later": {
    hotkey: "ArrowRight",
    args: [1],
    target: "canvas",
    options: { requireReset: false },
    name: "Move later",
    group: "Piano roll",
  },
  "piano-roll.select-all": {
    hotkey: "Mod+A",
    target: "canvas",
    name: "Select all",
    group: "Piano roll",
  },
  "piano-roll.clear-selection": {
    hotkey: "Mod+D",
    target: "canvas",
    name: "Clear selection",
    group: "Piano roll",
  },
  "piano-roll.focus-selection": {
    hotkey: "F",
    target: "canvas",
    name: "Focus selection",
    group: "Piano roll",
  },
  "piano-roll.toggle-vocal-phrase#stagepower": {
    hotkey: "R",
    args: ["stagepower"],
    name: "Stagepower phrase tool",
    group: "Vocals",
  },
  "piano-roll.toggle-vocal-phrase#vocal": {
    hotkey: "T",
    args: ["vocal"],
    name: "Vocal phrase tool",
    group: "Vocals",
  },
  "piano-roll.toggle-vocal-phrase#power-window": {
    hotkey: "Y",
    args: ["power-window"],
    name: "Power window tool",
    group: "Vocals",
  },
});
