import type { Threshold } from "../config.js";

export type SettingValue = boolean | number | string;

export interface ThresholdContext {
  ppqn: number;
  /** Project settings: `settings(source, key)` → value, if the project sets it. */
  settings?: (source: string, key: string) => SettingValue | undefined;
  /** Unit of a setting (`ticks` | `seconds` | `none`). Defaults to `ticks`. */
  settingUnit?: (source: string, key: string) => "ticks" | "seconds" | "none";
  /** Converts a duration in seconds to ticks at the point being evaluated. */
  secondsToTicks?: (seconds: number) => number;
}

export interface ResolvedThreshold {
  ticks: number;
  inclusive: boolean;
}

function roundWith(mode: "floor" | "round" | "ceil", v: number): number {
  return mode === "floor"
    ? Math.floor(v)
    : mode === "ceil"
      ? Math.ceil(v)
      : Math.round(v);
}

function baseTicks(t: Threshold, ctx: ThresholdContext): number | null {
  const v = t.value;
  switch (v.unit) {
    case "step":
      return (ctx.ppqn * 4) / v.denominator;
    case "ticks":
      return v.ticks;
    case "resolutionFormula":
      return roundWith(v.rounding, ctx.ppqn / v.divisor) + v.addTicks;
    case "seconds":
      return ctx.secondsToTicks ? ctx.secondsToTicks(v.seconds) : null;
  }
}

/**
 * Resolve a threshold to ticks. Overrides are consulted first, in priority
 * order; `maxTicks` is applied last. Returns `null` for a `seconds` threshold
 * when no `secondsToTicks` converter is supplied.
 */
export function resolveThreshold(
  t: Threshold,
  ctx: ThresholdContext,
): ResolvedThreshold | null {
  const inclusive = t.inclusive ?? false;
  let ticks: number | null = null;

  for (const o of t.overrides ?? []) {
    const raw = ctx.settings?.(o.source, o.key);
    if (typeof raw !== "number") continue;
    const unit = ctx.settingUnit?.(o.source, o.key) ?? "ticks";
    if (unit === "seconds") {
      if (!ctx.secondsToTicks) continue;
      ticks = ctx.secondsToTicks(raw);
    } else {
      ticks = raw;
    }
    break;
  }
  if (ticks === null) ticks = baseTicks(t, ctx);
  if (ticks === null) return null;
  if (t.maxTicks !== undefined) ticks = Math.min(ticks, t.maxTicks);
  return { ticks, inclusive };
}

/** Threshold in ticks, or `null` when it cannot be resolved. */
export function resolveThresholdTicks(
  t: Threshold,
  ctx: ThresholdContext,
): number | null {
  return resolveThreshold(t, ctx)?.ticks ?? null;
}

/**
 * `length` is within the threshold: `<=` when inclusive, `<` otherwise.
 * Returns `false` if the threshold cannot be resolved.
 */
export function isWithinThreshold(
  length: number,
  t: Threshold,
  ctx: ThresholdContext,
): boolean {
  const r = resolveThreshold(t, ctx);
  if (!r) return false;
  return r.inclusive ? length <= r.ticks : length < r.ticks;
}
