import {
  compact,
  violation,
  type ConstraintOf,
  type RuleCheck,
} from "../context";
import { phraseSpans } from "../phrases";

/** A note of the listed classes must start inside one of the listed phrases. */
export const checkNotesWithinPhrase: RuleCheck<
  ConstraintOf<"notesWithinPhrase">
> = (ctx, c) => {
  const classes = new Set(c.noteClasses);
  const spans = phraseSpans(ctx, new Set(c.phrases));
  const phraseTouched = spans.some((s) => ctx.touched.has(s.id));
  const out = [];
  for (const n of ctx.notes) {
    if (n.role.kind !== "noteClass" || !classes.has(n.role.id)) continue;
    if (!ctx.touched.has(n.id) && !phraseTouched) continue;
    const inside = spans.some((s) => n.tick >= s.tick && n.tick <= s.end);
    if (!inside) {
      out.push(
        violation(
          c.id,
          c.severity,
          `Note must be inside a ${c.phrases.join(" / ")} phrase`,
          n.tick,
          [n.id],
        ),
      );
    }
  }
  return compact(out);
};
