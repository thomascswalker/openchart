import {
  compact,
  violation,
  type ConstraintOf,
  type RuleCheck,
} from "../context";
import { phraseId, phraseSpans, spansOverlap } from "../phrases";

/** Spans of the listed phrases (of different ids) may not overlap. Same-id overlap is the implicit rule. */
export const checkPhrasesMayNotOverlap: RuleCheck<
  ConstraintOf<"phrasesMayNotOverlap">
> = (ctx, c) => {
  const spans = phraseSpans(ctx, new Set(c.phrases));
  const out = [];
  for (let i = 0; i < spans.length; i++) {
    for (let j = i + 1; j < spans.length; j++) {
      const a = spans[i]!;
      const b = spans[j]!;
      if (phraseId(a) === phraseId(b)) continue;
      if (!ctx.touched.has(a.id) && !ctx.touched.has(b.id)) continue;
      if (spansOverlap(a, b)) {
        out.push(
          violation(
            c.id,
            c.severity,
            `${phraseId(a)} and ${phraseId(b)} may not overlap`,
            Math.max(a.tick, b.tick),
            [a.id, b.id],
          ),
        );
      }
    }
  }
  return compact(out);
};
