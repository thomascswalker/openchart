import { checkForbiddenPitches } from "./forbiddenPitches.js";
import { checkMonophonic } from "./monophonic.js";
import { checkMutuallyExclusiveAtTick } from "./mutuallyExclusiveAtTick.js";
import { checkNoOverlappingSameLane } from "./noOverlappingSameLane.js";
import { checkNoOverlappingSamePitch } from "./noOverlappingSamePitch.js";
import { checkNoSustains } from "./noSustains.js";
import { checkNotesWithinPhrase } from "./notesWithinPhrase.js";
import { checkPhraseMustBeBetween } from "./phraseMustBeBetween.js";
import { checkPhrasesMayNotOverlap } from "./phrasesMayNotOverlap.js";
import { checkPhraseSelfOverlap } from "./implicit.js";

const Rules = {
  forbiddenPitches: checkForbiddenPitches,
  monophonic: checkMonophonic,
  mutuallyExclusiveAtTick: checkMutuallyExclusiveAtTick,
  noOverlappingSameLane: checkNoOverlappingSameLane,
  noOverlappingSamePitch: checkNoOverlappingSamePitch,
  noSustains: checkNoSustains,
  notesWithinPhrase: checkNotesWithinPhrase,
  phraseMustBeBetween: checkPhraseMustBeBetween,
  phrasesMayNotOverlap: checkPhrasesMayNotOverlap,
  phraseSelfOverlap: checkPhraseSelfOverlap,
};

export default Rules;
