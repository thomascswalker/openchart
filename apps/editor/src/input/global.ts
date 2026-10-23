import { defineBindings } from "./define.ts";

/** Hotkeys that work everywhere, unless a view scope overrides them. */
export const globalBindings = defineBindings("global", {
  // Playback
  "playback.toggle": { hotkey: "Space", name: "Play/pause", group: "Playback" },
  "playback.toggle-metronome": {
    hotkey: "M",
    name: "Toggle metronome",
    group: "Playback",
  },
  "playback.toggle-clap": {
    hotkey: "N",
    name: "Toggle highway clap",
    group: "Playback",
  },
  "playback.toggle-vocal-pitch-feedback": {
    hotkey: "P",
    name: "Toggle vocal pitch feedback",
    group: "Playback",
  },

  // Document
  "document.new": { hotkey: "Mod+N", name: "New project", group: "File" },
  "document.open": { hotkey: "Mod+O", name: "Open project", group: "File" },
  "document.save": { hotkey: "Mod+S", name: "Save", group: "File" },
  "document.save-as": {
    hotkey: "Mod+Shift+S",
    name: "Save as",
    group: "File",
  },
  "dialog.open-settings": {
    hotkey: "Mod+,",
    name: "Open settings",
    group: "File",
  },
  "dialog.close-topmost": {
    hotkey: "Escape",
    name: "Close dialog",
    group: "File",
  },

  // Edit
  "history.undo": { hotkey: "Mod+Z", name: "Undo", group: "Edit" },
  "history.redo#primary": { hotkey: "Mod+Y", name: "Redo", group: "Edit" },
  "history.redo#alias": {
    hotkey: "Mod+Shift+Z",
    name: "Redo (alternate)",
    group: "Edit",
  },
  "clipboard.cut": { hotkey: "Mod+X", name: "Cut", group: "Edit" },
  "clipboard.copy": { hotkey: "Mod+C", name: "Copy", group: "Edit" },
  "clipboard.paste": { hotkey: "Mod+V", name: "Paste", group: "Edit" },
  "editor.delete-selection#delete": {
    hotkey: "Delete",
    target: "canvas",
    name: "Delete selection",
    group: "Edit",
  },
  "editor.delete-selection#backspace": {
    hotkey: "Backspace",
    target: "canvas",
    name: "Delete selection (alternate)",
    group: "Edit",
  },
});
