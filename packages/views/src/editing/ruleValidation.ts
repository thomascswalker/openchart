/**
 * Adapter between the editing kernel and the pure {@link RuleEnforcer}.
 *
 * Takes raw commands that a mode has already expanded, computes the post-edit
 * overlay with `computePreview`, and hands the enforcer the affected tracks.
 * Nothing here mutates the document.
 */
import type { TrackRules } from "../ruleset/compile.js";
import type { CompiledRuleset } from "../ruleset/compile.js";
import {
  RuleEnforcer,
  type EnforcerNote,
  type RuleViolation,
  type RulesetContext,
  type TrackEdit,
} from "../ruleset/index.js";
import { checkTextEvent } from "../ruleset/textEvents.js";
import type { RawCommand } from "./commands.js";
import { parseEntityId, type EntityId } from "./entityId.js";
import type { EditingTarget } from "./mode.js";
import { computePreview } from "./preview.js";
import type { ChartDocumentReader, NoteSnapshot } from "./reader.js";

/** Virtual track index for notes added to a track that does not exist yet. */
const PENDING_TRACK = -1;

export function validateRawCommands(
  commands: readonly RawCommand[],
  reader: ChartDocumentReader,
  target: EditingTarget,
  compiled: CompiledRuleset,
  rulesContext: RulesetContext,
): RuleViolation[] {
  if (commands.length === 0) return [];
  const enforcer = new RuleEnforcer(compiled);
  const violations = enforcer.checkEdits(
    buildTrackEdits(commands, reader, target, compiled),
    rulesContext,
  );
  violations.push(...validateTextCommands(commands, reader, target, compiled));
  return violations;
}

function rulesForTrack(
  trackIndex: number,
  reader: ChartDocumentReader,
  target: EditingTarget,
  compiled: CompiledRuleset,
): TrackRules | null {
  if (trackIndex === PENDING_TRACK) {
    return compiled.byKey.get(target.trackKey) ?? null;
  }
  return reader.getTrackDescriptor(trackIndex)?.rules ?? null;
}

export function buildTrackEdits(
  commands: readonly RawCommand[],
  reader: ChartDocumentReader,
  target: EditingTarget,
  compiled: CompiledRuleset,
): TrackEdit[] {
  const preview = computePreview(commands, reader);
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
    const rules = rulesForTrack(trackIndex, reader, target, compiled);
    if (!rules) {
      edits.push({ trackIndex, rules: null, notes: [], touched });
      continue;
    }

    const existing: readonly NoteSnapshot[] =
      trackIndex === PENDING_TRACK ? [] : reader.getNotes(trackIndex);
    const overlay: NoteSnapshot[] = [];
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
  notes: readonly NoteSnapshot[],
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
  commands: readonly RawCommand[],
  reader: ChartDocumentReader,
  target: EditingTarget,
  compiled: CompiledRuleset,
): RuleViolation[] {
  const out: RuleViolation[] = [];
  for (const command of commands) {
    if (command.type === "ADD_TEXT") {
      const rules = rulesForTrack(
        target.trackIndex === null ? PENDING_TRACK : command.trackIndex,
        reader,
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
    } else if (command.type === "UPDATE_TEXT" && command.text !== undefined) {
      const parsed = parseTextId(command.id, reader);
      if (!parsed) continue;
      const rules = reader.getTrackDescriptor(parsed.trackIndex)?.rules ?? null;
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
  reader: ChartDocumentReader,
): { trackIndex: number; metaType: number; tick: number } | null {
  const parsed = parseEntityId(id);
  if (!parsed || parsed.kind !== "text" || parsed.trackIndex === null) {
    return null;
  }
  const event = reader
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
