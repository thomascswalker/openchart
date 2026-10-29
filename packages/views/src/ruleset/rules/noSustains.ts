import { resolveThreshold } from "../thresholds";
import {
  compact,
  violation,
  type ConstraintOf,
  type RuleCheck,
} from "../context";

/** Lane notes longer than the threshold are sustains, which this track forbids. */
export const checkNoSustains: RuleCheck<ConstraintOf<"noSustains">> = (
  ctx,
  c,
) => {
  const t = resolveThreshold(c.threshold, ctx.thresholds);
  if (!t) return [];
  return compact(
    ctx.notes
      .filter((n) => ctx.touched.has(n.id) && n.role.kind === "laneNote")
      .filter((n) =>
        t.inclusive ? n.duration > t.ticks : n.duration >= t.ticks,
      )
      .map((n) =>
        violation(
          c.id,
          c.severity,
          "Sustains are not allowed on this track",
          n.tick,
          [n.id],
        ),
      ),
  );
};
