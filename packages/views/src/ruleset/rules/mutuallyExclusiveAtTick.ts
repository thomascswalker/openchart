import {
  compact,
  violation,
  type ClassifiedNote,
  type ConstraintOf,
  type RuleCheck,
} from "../context.js";

/** Marker effects / note-source modifier ids listed as members may not share a tick. */
export const checkMutuallyExclusiveAtTick: RuleCheck<
  ConstraintOf<"mutuallyExclusiveAtTick">
> = (ctx, c) => {
  const members = new Set(c.members);
  const modifierPitch = new Map<number, string>();
  for (const m of ctx.rules.modifiers) {
    if (m.source.kind === "note" && members.has(m.id))
      modifierPitch.set(m.source.pitch, m.id);
  }
  const memberOf = (n: ClassifiedNote): string | null => {
    if (n.role.kind === "marker" && members.has(n.role.effect)) {
      return `${n.role.difficulty}:${n.role.effect}`;
    }
    const mod = modifierPitch.get(n.pitch);
    return mod ? `mod:${mod}` : null;
  };
  const groupOf = (n: ClassifiedNote) =>
    n.role.kind === "marker" ? String(n.role.difficulty) : "mod";

  const byTick = new Map<string, ClassifiedNote[]>();
  for (const n of ctx.notes) {
    if (memberOf(n) === null) continue;
    const key = `${groupOf(n)}@${n.tick}`;
    const list = byTick.get(key);
    if (list) list.push(n);
    else byTick.set(key, [n]);
  }
  const out = [];
  for (const list of byTick.values()) {
    const kinds = new Set(list.map(memberOf));
    if (kinds.size < 2) continue;
    if (!list.some((n) => ctx.touched.has(n.id))) continue;
    out.push(
      violation(
        c.id,
        c.severity,
        `Conflicting markers at the same tick: ${[...kinds].join(", ")}`,
        list[0]!.tick,
        list.map((n) => n.id),
      ),
    );
  }
  return compact(out);
};
