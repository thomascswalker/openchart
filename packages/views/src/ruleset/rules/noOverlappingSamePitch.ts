import {
  compact,
  spansOverlap,
  violation,
  type ConstraintOf,
  type RuleCheck,
} from "../context";

/** Notes and markers of the same pitch may not overlap. Phrase pitches are covered by the implicit phrase rule. */
export const checkNoOverlappingSamePitch: RuleCheck<
  ConstraintOf<"noOverlappingSamePitch">
> = (ctx, c) => {
  const out = [];
  for (const n of ctx.notes) {
    if (!ctx.touched.has(n.id)) continue;
    if (n.role.kind !== "laneNote" && n.role.kind !== "marker") continue;
    for (const o of ctx.byPitch.get(n.pitch) ?? []) {
      if (o.id === n.id) continue;
      if (ctx.touched.has(o.id) && o.id < n.id) continue; // report each pair once
      if (spansOverlap(n, o)) {
        out.push(
          violation(
            c.id,
            c.severity,
            `Pitch ${n.pitch} overlaps another note of the same pitch`,
            Math.max(n.tick, o.tick),
            [n.id, o.id],
          ),
        );
      }
    }
  }
  return compact(out);
};
