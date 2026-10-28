import type { CompiledRuleset, TrackRules } from "./compile.js";
import { isUnmappedTrackRules } from "./compile.js";
import type { RuleViolation } from "./context.js";

/**
 * Check a text event against the ruleset's text-event grammar and the track's
 * declared text events. Only meta types listed in
 * `textEventGrammar.metaEventTypes` are checked; other meta types (lyrics,
 * markers, track names) are not text events in the ruleset's sense. Unmapped
 * tracks are never checked.
 *
 * Argument types are not validated here: the check resolves which declared
 * text event the text is an instance of (by identifier or by pattern).
 */
export function checkTextEvent(
  compiled: CompiledRuleset,
  rules: TrackRules,
  metaType: number,
  text: string,
  tick: number,
): RuleViolation | null {
  const { textEventGrammar: grammar, policies } = compiled.ruleset;
  if (isUnmappedTrackRules(rules)) return null;
  if (!grammar.metaEventTypes.includes(metaType)) return null;

  const severity = policies.unknownTextEvent;
  if (severity === "ignore") return null;
  const fail = (message: string): RuleViolation => ({
    ruleId: "policy.unknownTextEvent",
    severity,
    message,
    tick,
    entityIds: [],
  });

  const trimmed = text.trim();
  const bracketed = /^\[([\s\S]*)\]$/.exec(trimmed);
  let inner = bracketed ? bracketed[1]! : trimmed;
  if (!bracketed && grammar.brackets === "required") {
    return fail(`Text event "${text}" must be written in [brackets]`);
  }
  inner = inner.trim();

  const caseSensitive = grammar.caseSensitive ?? true;
  const norm = (value: string) => (caseSensitive ? value : value.toLowerCase());
  const head = inner.split(/\s+/, 1)[0] ?? "";

  for (const event of rules.textEvents) {
    if ("identifier" in event) {
      if (norm(head) === norm(event.identifier)) return null;
    } else {
      try {
        if (new RegExp(event.pattern, caseSensitive ? "" : "i").test(inner)) {
          return null;
        }
      } catch {
        // Invalid regexes are rejected at load time; ignore here.
      }
    }
  }
  return fail(`Text event "${text}" is not defined on ${rules.name}`);
}
