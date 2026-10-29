import { checkForbiddenPitches } from "./forbiddenPitches";
import { checkMonophonic } from "./monophonic";
import { checkMutuallyExclusiveAtTick } from "./mutuallyExclusiveAtTick";
import { checkNoOverlappingSameLane } from "./noOverlappingSameLane";
import { checkNoOverlappingSamePitch } from "./noOverlappingSamePitch";
import { checkNoSustains } from "./noSustains";
import { checkNotesWithinPhrase } from "./notesWithinPhrase";
import { checkPhraseMustBeBetween } from "./phraseMustBeBetween";
import { checkPhrasesMayNotOverlap } from "./phrasesMayNotOverlap";
import { checkPhraseSelfOverlap } from "./implicit";

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
