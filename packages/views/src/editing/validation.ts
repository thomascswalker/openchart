/**
 * Adapter between the editing kernel and the pure {@link RuleEnforcer}.
 *
 * Takes raw commands that a mode has already expanded, computes the post-edit
 * overlay with `computePreview`, and hands the enforcer the affected tracks.
 * Nothing here mutates the document.
 */
import type { TrackRules } from "../ruleset/compile";
import type { CompiledRuleset } from "../ruleset/compile";
import {
  RuleEnforcer,
  type EnforcerNote,
  type RuleViolation,
  type RulesetContext,
  type TrackEdit,
} from "../ruleset/index";
import { checkTextEvent } from "../ruleset/textEvents";
import type { GeneralCommand } from "./commands";
import { EditCommandType } from "./commands";
import { NoteHandle, parseEntityFromId, type EntityId } from "./entity";
import { CommandExecutor } from "./executor";
import type { EditingTarget } from "./modes/mode";
import { computePreview } from "./preview";

/** Virtual track index for notes added to a track that does not exist yet. */
const PENDING_TRACK = -1;

export function validateRawCommands(
  commands: readonly GeneralCommand[],
  executor: CommandExecutor,
  target: EditingTarget,
  compiled: CompiledRuleset,
  rulesContext: RulesetContext,
): RuleViolation[] {
  if (commands.length === 0) return [];
  const enforcer = new RuleEnforcer(compiled);
  const violations = enforcer.checkEdits(
    buildTrackEdits(commands, executor, target, compiled),
    rulesContext,
  );
  violations.push(
    ...validateTextCommands(commands, executor, target, compiled),
  );
  return violations;
}

function rulesForTrack(
  trackIndex: number,
  executor: CommandExecutor,
  target: EditingTarget,
  compiled: CompiledRuleset,
): TrackRules | null {
  if (trackIndex === PENDING_TRACK) {
    return compiled.byKey.get(target.trackKey) ?? null;
  }
  return executor.getTrackDescriptor(trackIndex)?.rules ?? null;
}

export function buildTrackEdits(
  commands: readonly GeneralCommand[],
  executor: CommandExecutor,
  target: EditingTarget,
  compiled: CompiledRuleset,
): TrackEdit[] {
  const preview = computePreview(commands, executor);
  const pendingTarget = target.trackIndex === null;

  const added = preview.added.map((note) =>
    pendingTarget ? { ...note, trackIndex: PENDING_TRACK } : note,
  );

  const touchedByTrack = new Map<number, Set<string>>();
  const touch = (trackIndex: number, id: string) => {
    const set = touchedByTrack.get(trackIndex) ?? new Set<string>();
    set.add(id);
    touchedByTrack.set(trackIndex, set);
  };
  for (const note of added) touch(note.trackIndex, note.id);
  for (const note of preview.updated.values()) touch(note.trackIndex, note.id);

  const edits: TrackEdit[] = [];
  for (const [trackIndex, touched] of touchedByTrack) {
    const rules = rulesForTrack(trackIndex, executor, target, compiled);
    if (!rules) {
      edits.push({ trackIndex, rules: null, notes: [], touched });
      continue;
    }

    const existing: readonly NoteHandle[] =
      trackIndex === PENDING_TRACK ? [] : executor.getNotes(trackIndex);
    const overlay: NoteHandle[] = [];
    for (const note of existing) {
      if (preview.removed.has(note.id as EntityId)) continue;
      overlay.push(preview.updated.get(note.id as EntityId) ?? note);
    }
    for (const note of added) {
      if (note.trackIndex === trackIndex) overlay.push(note);
    }

    edits.push({
      trackIndex,
      rules,
      notes: windowNotes(overlay, touched, rules),
      touched,
    });
  }
  return edits;
}

/**
 * Notes relevant to the touched ones: everything overlapping the touched tick
 * span plus all phrase-pitch notes (phrase rules need distant neighbours).
 */
function windowNotes(
  notes: readonly NoteHandle[],
  touched: ReadonlySet<string>,
  rules: TrackRules,
): EnforcerNote[] {
  let start = Infinity;
  let end = -Infinity;
  for (const note of notes) {
    if (!touched.has(note.id)) continue;
    start = Math.min(start, note.tick);
    end = Math.max(end, note.tick + note.duration);
  }
  if (start === Infinity) return [];

  const phrasePitches = new Set(rules.phrases.flatMap((p) => p.pitches));
  return notes.filter(
    (note) =>
      touched.has(note.id) ||
      phrasePitches.has(note.pitch) ||
      (note.tick <= end && note.tick + note.duration >= start),
  );
}

/** Grammar check for ADD_TEXT / UPDATE_TEXT on configured tracks. */
function validateTextCommands(
  commands: readonly GeneralCommand[],
  executor: CommandExecutor,
  target: EditingTarget,
  compiled: CompiledRuleset,
): RuleViolation[] {
  const out: RuleViolation[] = [];
  for (const command of commands) {
    if (command.type === EditCommandType.AddText) {
      const rules = rulesForTrack(
        target.trackIndex === null ? PENDING_TRACK : command.trackIndex,
        executor,
        target,
        compiled,
      );
      const v = rules
        ? checkTextEvent(
            compiled,
            rules,
            command.metaType,
            command.text,
            command.tick,
          )
        : null;
      if (v) out.push(v);
    } else if (
      command.type === EditCommandType.UpdateText &&
      command.text !== undefined
    ) {
      const parsed = parseTextId(command.id, executor);
      if (!parsed) continue;
      const rules =
        executor.getTrackDescriptor(parsed.trackIndex)?.rules ?? null;
      const v = rules
        ? checkTextEvent(
            compiled,
            rules,
            parsed.metaType,
            command.text,
            command.tick ?? parsed.tick,
          )
        : null;
      if (v) out.push(v);
    }
  }
  return out;
}

function parseTextId(
  id: EntityId,
  executor: CommandExecutor,
): { trackIndex: number; metaType: number; tick: number } | null {
  const parsed = parseEntityFromId(id);
  if (!parsed || parsed.type !== "text" || parsed.trackIndex === undefined) {
    return null;
  }
  const event = executor
    .getTextEvents(parsed.trackIndex)
    .find((candidate) => candidate.id === id);
  return event
    ? {
        trackIndex: parsed.trackIndex,
        metaType: event.metaType,
        tick: event.tick,
      }
    : null;
}
