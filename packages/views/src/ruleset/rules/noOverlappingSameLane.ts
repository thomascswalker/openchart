import { resolveThreshold } from "../thresholds.js";
import {
  compact,
  violation,
  type ClassifiedNote,
  type ConstraintOf,
  type RuleCheck,
} from "../context.js";

/**
 * A sustain may not overlap another note on the same lane. Notes at or below
 * the sustain cutoff are not sustains and only conflict when they coincide.
 */
export const checkNoOverlappingSameLane: RuleCheck<
  ConstraintOf<"noOverlappingSameLane">
> = (ctx, c) => {
  const cutoff = ctx.rules.mechanics?.sustainCutoff
    ? resolveThreshold(ctx.rules.mechanics.sustainCutoff, ctx.thresholds)
    : null;
  const sustainEnd = (n: ClassifiedNote): number => {
    if (!cutoff) return n.tick; // no sustains on this track
    const isSustain = cutoff.inclusive
      ? n.duration > cutoff.ticks
      : n.duration >= cutoff.ticks;
    return isSustain ? n.end : n.tick;
  };

  const byLane = new Map<string, ClassifiedNote[]>();
  for (const n of ctx.notes) {
    if (n.role.kind !== "laneNote") continue;
    const key = `${n.role.difficulty}:${n.role.laneId}`;
    const list = byLane.get(key);
    if (list) list.push(n);
    else byLane.set(key, [n]);
  }

  const out = [];
  for (const list of byLane.values()) {
    list.sort((a, b) => a.tick - b.tick);
    for (let i = 0; i < list.length; i++) {
      const a = list[i]!;
      const aEnd = sustainEnd(a);
      for (let j = i + 1; j < list.length; j++) {
        const b = list[j]!;
        if (b.tick > aEnd) break;
        if (b.tick === a.tick && b.pitch !== a.pitch) {
          // same lane, different pitch (e.g. tom/cymbal) on one tick still collides
        }
        if (!ctx.touched.has(a.id) && !ctx.touched.has(b.id)) continue;
        // A sustain ending exactly where the next note starts is fine.
        if (b.tick === aEnd && b.tick !== a.tick) continue;
        out.push(
          violation(
            c.id,
            c.severity,
            "Notes on the same lane overlap",
            b.tick,
            [a.id, b.id],
          ),
        );
      }
    }
  }
  return compact(out);
};
