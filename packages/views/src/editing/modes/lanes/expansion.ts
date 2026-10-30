import type { AbstractEditingMode } from "../mode";
import {
  type EditCommand,
  type GeneralCommand,
  DomainCommandType,
  GeneralCommandType,
} from "../../commands";
import type { EntityId } from "../../entity";
import { getSustainCutTargets } from "../../sustains";
import { validTick, validSpan } from "../common";
import type {
  ModeContext,
  ExpansionResult,
  Projection,
  ExpanderFn,
} from "../mode";
import {
  ChartContext,
  sustainRule,
  roleOf,
  isSustain,
  PlaceSchema,
  parsePlacement,
  pitchForColumn,
  MoveSchema,
  SustainEndSchema,
  CutSchema,
  CreatePhraseSchema,
  phrasesFor,
  UpdatePhraseSchema,
  PasteSchema,
} from "./chartLanes";

function sustainCandidates(context: ModeContext, cc: ChartContext) {
  const sustain = sustainRule(context, cc.rules);
  return context.target
    .noteHandles()
    .filter((note) => {
      const role = roleOf(note, cc);
      return role.kind === "laneNote" && isSustain(note.duration, sustain);
    })
    .map((note) => ({
      ...note,
      start: note.tick,
      end: note.tick + note.duration,
      noteOn: note.id,
    }));
}

export function expandPlace(
  mode: AbstractEditingMode,
  command: EditCommand,
  context: ModeContext,
  cc: ChartContext,
): ExpansionResult {
  const parsed = PlaceSchema.safeParse(command);
  if (
    !parsed.success ||
    !validTick(parsed.data.tick) ||
    (parsed.data.endTick !== undefined &&
      (!validTick(parsed.data.endTick) ||
        parsed.data.endTick <= parsed.data.tick))
  ) {
    return mode.rejected(
      command,
      "invalid-command",
      "Chart note placement is invalid",
    );
  }
  const placement = parsePlacement(parsed.data.placement);
  if (!placement) {
    return mode.rejected(
      command,
      "invalid-placement",
      `Unknown placement '${parsed.data.placement}'`,
    );
  }
  if (
    placement.kind === "marker" &&
    cc.chart.pitchForMarker(placement.effect) === undefined
  ) {
    return mode.rejected(
      command,
      "missing-config-note",
      `No ${placement.effect} marker is configured for this difficulty`,
    );
  }
  const columns = cc.rules.columns;
  const row = columns[parsed.data.lane];
  if (placement.kind !== "bar" && !row) {
    return mode.rejected(
      command,
      "invalid-lane",
      "Chart note lane is outside the configured chart",
    );
  }
  const pitch =
    placement.kind === "bar"
      ? (cc.chart.pitchForLane(placement.laneId) ?? null)
      : pitchForColumn(
          cc,
          row!,
          placement.kind === "padType" ? placement.padType : undefined,
        );
  if (pitch === null) {
    return mode.rejected(
      command,
      "invalid-lane",
      "This placement has no configured pitch on the selected lane",
    );
  }

  const trackIndex = context.target.trackIndex ?? 0;
  const notes = context.target.noteHandles();
  const preferredId = parsed.data.preferredSustainId;
  if (preferredId) {
    const preferred = context.target.ownsNoteEntities([preferredId], command);
    if (preferred.rejection)
      return { commands: [], rejections: [preferred.rejection] };
  }

  const commands: GeneralCommand[] = [];
  const cutNotes = getSustainCutTargets(
    sustainCandidates(context, cc),
    parsed.data.tick,
    {
      cutPolicy: parsed.data.cutPolicy,
      preferredNoteOn: (preferredId as EntityId | undefined) ?? null,
    },
  );
  if (cutNotes.length > 0) {
    commands.push({
      type: GeneralCommandType.UpdateNotes,
      patches: cutNotes.map((note) => ({
        id: note.id,
        duration: parsed.data.tick - note.tick,
      })),
    });
  }

  // Marker bookkeeping: markers listed together in a `mutuallyExclusiveAtTick`
  // constraint replace each other at a tick. A plain note clears them too.
  const selectedMarker =
    placement.kind === "marker"
      ? cc.chart.pitchForMarker(placement.effect)!
      : null;
  const exclusive = exclusiveMarkerPitches(cc);
  const conflicts = notes.filter(
    (note) =>
      note.tick === parsed.data.tick &&
      exclusive.has(note.pitch) &&
      note.pitch !== selectedMarker,
  );
  if (conflicts.length > 0) {
    commands.push({
      type: GeneralCommandType.DeleteEntities,
      targetIds: conflicts.map((note) => note.id),
    });
  }

  commands.push({
    type: GeneralCommandType.AddNotes,
    notes: [
      {
        trackIndex,
        tick: parsed.data.tick,
        pitch,
        duration:
          (parsed.data.endTick ?? parsed.data.tick + 1) - parsed.data.tick,
        ...(parsed.data.velocity !== undefined
          ? { velocity: parsed.data.velocity }
          : {}),
      },
    ],
  });
  if (
    selectedMarker !== null &&
    !notes.some(
      (n) => n.pitch === selectedMarker && n.tick === parsed.data.tick,
    )
  ) {
    commands.push({
      type: GeneralCommandType.AddNotes,
      notes: [
        {
          trackIndex,
          tick: parsed.data.tick,
          pitch: selectedMarker,
          duration: 1,
        },
      ],
    });
  }
  return { commands, rejections: [] };
}
/** Marker pitches (this difficulty) that belong to a mutual-exclusion constraint. */
function exclusiveMarkerPitches(cc: ChartContext): Set<number> {
  const members = new Set<string>();
  for (const c of cc.rules.constraints) {
    if (c.rule === "mutuallyExclusiveAtTick")
      c.members.forEach((m) => members.add(m));
  }
  const pitches = new Set<number>();
  for (const marker of cc.chart.markers.values()) {
    if (members.has(marker.effect)) pitches.add(marker.pitch);
  }
  return pitches;
}
export function expandMove(
  mode: AbstractEditingMode,
  command: EditCommand,
  context: ModeContext,
  cc: ChartContext,
): ExpansionResult {
  const parsed = MoveSchema.safeParse(command);
  if (!parsed.success) {
    return mode.rejected(
      command,
      "invalid-command",
      "Chart note move is invalid",
    );
  }
  const owned = context.target.ownsNoteEntities(parsed.data.targetIds, command);
  if (owned.rejection) return { commands: [], rejections: [owned.rejection] };

  const patches: { id: EntityId; tick: number; pitch: number }[] = [];
  for (const note of owned.notes) {
    const role = roleOf(note, cc);
    if (role.kind !== "laneNote" || !role.available) {
      return mode.rejected(
        command,
        "not-movable",
        `Note '${note.id}' cannot move in this mode`,
      );
    }
    const tick = Math.max(0, note.tick + parsed.data.tickDelta);
    if (!Number.isSafeInteger(tick)) {
      return mode.rejected(
        command,
        "invalid-tick",
        `Moved note '${note.id}' is outside the safe tick range`,
      );
    }
    let pitch = note.pitch;
    if (!role.bar) {
      const column = Math.max(
        0,
        Math.min(
          cc.rules.columns.length - 1,
          role.column + parsed.data.laneDelta,
        ),
      );
      const lane = cc.rules.columns[column]!;
      const moved = pitchForColumn(cc, lane, role.padType);
      if (moved === null) {
        return mode.rejected(
          command,
          "invalid-lane",
          "Moved note has no configured pitch on its target lane",
        );
      }
      pitch = moved;
    }
    patches.push({ id: note.id, tick, pitch });
  }
  return {
    commands:
      patches.length > 0
        ? [{ type: GeneralCommandType.UpdateNotes, patches }]
        : [],
    rejections: [],
  };
}
export function expandSustainEnd(
  mode: AbstractEditingMode,
  command: EditCommand,
  context: ModeContext,
  cc: ChartContext,
): ExpansionResult {
  const parsed = SustainEndSchema.safeParse(command);
  if (!parsed.success || !validTick(parsed.data.endTick)) {
    return mode.rejected(command, "invalid-command", "Sustain end is invalid");
  }
  const owned = context.target.ownsNoteEntities(parsed.data.targetIds, command);
  if (owned.rejection) return { commands: [], rejections: [owned.rejection] };

  const sustain = sustainRule(context, cc.rules);
  const selectedIds = new Set(owned.notes.map((note) => note.id));
  const patches = [];
  for (const note of owned.notes) {
    if (
      !isSustain(note.duration, sustain) ||
      roleOf(note, cc).kind !== "laneNote"
    ) {
      return mode.rejected(
        command,
        "not-sustain",
        `Note '${note.id}' is not a sustain`,
      );
    }
    let endTick = Math.max(note.tick + 1, parsed.data.endTick);
    if (parsed.data.extendPastNext === "stop-at-next") {
      const nextStart = context.target
        .noteHandles()
        .filter(
          (candidate) =>
            !selectedIds.has(candidate.id) &&
            roleOf(candidate, cc).kind === "laneNote" &&
            candidate.tick > note.tick &&
            candidate.tick < endTick,
        )
        .reduce((next, candidate) => Math.min(next, candidate.tick), Infinity);
      if (Number.isFinite(nextStart))
        endTick = Math.max(note.tick + 1, nextStart);
    }
    patches.push({ id: note.id, duration: endTick - note.tick });
  }
  return {
    commands: [{ type: GeneralCommandType.UpdateNotes, patches }],
    rejections: [],
  };
}
export function expandCut(
  mode: AbstractEditingMode,
  command: EditCommand,
  context: ModeContext,
  cc: ChartContext,
): ExpansionResult {
  const parsed = CutSchema.safeParse(command);
  if (!parsed.success || !validTick(parsed.data.tick)) {
    return mode.rejected(command, "invalid-command", "Sustain cut is invalid");
  }
  if (parsed.data.preferredSustainId) {
    const preferred = context.target.ownsNoteEntities(
      [parsed.data.preferredSustainId],
      command,
    );
    if (preferred.rejection)
      return { commands: [], rejections: [preferred.rejection] };
  }
  const targets = getSustainCutTargets(
    sustainCandidates(context, cc),
    parsed.data.tick,
    {
      cutPolicy: parsed.data.cutPolicy,
      preferredNoteOn:
        (parsed.data.preferredSustainId as EntityId | undefined) ?? null,
    },
  );
  return {
    commands:
      targets.length === 0
        ? []
        : [
            {
              type: GeneralCommandType.UpdateNotes,
              patches: targets.map((note) => ({
                id: note.id,
                duration: parsed.data.tick - note.tick,
              })),
            },
          ],
    rejections: [],
  };
}
export function expandCreatePhrase(
  mode: AbstractEditingMode,
  command: EditCommand,
  context: ModeContext,
  cc: ChartContext,
): ExpansionResult {
  const parsed = CreatePhraseSchema.safeParse(command);
  if (
    !parsed.success ||
    !validSpan(parsed.data.startTick, parsed.data.endTick)
  ) {
    return mode.rejected(command, "invalid-span", "Phrase span is invalid");
  }
  const phrase = phrasesFor(cc.rules, cc.difficulty).find(
    (p) => p.id === parsed.data.phraseId,
  );
  if (!phrase) {
    return mode.rejected(
      command,
      "missing-config-note",
      `Phrase '${parsed.data.phraseId}' is not available on this chart`,
    );
  }
  return {
    commands: [
      {
        type: GeneralCommandType.AddNotes,
        notes: [
          {
            trackIndex: context.target.trackIndex ?? 0,
            tick: parsed.data.startTick,
            pitch: phrase.pitches[0]!,
            duration: parsed.data.endTick - parsed.data.startTick,
          },
        ],
      },
    ],
    rejections: [],
  };
}
export function expandUpdatePhrase(
  mode: AbstractEditingMode,
  command: EditCommand,
  context: ModeContext,
  cc: ChartContext,
): ExpansionResult {
  const parsed = UpdatePhraseSchema.safeParse(command);
  if (
    !parsed.success ||
    !validSpan(parsed.data.startTick, parsed.data.endTick)
  ) {
    return mode.rejected(command, "invalid-span", "Phrase span is invalid");
  }
  const owned = context.target.ownsNoteEntities([parsed.data.id], command);
  if (owned.rejection) return { commands: [], rejections: [owned.rejection] };
  if (roleOf(owned.notes[0]!, cc).kind !== "phrase") {
    return mode.rejected(
      command,
      "not-phrase",
      "Target entity is not a phrase",
    );
  }
  return {
    commands: [
      {
        type: GeneralCommandType.UpdateNotes,
        patches: [
          {
            id: owned.notes[0]!.id,
            tick: parsed.data.startTick,
            duration: parsed.data.endTick - parsed.data.startTick,
          },
        ],
      },
    ],
    rejections: [],
  };
}
export function expandPasteNotes(
  mode: AbstractEditingMode,
  command: EditCommand,
  context: ModeContext,
  cc: ChartContext,
): ExpansionResult {
  const parsed = PasteSchema.safeParse(command);
  if (!parsed.success || !validTick(parsed.data.anchorTick)) {
    return mode.rejected(
      command,
      "invalid-paste",
      "Chart paste data is invalid",
    );
  }
  const occupied = new Set(
    context.target.noteHandles().map((n) => `${n.pitch}:${n.tick}`),
  );
  const notes: Extract<
    GeneralCommand,
    { type: GeneralCommandType.AddNotes }
  >["notes"][number][] = [];
  for (const entry of parsed.data.notes) {
    const lane = cc.rules.lanes.find((l) =>
      entry.laneId !== undefined
        ? l.id === entry.laneId
        : l.column === entry.lane,
    );
    if (!lane) continue;
    const start = Math.max(0, parsed.data.anchorTick + entry.relativeTick);
    if (!Number.isSafeInteger(start)) {
      return mode.rejected(
        command,
        "invalid-tick",
        "Pasted note is outside the safe tick range",
      );
    }
    let pitch: number | null;
    if (lane.isBar) {
      // Keep an alternate pitch (e.g. a second kick) when it is valid here.
      const alt =
        entry.originalPitch !== undefined &&
        cc.chart.notes.get(entry.originalPitch)?.laneId === lane.id
          ? entry.originalPitch
          : undefined;
      pitch = alt ?? cc.chart.pitchForLane(lane.id) ?? null;
    } else {
      pitch = pitchForColumn(cc, lane, entry.padType);
    }
    if (pitch === null || occupied.has(`${pitch}:${start}`)) continue;
    occupied.add(`${pitch}:${start}`);
    notes.push({
      trackIndex: context.target.trackIndex ?? 0,
      tick: start,
      pitch,
      duration: entry.durationTicks,
      velocity: entry.velocity,
    });
  }
  return {
    commands:
      notes.length > 0 ? [{ type: GeneralCommandType.AddNotes, notes }] : [],
    rejections: [],
  };
}
export function emptyProjection(): Projection {
  return { getRows: () => [], rowForNote: () => null, pitchForRow: () => null };
}

const ExpansionCommandMap = new Map<string, ExpanderFn>([
  [DomainCommandType.PlaceChartNote, expandPlace as ExpanderFn],
  [DomainCommandType.MoveChartNotes, expandMove as ExpanderFn],
  [DomainCommandType.SetSustainEnd, expandSustainEnd as ExpanderFn],
  [DomainCommandType.CutSustains, expandCut as ExpanderFn],
  [DomainCommandType.CreatePhrase, expandCreatePhrase as ExpanderFn],
  [DomainCommandType.UpdatePhrase, expandUpdatePhrase as ExpanderFn],
  [DomainCommandType.PasteChartNotes, expandPasteNotes as ExpanderFn],
]);

export function getExpander(commandType: string): ExpanderFn | undefined {
  return ExpansionCommandMap.get(commandType);
}
