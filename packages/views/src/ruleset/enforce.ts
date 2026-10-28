/**
 * RuleEnforcer: the single choke point for edit validation.
 *
 * The enforcer is pure and independent of the editing kernel: it receives the
 * post-edit notes of each affected track plus the ids of notes the edit
 * touched, and returns violations. The editing session builds that input from
 * its preview overlay (command → mode expansion → preview → `checkEdits`).
 * Tracks without rules (unmapped tracks) get no ruleset validation.
 */
import type { Constraint, Severity } from "../config.js";
import {
  isUnmappedTrackRules,
  type CompiledRuleset,
  type TrackRules,
} from "./compile.js";
import { evaluateCondition, type ConditionContext } from "./conditions.js";
import type { ThresholdContext } from "./thresholds.js";
import Rules from "./rules/index.js";
import {
  classifyNotes,
  indexByPitch,
  violation,
  type RuleCtx,
  type RuleViolation,
} from "./context.js";
export { IMPLICIT_PHRASE_SELF_OVERLAP } from "./rules/implicit.js";

/** Minimal note shape the enforcer needs; independent of the editing kernel. */
export interface EnforcerNote {
  id: string;
  tick: number;
  pitch: number;
  duration: number;
  velocity: number;
}

/** Runtime context shared by conditions and thresholds. */
export interface RulesetContext extends ConditionContext {
  ppqn: number;
  secondsToTicks?: (seconds: number) => number;
}

export function createRulesetContext(
  options: Partial<RulesetContext> & { ppqn: number },
): RulesetContext {
  return {
    playerOptions: options.playerOptions ?? new Set(),
    variant: options.variant ?? null,
    textEventsAt: options.textEventsAt ?? (() => new Set()),
    settings: options.settings ?? (() => undefined),
    ppqn: options.ppqn,
    ...(options.phrasesPresent
      ? { phrasesPresent: options.phrasesPresent }
      : {}),
    ...(options.secondsToTicks
      ? { secondsToTicks: options.secondsToTicks }
      : {}),
  };
}

/** Threshold-resolution context derived from a runtime rules context. */
export function thresholdContext(
  compiled: CompiledRuleset,
  ctx: RulesetContext,
): ThresholdContext {
  return {
    ppqn: ctx.ppqn,
    settings: ctx.settings,
    settingUnit: (s, k) => compiled.settingUnits.get(`${s}.${k}`) ?? "none",
    ...(ctx.secondsToTicks ? { secondsToTicks: ctx.secondsToTicks } : {}),
  };
}

/** One affected track in an edit. */
export interface TrackEdit {
  trackIndex: number;
  rules: TrackRules | null;
  /** Post-edit notes of the track. */
  notes: readonly EnforcerNote[];
  /** Ids of notes added, moved or resized by the edit. */
  touched: ReadonlySet<string>;
}

function runConstraint(ctx: RuleCtx, c: Constraint): RuleViolation[] {
  switch (c.rule) {
    case "noOverlappingSamePitch":
      return Rules.noOverlappingSamePitch(ctx, c);
    case "noOverlappingSameLane":
      return Rules.noOverlappingSameLane(ctx, c);
    case "mutuallyExclusiveAtTick":
      return Rules.mutuallyExclusiveAtTick(ctx, c);
    case "phrasesMayNotOverlap":
      return Rules.phrasesMayNotOverlap(ctx, c);
    case "phraseMustBeBetween":
      return Rules.phraseMustBeBetween(ctx, c);
    case "notesWithinPhrase":
      return Rules.notesWithinPhrase(ctx, c);
    case "monophonic":
      return Rules.monophonic(ctx, c);
    case "forbiddenPitches":
      return Rules.forbiddenPitches(ctx, c);
    case "noSustains":
      return Rules.noSustains(ctx, c);
  }
}

export class RuleEnforcer {
  constructor(private readonly compiled: CompiledRuleset) {}

  /** Violations for a set of affected tracks. Empty for unmapped tracks. */
  checkEdits(
    edits: readonly TrackEdit[],
    ctx: RulesetContext,
  ): RuleViolation[] {
    const out: RuleViolation[] = [];
    for (const edit of edits) out.push(...this.checkTrack(edit, ctx));
    return out;
  }

  /** Whole-track validation: treat every note as touched. */
  validateTrack(
    rules: TrackRules,
    notes: readonly EnforcerNote[],
    ctx: RulesetContext,
  ): RuleViolation[] {
    return this.checkTrack(
      {
        trackIndex: -1,
        rules,
        notes,
        touched: new Set(notes.map((n) => n.id)),
      },
      ctx,
    );
  }

  private checkTrack(edit: TrackEdit, ctx: RulesetContext): RuleViolation[] {
    const { rules } = edit;
    if (!rules || isUnmappedTrackRules(rules)) return [];

    const notes = classifyNotes(rules, edit.notes);
    const rctx: RuleCtx = {
      rules,
      trackName: rules.name,
      notes,
      touched: edit.touched,
      byPitch: indexByPitch(notes),
      thresholds: thresholdContext(this.compiled, ctx),
    };
    const { policies, midi } = this.compiled.ruleset;
    const condCtx: ConditionContext = { ...ctx, selfTrack: rules.name };
    const out: RuleViolation[] = [];
    const push = (v: RuleViolation | null) => v && out.push(v);

    // ---- Pitch policies --------------------------------------------------
    for (const n of notes) {
      if (!edit.touched.has(n.id)) continue;
      const at = (sev: Severity | undefined, id: string, msg: string) =>
        push(violation(id, sev ?? "error", msg, n.tick, [n.id]));
      const role = n.role;

      if (role.kind === "unknown") {
        at(
          rules.unknownPitchPolicy ?? policies.unknownPitch,
          "policy.unknownPitch",
          `Pitch ${n.pitch} is not defined on ${rules.name}`,
        );
      } else if (role.kind === "reserved") {
        at(
          policies.reservedPitch ?? "error",
          "policy.reservedPitch",
          `Pitch ${n.pitch} is reserved on ${rules.name}`,
        );
      } else if (role.kind === "laneNote") {
        const chart = rules.difficulties.get(role.difficulty);
        const rule = chart?.notes.get(n.pitch);
        if (rule && !rule.laneAvailable) {
          at(
            rule.laneWhenDisabled ?? "error",
            "policy.laneDisabled",
            `Lane "${role.laneId}" does not exist on ${rules.name}`,
          );
        } else if (
          rule?.enabledWhen &&
          !evaluateCondition(rule.enabledWhen, condCtx)
        ) {
          at(
            rule.whenDisabled ?? "error",
            "policy.noteDisabled",
            `Pitch ${n.pitch} is not enabled`,
          );
        }
      }

      if (n.duration === 0 && !midi.noteDefaults.allowZeroLength) {
        at(
          midi.noteDefaults.zeroLengthSeverity ?? "error",
          "policy.zeroLength",
          "Zero-length notes are not allowed",
        );
      }
    }

    // ---- Constraints -----------------------------------------------------
    for (const c of rules.constraints) {
      if (c.severity === "ignore") continue;
      out.push(...runConstraint(rctx, c));
    }
    out.push(...Rules.phraseSelfOverlap(rctx, undefined as never));
    return out;
  }
}

export const hasErrors = (violations: readonly RuleViolation[]): boolean =>
  violations.some((v) => v.severity === "error");
