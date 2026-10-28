import type { VocalNoteKind } from "@openchart/views";
import { SnapDenominators } from "../../views/pianoRoll/constants";

export const SnapOptions = SnapDenominators.map((denominator) => ({
  value: String(denominator),
  label: `1/${denominator}`,
}));

export const VocalNoteOptions: { value: VocalNoteKind; label: string }[] = [
  { value: "pitched", label: "Pitched" },
  { value: "percussion", label: "Percussion" },
  { value: "pitchless", label: "Pitchless" },
];
