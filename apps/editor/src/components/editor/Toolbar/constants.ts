import { VocalNoteKind } from "@openchart/views";
import { SnapDenominators } from "../../views/pianoRoll/constants";

export const SnapOptions = SnapDenominators.map((denominator) => ({
  value: String(denominator),
  label: `1/${denominator}`,
}));

export const VocalNoteOptions: { value: VocalNoteKind; label: string }[] = [
  { value: VocalNoteKind.Pitched, label: "Pitched" },
  { value: VocalNoteKind.Percussion, label: "Percussion" },
  { value: VocalNoteKind.Pitchless, label: "Pitchless" },
];
