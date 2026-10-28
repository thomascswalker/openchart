import { expandPitchSet } from "../semantics.js";
import {
  compact,
  violation,
  type ConstraintOf,
  type RuleCheck,
} from "../context.js";

export const checkForbiddenPitches: RuleCheck<
  ConstraintOf<"forbiddenPitches">
> = (ctx, c) => {
  const forbidden = new Set(expandPitchSet(c.pitches));
  return compact(
    ctx.notes
      .filter((n) => ctx.touched.has(n.id) && forbidden.has(n.pitch))
      .map((n) =>
        violation(
          c.id,
          c.severity,
          `Pitch ${n.pitch} is not allowed on this track`,
          n.tick,
          [n.id],
        ),
      ),
  );
};
