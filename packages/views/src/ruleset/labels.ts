import type { PhraseEffect } from "./config";

const PHRASE_LABELS: Record<PhraseEffect, string> = {
  starPower: "Stage Power",
  starPowerActivation: "Stage Power Activation",
  solo: "Solo",
  trill: "Trill",
  tremolo: "Tremolo",
  singleLaneRoll: "Single Lane Roll",
  doubleLaneRoll: "Double Lane Roll",
  drumFill: "Drum Fill",
  bigRockEnding: "Big Rock Ending",
  versusPlayer1: "Versus Player 1",
  versusPlayer2: "Versus Player 2",
  lyricPhrase: "Vocal Phrase",
  lyricPhraseSecondary: "Secondary Vocal Phrase",
  powerWindow: "Power Window",
  discoFlip: "Disco Flip",
};

/** The single place user-facing phrase names live. */
export function phraseLabel(effect: PhraseEffect): string {
  return PHRASE_LABELS[effect];
}

/** Icon id for a phrase tool: `starPower` → `stagepower`, `solo` → `solo`, else `phrase`. */
export function phraseIcon(effect: PhraseEffect): string {
  if (effect === "starPower") return "stagepower";
  if (effect === "solo") return "solo";
  return "phrase";
}
