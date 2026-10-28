import type { ClassifiedNote, RuleCtx } from "./context.js";
import { spansOverlap } from "./context.js";

export function phraseSpans(
  ctx: RuleCtx,
  ids?: ReadonlySet<string>,
): ClassifiedNote[] {
  return ctx.notes.filter(
    (n) => n.role.kind === "phrase" && (!ids || ids.has(n.role.id)),
  );
}
export const phraseId = (n: ClassifiedNote): string =>
  n.role.kind === "phrase" ? n.role.id : "";
export { spansOverlap };
