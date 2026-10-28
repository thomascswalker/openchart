import type { Condition } from "../config.js";
import type { SettingValue } from "./thresholds.js";

export interface ConditionContext {
  /** Player options currently enabled. Empty by default. */
  playerOptions: ReadonlySet<string>;
  settings: (source: string, key: string) => SettingValue | undefined;
  /** Active drum variant, if any. */
  variant: string | null;
  /** Text-event ids present on the named track (`"self"` resolved by caller). */
  textEventsAt: (trackName: string) => ReadonlySet<string>;
  /** Phrase ids present on the track being evaluated. Empty = none present. */
  phrasesPresent?: ReadonlySet<string>;
  /** Track name used to resolve `track: "self"` / omitted. */
  selfTrack?: string;
}

export function emptyConditionContext(): ConditionContext {
  return {
    playerOptions: new Set(),
    settings: () => undefined,
    variant: null,
    textEventsAt: () => new Set(),
  };
}

/**
 * Evaluate a ruleset condition. `before`/`after` relations on text events are
 * treated as `present`: positional evaluation needs a tick the context does
 * not carry yet.
 */
export function evaluateCondition(
  c: Condition,
  ctx: ConditionContext,
): boolean {
  if ("allOf" in c) return c.allOf.every((s) => evaluateCondition(s, ctx));
  if ("anyOf" in c) return c.anyOf.some((s) => evaluateCondition(s, ctx));
  if ("not" in c) return !evaluateCondition(c.not, ctx);
  if ("playerOption" in c) return ctx.playerOptions.has(c.playerOption);
  if ("variant" in c) return ctx.variant === c.variant;
  if ("phraseAbsent" in c)
    return !(ctx.phrasesPresent?.has(c.phraseAbsent) ?? false);
  if ("setting" in c) {
    const value = ctx.settings(c.setting.source, c.setting.key);
    if (
      c.setting.present !== undefined &&
      (value !== undefined) !== c.setting.present
    ) {
      return false;
    }
    if (c.setting.equals !== undefined) return value === c.setting.equals;
    return c.setting.present !== undefined ? true : value !== undefined;
  }
  // textEvent
  const track =
    !c.track || c.track === "self" ? (ctx.selfTrack ?? "self") : c.track;
  return ctx.textEventsAt(track).has(c.textEvent);
}
