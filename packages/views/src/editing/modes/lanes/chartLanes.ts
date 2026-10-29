/**
 * `chart.lanes`: the single, rules-driven editing mode for every chart track
 * (guitar, gamepad and drums). Lanes, pad types, markers, phrases and the
 * sustain threshold all come from the compiled ruleset of the target track;
 * nothing here knows what a "fret" or a "drum" is.
 */
import { z } from "zod";
import { getSustainCutTargets } from "../../sustains.js";
import type { MarkerEffect, PadType, PhraseDef } from "../../../config.js";
import { classifyPitch, type PitchRole } from "../../../ruleset/classify.js";
import {
  difficultyName,
  type ChartRules,
  type CompiledLane,
  type TrackRules,
} from "../../../ruleset/compile.js";
import { thresholdContext } from "../../../ruleset/enforce.js";
import { phraseIcon, phraseLabel } from "../../../ruleset/labels.js";
import { resolveThreshold } from "../../../ruleset/thresholds.js";
import type { ClipboardPayload } from "../../clipboard.js";
import {
  DomainCommandType,
  EditCommandType,
  type EditCommand,
  type GeneralCommand,
} from "../../commands.js";
import { EntityType, type EntityId } from "../../entity.js";
import { isRawCommand } from "../../modes/mode.js";
import type {
  EditingMode,
  EntityClassification,
  ExpansionResult,
  ModeContext,
  Projection,
  ProjectionRow,
  ToolDescriptor,
} from "../../modes/mode.js";
import type { NoteSnapshot } from "../../reader.js";
import type { Rejection } from "../../result.js";
import {
  ownsNotes,
  rejected,
  targetNotes,
  targetRules,
  targetTrackIndex,
  validSpan,
  validTick,
} from "../common.js";

const CutPolicy = z.enum([
  "all",
  "none",
  "preferred-only",
  "all-but-preferred",
]);

const ToolStateSchema = z.object({
  tool: z.enum(["select", "place", "remove"]),
  /** Phrase id of the active phrase tool, if any. */
  phrase: z.string().nullable(),
  /** Placement token; see {@link placementTokens}. */
  placement: z.string(),
});
export type ChartLanesToolState = z.infer<typeof ToolStateSchema>;

const PlaceSchema = z.object({
  type: z.literal(DomainCommandType.PlaceChartNote),
  lane: z.number().int(),
  tick: z.number().int(),
  endTick: z.number().int().optional(),
  velocity: z.number().int().min(1).max(127).optional(),
  placement: z.string().default("normal"),
  cutPolicy: CutPolicy.default("none"),
  preferredSustainId: z.string().optional(),
});
const MoveSchema = z.object({
  type: z.literal(DomainCommandType.MoveChartNotes),
  targetIds: z.array(z.string()),
  tickDelta: z.number().int(),
  laneDelta: z.number().int(),
});
const SustainEndSchema = z.object({
  type: z.literal(DomainCommandType.SetSustainEnd),
  targetIds: z.array(z.string()),
  endTick: z.number().int(),
  extendPastNext: z.enum(["allow", "stop-at-next"]),
});
const CutSchema = z.object({
  type: z.literal(DomainCommandType.CutSustains),
  tick: z.number().int(),
  cutPolicy: CutPolicy,
  preferredSustainId: z.string().optional(),
});
const CreatePhraseSchema = z.object({
  type: z.literal(DomainCommandType.CreatePhrase),
  phraseId: z.string(),
  startTick: z.number().int(),
  endTick: z.number().int(),
});
const UpdatePhraseSchema = z.object({
  type: z.literal(DomainCommandType.UpdatePhrase),
  id: z.string(),
  startTick: z.number().int(),
  endTick: z.number().int(),
});
const PasteSchema = z.object({
  type: z.literal(DomainCommandType.PasteChartNotes),
  anchorTick: z.number().int(),
  notes: z.array(
    z.object({
      relativeTick: z.number().int(),
      /** Column index, or -1 for bar lanes. */
      lane: z.number().int(),
      laneId: z.string().optional(),
      padType: z.enum(["tom", "cymbal"]).optional(),
      durationTicks: z.number().int().positive(),
      velocity: z.number().int().min(1).max(127),
      originalPitch: z.number().int().min(0).max(127).optional(),
    }),
  ),
});

const domainCommandTypes = new Set([
  DomainCommandType.PlaceChartNote,
  DomainCommandType.MoveChartNotes,
  DomainCommandType.SetSustainEnd,
  DomainCommandType.CutSustains,
  DomainCommandType.CreatePhrase,
  DomainCommandType.UpdatePhrase,
  DomainCommandType.PasteChartNotes,
]);

const MARKER_LABELS: Record<MarkerEffect, string> = {
  forceHopo: "HOPO",
  forceStrum: "Strum",
  forceTap: "Tap",
  flam: "Flam",
};
const PAD_TYPE_LABELS: Record<PadType, string> = {
  tom: "Pad",
  cymbal: "Cymbal",
};

/* -------------------------------------------------------------------------- */
/* Rules helpers                                                              */
/* -------------------------------------------------------------------------- */

interface ChartContext {
  rules: TrackRules;
  chart: ChartRules;
  difficulty: number;
}

function chartContext(context: ModeContext): ChartContext | null {
  const rules = targetRules(context);
  const difficulty = context.target.difficulty;
  if (!rules || difficulty === null) return null;
  const chart = rules.difficulties.get(difficulty);
  return chart ? { rules, chart, difficulty } : null;
}

function phrasesFor(rules: TrackRules, difficulty: number): PhraseDef[] {
  const name = difficultyName(difficulty);
  return rules.phrases.filter(
    (p) =>
      p.status !== "todo" &&
      (!p.appliesTo || p.appliesTo === "all" || p.appliesTo.includes(name)),
  );
}

/** Default pad type of a lane, when the lane distinguishes pad types. */
function defaultPadType(lane: CompiledLane): PadType | undefined {
  return lane.defaultPadType ?? lane.padTypes?.[0];
}

/**
 * Placement tokens offered for a chart: `normal` (default pad type),
 * `padType:<t>` for other pad types, `bar:<laneId>` for bar lanes and
 * `marker:<effect>` for each marker of the difficulty.
 */
export function placementTokens(
  rules: TrackRules,
  chart: ChartRules,
): string[] {
  const tokens = ["normal"];
  const padTypes = new Set<PadType>();
  for (const lane of rules.columns) {
    for (const t of lane.padTypes ?? []) padTypes.add(t);
  }
  const base = rules.columns.map(defaultPadType).find((t) => t !== undefined);
  for (const t of padTypes) if (t !== base) tokens.push(`padType:${t}`);
  for (const bar of rules.bars) tokens.push(`bar:${bar.id}`);
  for (const marker of chart.markers.values()) {
    const token = `marker:${marker.effect}`;
    if (!tokens.includes(token)) tokens.push(token);
  }
  return tokens;
}

function placementLabel(token: string, rules: TrackRules): string {
  if (token === "normal") {
    const base = rules.columns.map(defaultPadType).find((t) => t !== undefined);
    return base ? PAD_TYPE_LABELS[base] : "Normal";
  }
  const [kind, value = ""] = token.split(":");
  if (kind === "padType") return PAD_TYPE_LABELS[value as PadType] ?? value;
  if (kind === "bar") {
    return rules.bars.find((b) => b.id === value)?.displayName ?? value;
  }
  return MARKER_LABELS[value as MarkerEffect] ?? value;
}

type Placement =
  | { kind: "normal" }
  | { kind: "padType"; padType: PadType }
  | { kind: "bar"; laneId: string }
  | { kind: "marker"; effect: MarkerEffect };

function parsePlacement(token: string): Placement | null {
  if (token === "normal") return { kind: "normal" };
  const [kind, value] = token.split(":");
  if (!value) return null;
  if (kind === "padType" && (value === "tom" || value === "cymbal")) {
    return { kind: "padType", padType: value };
  }
  if (kind === "bar") return { kind: "bar", laneId: value };
  if (kind === "marker")
    return { kind: "marker", effect: value as MarkerEffect };
  return null;
}

function pitchForColumn(
  cc: ChartContext,
  lane: CompiledLane,
  padType: PadType | undefined,
): number | null {
  const wanted = padType ?? defaultPadType(lane);
  if (padType !== undefined && !lane.padTypes?.includes(padType)) return null;
  return (
    cc.chart.pitchForLane(lane.id, wanted) ??
    (padType === undefined ? cc.chart.pitchForLane(lane.id) : undefined) ??
    null
  );
}

/** Sustain threshold in ticks; `null` when the track has no sustains. */
function sustainRule(context: ModeContext, rules: TrackRules) {
  const cutoff = rules.mechanics?.sustainCutoff;
  if (!cutoff) return null;
  return resolveThreshold(
    cutoff,
    thresholdContext(context.rules, {
      ...context.rulesContext,
      ppqn: context.reader.getPpqn(),
    }),
  );
}

function isSustain(
  duration: number,
  sustain: ReturnType<typeof sustainRule>,
): boolean {
  if (!sustain) return false;
  return sustain.inclusive
    ? duration > sustain.ticks
    : duration >= sustain.ticks;
}

function roleOf(note: { pitch: number }, cc: ChartContext): PitchRole {
  return classifyPitch(cc.rules, note.pitch, cc.difficulty);
}

/* -------------------------------------------------------------------------- */
/* Mode                                                                       */
/* -------------------------------------------------------------------------- */

export function createChartLanesMode(): EditingMode<ChartLanesToolState> {
  return {
    id: "chart.lanes",
    label: "Chart Lanes",
    hostKinds: new Set(["highway"]),
    appliesTo: (track) =>
      (track.kind === "guitar" ||
        track.kind === "gamepad" ||
        track.kind === "drums") &&
      track.rules.difficulties.size > 0,
    capabilities: {
      rawCommands: new Set([EditCommandType.DeleteEntities]),
      domainCommands: domainCommandTypes,
      entityKinds: new Set([EntityType.Note, EntityType.Phrase]),
      canCreateTrack: true,
      requiresDifficulty: true,
    },
    createTools: (context) => createTools(context),
    toolStateSchema: ToolStateSchema,
    createDefaultToolState: () => ({
      tool: "select",
      phrase: null,
      placement: "normal",
    }),
    createProjection: (context) => createProjection(context),
    classify: (note, context) => classifyNote(note, context),
    expandPaste: (payload, anchorTick, context) =>
      expandPaste(payload, anchorTick, context),
    expand: (command, context) => expandCommand(command, context),
  };
}

function createTools(context: ModeContext): readonly ToolDescriptor[] {
  const base: ToolDescriptor[] = [
    {
      id: "select",
      label: "Select, move, and edit sustains",
      icon: "cursor",
      group: "highway-tools",
      stateKey: "tool",
      value: "select",
      shortcutActionId: "highway.set-tool",
      shortcutVariant: "select",
    },
    {
      id: "place",
      label: "Place notes",
      icon: "pencil",
      group: "highway-tools",
      stateKey: "tool",
      value: "place",
      shortcutActionId: "highway.set-tool",
      shortcutVariant: "place",
    },
    {
      id: "remove",
      label: "Remove notes",
      icon: "eraser",
      group: "highway-tools",
      stateKey: "tool",
      value: "remove",
      shortcutActionId: "highway.set-tool",
      shortcutVariant: "remove",
    },
  ];
  const cc = chartContext(context);
  if (!cc) return base;

  const phraseTools: ToolDescriptor[] = phrasesFor(cc.rules, cc.difficulty)
    .filter((p) => (p.status ?? "stable") === "stable")
    .map((p) => ({
      id: `phrase-${p.id}`,
      label: `${phraseLabel(p.effect)} phrase`,
      icon: phraseIcon(p.effect),
      group: "highway-tools",
      stateKey: "phrase",
      value: p.id,
      toggle: { offValue: null },
      shortcutActionId: "highway.toggle-phrase-tool",
      shortcutVariant: p.id,
    }));
  const placementTools: ToolDescriptor[] = placementTokens(
    cc.rules,
    cc.chart,
  ).map((token) => ({
    id: `placement-${token.replace(":", "-")}`,
    label: placementLabel(token, cc.rules),
    icon: token,
    group: "placement",
    stateKey: "placement",
    value: token,
  }));
  return [...base, ...phraseTools, ...placementTools];
}

function rowsFor(rules: TrackRules): ProjectionRow[] {
  return [
    ...rules.columns.map((lane) => ({
      id: String(lane.column),
      label: lane.displayName,
      index: lane.column,
      kind: "lane",
    })),
    ...rules.bars.map((lane, i) => ({
      id: lane.id,
      label: lane.displayName,
      index: rules.columns.length + i,
      kind: "bar",
    })),
  ];
}

function createProjection(context: ModeContext): Projection {
  const cc = chartContext(context);
  if (!cc) return emptyProjection();
  const rows = rowsFor(cc.rules);
  return {
    getRows: () => rows,
    rowForNote: (note) => {
      const role = roleOf(note, cc);
      if (role.kind !== "laneNote" || !role.available) return null;
      return role.bar
        ? (rows.find((r) => r.id === role.laneId) ?? null)
        : (rows[role.column] ?? null);
    },
    pitchForRow: (row, state) => {
      const parsed = ToolStateSchema.safeParse(state);
      const placement =
        (parsed.success ? parsePlacement(parsed.data.placement) : null) ??
        ({ kind: "normal" } as Placement);
      return pitchForRowAndPlacement(cc, row, placement);
    },
  };
}

function pitchForRowAndPlacement(
  cc: ChartContext,
  row: ProjectionRow,
  placement: Placement,
): number | null {
  if (row.kind === "bar") return cc.chart.pitchForLane(row.id) ?? null;
  const lane = cc.rules.columns[row.index];
  if (!lane) return null;
  if (placement.kind === "bar") {
    return cc.chart.pitchForLane(placement.laneId) ?? null;
  }
  return pitchForColumn(
    cc,
    lane,
    placement.kind === "padType" ? placement.padType : undefined,
  );
}

function classifyNote(
  note: NoteSnapshot,
  context: ModeContext,
): EntityClassification {
  const fallback: EntityClassification = {
    type: EntityType.Note,
    subtype: "unmapped",
    movable: false,
    resizable: false,
  };
  const cc = chartContext(context);
  if (!cc) return fallback;
  const role = roleOf(note, cc);
  switch (role.kind) {
    case "phrase":
      return {
        type: EntityType.Phrase,
        subtype: role.id,
        movable: true,
        resizable: true,
      };
    case "marker":
      return {
        type: EntityType.Note,
        subtype: "marker",
        movable: false,
        resizable: false,
      };
    case "laneNote": {
      if (!role.available) return fallback;
      const sustain = isSustain(note.duration, sustainRule(context, cc.rules));
      return {
        type: EntityType.Note,
        subtype: sustain ? "sustain" : "chart-note",
        movable: true,
        resizable: sustain,
      };
    }
    default:
      return fallback;
  }
}

/* -------------------------------------------------------------------------- */
/* Paste                                                                      */
/* -------------------------------------------------------------------------- */

function expandPaste(
  payload: ClipboardPayload,
  anchorTick: number,
  context: ModeContext,
): ExpansionResult {
  const pasteCommand: EditCommand = {
    type: DomainCommandType.PasteChartNotes,
    anchorTick,
    notes: [],
  };
  const cc = chartContext(context);
  if (!cc) {
    return rejected(
      pasteCommand,
      "missing-config",
      "Chart track rules are unavailable",
    );
  }
  const rows = rowsFor(cc.rules);
  const sameMode = payload.sourceModeId === "chart.lanes";
  const notes: z.infer<typeof PasteSchema>["notes"] = [];
  const commands: GeneralCommand[] = [];
  const rejections: Rejection[] = [];

  for (const entity of payload.entities) {
    const tick = anchorTick + entity.relativeTick;
    if (
      !validSpan(tick, tick + entity.duration) ||
      !Number.isSafeInteger(tick + entity.duration)
    ) {
      rejections.push({
        code: "invalid-paste-span",
        message: "Pasted note span is invalid",
        command: pasteCommand,
      });
      continue;
    }

    // Phrases: same mode carries the phrase id; other modes carry a pitch.
    const phraseId = sameMode
      ? entity.classification.type === "phrase"
        ? entity.classification.subtype
        : null
      : (() => {
          const role = classifyPitch(cc.rules, entity.pitch, null);
          return role.kind === "phrase" ? role.id : null;
        })();
    if (phraseId !== null) {
      const expansion = expandCommand(
        {
          type: DomainCommandType.CreatePhrase,
          phraseId,
          startTick: tick,
          endTick: tick + entity.duration,
        },
        context,
      );
      commands.push(...expansion.commands);
      rejections.push(...expansion.rejections);
      continue;
    }

    // Lane notes: resolve the destination lane and pad type.
    let laneId: string | undefined;
    let padType: PadType | undefined;
    if (sameMode) {
      const row = rows.find((r) => r.id === entity.row);
      laneId = row
        ? row.kind === "bar"
          ? row.id
          : cc.rules.columns[row.index]?.id
        : undefined;
      padType = padTypeOfPitch(cc, entity.pitch);
    } else {
      const role = classifyPitch(cc.rules, entity.pitch, null);
      if (role.kind === "laneNote") {
        laneId = role.laneId;
        padType = role.padType;
      }
    }
    const lane = cc.rules.lanes.find((l) => l.id === laneId);
    if (!lane) {
      rejections.push({
        code: "invalid-chart-pitch",
        message: "This note is outside the configured chart lanes",
        command: pasteCommand,
      });
      continue;
    }
    notes.push({
      relativeTick: entity.relativeTick,
      lane: lane.column,
      laneId: lane.id,
      ...(padType ? { padType } : {}),
      durationTicks: entity.duration,
      velocity: entity.velocity,
      originalPitch: entity.pitch,
    });
  }

  const expansion = expandCommand({ ...pasteCommand, notes }, context);
  return {
    commands: [...commands, ...expansion.commands],
    rejections: [...rejections, ...expansion.rejections],
  };
}

function padTypeOfPitch(cc: ChartContext, pitch: number): PadType | undefined {
  const role = classifyPitch(cc.rules, pitch, cc.difficulty);
  return role.kind === "laneNote" ? role.padType : undefined;
}

/* -------------------------------------------------------------------------- */
/* Command expansion                                                          */
/* -------------------------------------------------------------------------- */

function expandCommand(
  command: EditCommand,
  context: ModeContext,
): ExpansionResult {
  const cc = chartContext(context);
  if (!cc) {
    return rejected(
      command,
      "missing-config",
      "Chart track configuration is unavailable",
    );
  }
  if (
    isRawCommand(command) &&
    command.type === EditCommandType.DeleteEntities
  ) {
    const owned = ownsNotes(command.targetIds, context, command);
    return owned.rejection
      ? { commands: [], rejections: [owned.rejection] }
      : { commands: [command], rejections: [] };
  }
  switch (command.type) {
    case DomainCommandType.PlaceChartNote:
      return expandPlace(command, context, cc);
    case DomainCommandType.MoveChartNotes:
      return expandMove(command, context, cc);
    case DomainCommandType.SetSustainEnd:
      return expandSustainEnd(command, context, cc);
    case DomainCommandType.CutSustains:
      return expandCut(command, context, cc);
    case DomainCommandType.CreatePhrase:
      return expandCreatePhrase(command, context, cc);
    case DomainCommandType.UpdatePhrase:
      return expandUpdatePhrase(command, context, cc);
    case DomainCommandType.PasteChartNotes:
      return expandPasteNotes(command, context, cc);
    default:
      return rejected(
        command,
        "unsupported-command",
        `Command '${command.type}' is unsupported by chart.lanes`,
      );
  }
}

function sustainCandidates(context: ModeContext, cc: ChartContext) {
  const sustain = sustainRule(context, cc.rules);
  return targetNotes(context)
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

function expandPlace(
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
    return rejected(
      command,
      "invalid-command",
      "Chart note placement is invalid",
    );
  }
  const placement = parsePlacement(parsed.data.placement);
  if (!placement) {
    return rejected(
      command,
      "invalid-placement",
      `Unknown placement '${parsed.data.placement}'`,
    );
  }
  if (
    placement.kind === "marker" &&
    cc.chart.pitchForMarker(placement.effect) === undefined
  ) {
    return rejected(
      command,
      "missing-config-note",
      `No ${placement.effect} marker is configured for this difficulty`,
    );
  }
  const columns = cc.rules.columns;
  const row = columns[parsed.data.lane];
  if (placement.kind !== "bar" && !row) {
    return rejected(
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
    return rejected(
      command,
      "invalid-lane",
      "This placement has no configured pitch on the selected lane",
    );
  }

  const trackIndex = targetTrackIndex(context);
  const notes = targetNotes(context);
  const preferredId = parsed.data.preferredSustainId;
  if (preferredId) {
    const preferred = ownsNotes([preferredId], context, command);
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
      type: EditCommandType.UpdateNotes,
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
      type: EditCommandType.DeleteEntities,
      targetIds: conflicts.map((note) => note.id),
    });
  }

  commands.push({
    type: EditCommandType.AddNotes,
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
      type: EditCommandType.AddNotes,
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

function expandMove(
  command: EditCommand,
  context: ModeContext,
  cc: ChartContext,
): ExpansionResult {
  const parsed = MoveSchema.safeParse(command);
  if (!parsed.success) {
    return rejected(command, "invalid-command", "Chart note move is invalid");
  }
  const owned = ownsNotes(parsed.data.targetIds, context, command);
  if (owned.rejection) return { commands: [], rejections: [owned.rejection] };

  const patches: { id: EntityId; tick: number; pitch: number }[] = [];
  for (const note of owned.notes) {
    const role = roleOf(note, cc);
    if (role.kind !== "laneNote" || !role.available) {
      return rejected(
        command,
        "not-movable",
        `Note '${note.id}' cannot move in this mode`,
      );
    }
    const tick = Math.max(0, note.tick + parsed.data.tickDelta);
    if (!Number.isSafeInteger(tick)) {
      return rejected(
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
        return rejected(
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
        ? [{ type: EditCommandType.UpdateNotes, patches }]
        : [],
    rejections: [],
  };
}

function expandSustainEnd(
  command: EditCommand,
  context: ModeContext,
  cc: ChartContext,
): ExpansionResult {
  const parsed = SustainEndSchema.safeParse(command);
  if (!parsed.success || !validTick(parsed.data.endTick)) {
    return rejected(command, "invalid-command", "Sustain end is invalid");
  }
  const owned = ownsNotes(parsed.data.targetIds, context, command);
  if (owned.rejection) return { commands: [], rejections: [owned.rejection] };

  const sustain = sustainRule(context, cc.rules);
  const selectedIds = new Set(owned.notes.map((note) => note.id));
  const patches = [];
  for (const note of owned.notes) {
    if (
      !isSustain(note.duration, sustain) ||
      roleOf(note, cc).kind !== "laneNote"
    ) {
      return rejected(
        command,
        "not-sustain",
        `Note '${note.id}' is not a sustain`,
      );
    }
    let endTick = Math.max(note.tick + 1, parsed.data.endTick);
    if (parsed.data.extendPastNext === "stop-at-next") {
      const nextStart = targetNotes(context)
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
    commands: [{ type: EditCommandType.UpdateNotes, patches }],
    rejections: [],
  };
}

function expandCut(
  command: EditCommand,
  context: ModeContext,
  cc: ChartContext,
): ExpansionResult {
  const parsed = CutSchema.safeParse(command);
  if (!parsed.success || !validTick(parsed.data.tick)) {
    return rejected(command, "invalid-command", "Sustain cut is invalid");
  }
  if (parsed.data.preferredSustainId) {
    const preferred = ownsNotes(
      [parsed.data.preferredSustainId],
      context,
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
              type: EditCommandType.UpdateNotes,
              patches: targets.map((note) => ({
                id: note.id,
                duration: parsed.data.tick - note.tick,
              })),
            },
          ],
    rejections: [],
  };
}

function expandCreatePhrase(
  command: EditCommand,
  context: ModeContext,
  cc: ChartContext,
): ExpansionResult {
  const parsed = CreatePhraseSchema.safeParse(command);
  if (
    !parsed.success ||
    !validSpan(parsed.data.startTick, parsed.data.endTick)
  ) {
    return rejected(command, "invalid-span", "Phrase span is invalid");
  }
  const phrase = phrasesFor(cc.rules, cc.difficulty).find(
    (p) => p.id === parsed.data.phraseId,
  );
  if (!phrase) {
    return rejected(
      command,
      "missing-config-note",
      `Phrase '${parsed.data.phraseId}' is not available on this chart`,
    );
  }
  return {
    commands: [
      {
        type: EditCommandType.AddNotes,
        notes: [
          {
            trackIndex: targetTrackIndex(context),
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

function expandUpdatePhrase(
  command: EditCommand,
  context: ModeContext,
  cc: ChartContext,
): ExpansionResult {
  const parsed = UpdatePhraseSchema.safeParse(command);
  if (
    !parsed.success ||
    !validSpan(parsed.data.startTick, parsed.data.endTick)
  ) {
    return rejected(command, "invalid-span", "Phrase span is invalid");
  }
  const owned = ownsNotes([parsed.data.id], context, command);
  if (owned.rejection) return { commands: [], rejections: [owned.rejection] };
  if (roleOf(owned.notes[0]!, cc).kind !== "phrase") {
    return rejected(command, "not-phrase", "Target entity is not a phrase");
  }
  return {
    commands: [
      {
        type: EditCommandType.UpdateNotes,
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

function expandPasteNotes(
  command: EditCommand,
  context: ModeContext,
  cc: ChartContext,
): ExpansionResult {
  const parsed = PasteSchema.safeParse(command);
  if (!parsed.success || !validTick(parsed.data.anchorTick)) {
    return rejected(command, "invalid-paste", "Chart paste data is invalid");
  }
  const occupied = new Set(
    targetNotes(context).map((n) => `${n.pitch}:${n.tick}`),
  );
  const notes: Extract<
    GeneralCommand,
    { type: EditCommandType.AddNotes }
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
      return rejected(
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
      trackIndex: targetTrackIndex(context),
      tick: start,
      pitch,
      duration: entry.durationTicks,
      velocity: entry.velocity,
    });
  }
  return {
    commands:
      notes.length > 0 ? [{ type: EditCommandType.AddNotes, notes }] : [],
    rejections: [],
  };
}

function emptyProjection(): Projection {
  return { getRows: () => [], rowForNote: () => null, pitchForRow: () => null };
}
