import type { VocalNoteKind } from "@openchart/views";
import { SnapDenominators } from "../../views/pianoRoll/constants";

export const SnapOptions = SnapDenominators.map((denominator) => ({
  value: String(denominator),
  label: `1/${denominator}`,
}));

export const DrumNoteOptions = [
  { value: "pad", label: "Pad" },
  { value: "cymbal", label: "Cymbal" },
  { value: "kick", label: "Kick" },
];

export const VocalNoteOptions: { value: VocalNoteKind; label: string }[] = [
  { value: "pitched", label: "Pitched" },
  { value: "percussion", label: "Percussion" },
  { value: "pitchless", label: "Pitchless" },
];

export const GuitarNoteOptions = [
  { value: "normal", label: "Normal" },
  { value: "force-hopo", label: "Force HOPO" },
  { value: "force-strum", label: "Force Strum" },
  { value: "tap", label: "Tap" },
];
