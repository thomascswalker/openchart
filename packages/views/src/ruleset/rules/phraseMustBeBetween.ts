import {
  compact,
  violation,
  type ConstraintOf,
  type RuleCheck,
} from "../context";
import { phraseSpans } from "../phrases";

/** A phrase must sit after one instance of `between` and before the next. */
export const checkPhraseMustBeBetween: RuleCheck<
  ConstraintOf<"phraseMustBeBetween">
> = (ctx, c) => {
  const subjects = phraseSpans(ctx, new Set([c.phrase])).sort(
    (a, b) => a.tick - b.tick,
  );
  const bounds = phraseSpans(ctx, new Set([c.between])).sort(
    (a, b) => a.tick - b.tick,
  );
  const touchedBounds = bounds.filter((b) => ctx.touched.has(b.id));

  const out = [];
  for (const s of subjects) {
    const prev = [...bounds].reverse().find((b) => b.end <= s.tick);
    const next = bounds.find((b) => b.tick >= s.end && b.tick > s.tick);
    // Re-check a subject when it moved, or when a neighbouring bound moved.
    const adjacent = touchedBounds.some(
      (b) =>
        b === prev ||
        b === next ||
        (b.tick >= (prev?.tick ?? -Infinity) &&
          b.end <= (next?.end ?? Infinity)),
    );
    if (!ctx.touched.has(s.id) && !adjacent) continue;
    if (!prev || !next) {
      out.push(
        violation(
          c.id,
          c.severity,
          `${c.phrase} must sit between two ${c.between} phrases`,
          s.tick,
          [s.id],
        ),
      );
    }
  }
  return compact(out);
};
