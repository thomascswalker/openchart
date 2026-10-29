import { compact, spansOverlap, violation, type RuleCheck } from "../context";
import { phraseId, phraseSpans } from "../phrases";

export const IMPLICIT_PHRASE_SELF_OVERLAP = "implicit.phraseSelfOverlap";

/**
 * Spans of the same phrase id may not overlap. The ruleset never states this,
 * but fret and vocal editing have always enforced it.
 */
export const checkPhraseSelfOverlap: RuleCheck<never> = (ctx) => {
  const byId = new Map<string, ReturnType<typeof phraseSpans>>();
  for (const s of phraseSpans(ctx)) {
    const key = `${phraseId(s)}|${s.role.kind === "phrase" ? (s.role.difficulty ?? "") : ""}`;
    const list = byId.get(key);
    if (list) list.push(s);
    else byId.set(key, [s]);
  }
  const out = [];
  for (const list of byId.values()) {
    list.sort((a, b) => a.tick - b.tick);
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i]!;
        const b = list[j]!;
        if (b.tick >= a.end && b.tick > a.tick) break;
        if (!ctx.touched.has(a.id) && !ctx.touched.has(b.id)) continue;
        if (a.tick === b.tick || spansOverlap(a, b)) {
          out.push(
            violation(
              IMPLICIT_PHRASE_SELF_OVERLAP,
              "error",
              `Phrase "${phraseId(a)}" overlaps itself`,
              b.tick,
              [a.id, b.id],
            ),
          );
        }
      }
    }
  }
  return compact(out);
};
