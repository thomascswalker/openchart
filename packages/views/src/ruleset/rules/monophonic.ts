import {
  compact,
  spansOverlap,
  violation,
  type ConstraintOf,
  type RuleCheck,
} from "../context";

/** Notes of the listed classes may not overlap one another. */
export const checkMonophonic: RuleCheck<ConstraintOf<"monophonic">> = (
  ctx,
  c,
) => {
  const classes = new Set(c.noteClasses);
  const notes = ctx.notes
    .filter((n) => n.role.kind === "noteClass" && classes.has(n.role.id))
    .sort((a, b) => a.tick - b.tick);
  const out = [];
  for (let i = 0; i < notes.length; i++) {
    const a = notes[i]!;
    for (let j = i + 1; j < notes.length; j++) {
      const b = notes[j]!;
      if (b.tick >= a.end && b.tick > a.tick) break;
      if (!ctx.touched.has(a.id) && !ctx.touched.has(b.id)) continue;
      if (a.tick === b.tick || spansOverlap(a, b)) {
        out.push(
          violation(
            c.id,
            c.severity,
            "Notes may not overlap on a monophonic track",
            b.tick,
            [a.id, b.id],
          ),
        );
      }
    }
  }
  return compact(out);
};
