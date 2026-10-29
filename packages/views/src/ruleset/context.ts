import type { Constraint, Severity } from "./config";
import type { Difficulty } from "./difficulty";
import { classifyPitch, type PitchRole } from "./classify";
import type { TrackRules } from "./compile";
import { EnforcerNote } from "./enforce";
import type { ThresholdContext } from "./thresholds";

export interface RuleViolation {
  /** Constraint id, `policy.*` for pitch policies or `implicit.*`. */
  ruleId: string;
  severity: Exclude<Severity, "ignore">;
  message: string;
  tick: number;
  entityIds: string[];
}

export type ConstraintOf<R extends Constraint["rule"]> = Extract<
  Constraint,
  { rule: R }
>;

/** A note together with its classified role. */
export interface ClassifiedNote extends EnforcerNote {
  role: PitchRole;
  /** `tick + duration`; zero-length notes end where they start. */
  end: number;
}

export interface RuleCtx {
  rules: TrackRules;
  trackName: string;
  /** Post-edit notes of the track. */
  notes: readonly ClassifiedNote[];
  touched: ReadonlySet<string>;
  /** Non-touched notes are only reported against when they conflict. */
  byPitch: ReadonlyMap<number, readonly ClassifiedNote[]>;
  thresholds: ThresholdContext;
}

export type RuleCheck<C extends Constraint> = (
  ctx: RuleCtx,
  constraint: C,
) => RuleViolation[];

export function classifyNotes(
  rules: TrackRules,
  notes: readonly EnforcerNote[],
  difficulty: Difficulty | null = null,
): ClassifiedNote[] {
  return notes.map((n) => ({
    ...n,
    role: classifyPitch(rules, n.pitch, difficulty),
    end: n.tick + Math.max(0, n.duration),
  }));
}

export function indexByPitch(
  notes: readonly ClassifiedNote[],
): Map<number, ClassifiedNote[]> {
  const map = new Map<number, ClassifiedNote[]>();
  for (const n of notes) {
    const list = map.get(n.pitch);
    if (list) list.push(n);
    else map.set(n.pitch, [n]);
  }
  for (const list of map.values()) list.sort((a, b) => a.tick - b.tick);
  return map;
}

/**
 * Two spans overlap when they share more than an endpoint. Zero-length spans
 * overlap another span only when they sit strictly inside it or coincide with
 * another zero-length span.
 */
export function spansOverlap(
  a: { tick: number; end: number },
  b: { tick: number; end: number },
): boolean {
  if (a.tick === a.end && b.tick === b.end) return a.tick === b.tick;
  if (a.tick === a.end) return a.tick > b.tick && a.tick < b.end;
  if (b.tick === b.end) return b.tick > a.tick && b.tick < a.end;
  return a.tick < b.end && b.tick < a.end;
}

export function violation(
  ruleId: string,
  severity: Severity,
  message: string,
  tick: number,
  entityIds: string[],
): RuleViolation | null {
  if (severity === "ignore") return null;
  return { ruleId, severity, message, tick, entityIds };
}

export function compact(list: (RuleViolation | null)[]): RuleViolation[] {
  return list.filter((v): v is RuleViolation => v !== null);
}
