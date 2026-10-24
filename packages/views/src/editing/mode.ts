/** Stable identifier for a registered editing mode. */
export type EditingModeId =
  | "midi.raw"
  | "midi.global"
  | "chart.frets"
  | "chart.drums"
  | "vocals"
  | (string & {});
