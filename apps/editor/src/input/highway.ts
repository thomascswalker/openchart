import { defineBindings, type BindingSpec } from "./define.ts";

const LANES = [1, 2, 3, 4, 5] as const;

const laneBindings = Object.fromEntries(
  LANES.flatMap((lane): Array<[string, BindingSpec]> => [
    [
      `highway.toggle-lane-note#${lane}`,
      {
        hotkey: String(lane),
        args: [lane - 1, false],
        target: "canvas",
        name: `Toggle lane ${lane} note`,
        group: "Highway",
      },
    ],
    [
      `highway.toggle-lane-note#${lane}.shift`,
      {
        hotkey: `Shift+${lane}`,
        args: [lane - 1, true],
        target: "canvas",
        name: `Toggle lane ${lane} note (preserve sustain)`,
        group: "Highway",
      },
    ],
  ]),
);

/** Hotkeys active while the active viewport shows the Highway. */
export const highwayBindings = defineBindings("highway", {
  // Tools
  "highway.set-tool#select": {
    hotkey: "Q",
    args: ["select"],
    name: "Select tool",
    group: "Highway tools",
  },
  "highway.set-tool#place": {
    hotkey: "W",
    args: ["place"],
    name: "Place tool",
    group: "Highway tools",
  },
  "highway.set-tool#remove": {
    hotkey: "E",
    args: ["remove"],
    name: "Remove tool",
    group: "Highway tools",
  },
  "highway.toggle-phrase-tool#stagepower": {
    hotkey: "R",
    args: ["stagepower"],
    name: "Stagepower phrase tool",
    group: "Highway tools",
  },
  "highway.toggle-phrase-tool#solo": {
    hotkey: "T",
    args: ["solo"],
    name: "Solo phrase tool",
    group: "Highway tools",
  },

  // Notes
  ...laneBindings,

  // Navigation
  "highway.step-playhead#forward": {
    hotkey: "ArrowUp",
    args: [1],
    target: "canvas",
    options: { requireReset: false },
    name: "Move forward",
    group: "Highway",
  },
  "highway.step-playhead#backward": {
    hotkey: "ArrowDown",
    args: [-1],
    target: "canvas",
    options: { requireReset: false },
    name: "Move backward",
    group: "Highway",
  },
  "editor.step-snap-denominator#decrease": {
    hotkey: "ArrowLeft",
    args: [-1],
    target: "canvas",
    options: { requireReset: false },
    name: "Decrease snap interval",
    group: "Highway",
  },
  "editor.step-snap-denominator#increase": {
    hotkey: "ArrowRight",
    args: [1],
    target: "canvas",
    options: { requireReset: false },
    name: "Increase snap interval",
    group: "Highway",
  },
  "highway.seek-section#next-alt": {
    hotkey: "Alt+ArrowUp",
    args: [1],
    target: "canvas",
    name: "Next section",
    group: "Highway",
  },
  "highway.seek-section#previous-alt": {
    hotkey: "Alt+ArrowDown",
    args: [-1],
    target: "canvas",
    name: "Previous section",
    group: "Highway",
  },
  "highway.seek-section#next": {
    hotkey: "]",
    args: [1],
    target: "canvas",
    name: "Next section (alternate)",
    group: "Highway",
  },
  "highway.seek-section#previous": {
    hotkey: "[",
    args: [-1],
    target: "canvas",
    name: "Previous section (alternate)",
    group: "Highway",
  },
});
