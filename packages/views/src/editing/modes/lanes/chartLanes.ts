/**
 * `chart.lanes`: the single, rules-driven editing mode for every chart track
 * (guitar, gamepad and drums). Lanes, pad types, markers, phrases and the
 * sustain threshold all come from the compiled ruleset of the target track;
 * nothing here knows what a "fret" or a "drum" is.
 */
import { z } from "zod";
import type { MarkerEffect, PadType, PhraseDef } from "../../../ruleset/config";
import { classifyPitch, type PitchRole } from "../../../ruleset/classify";
import {
  difficultyName,
  type ChartRules,
  type CompiledLane,
  type TrackRules,
  type TrackDescriptor,
} from "../../../ruleset/compile";
import { thresholdContext } from "../../../ruleset/enforce";
import { phraseIcon, phraseLabel } from "../../../ruleset/labels";
import { resolveThreshold } from "../../../ruleset/thresholds";
import type { ClipboardPayload } from "../../clipboard";
import {
  DomainCommandType,
  GeneralCommandType,
  type EditCommand,
  type GeneralCommand,
} from "../../commands";
import { EntityIdSchema, EntityType } from "../../entity";
import { AbstractEditingMode, EditingModeId } from "../../modes/mode";
import type {
  EntityClassification,
  ExpansionResult,
  ModeCapabilities,
  ModeContext,
  Projection,
  ProjectionRow,
  ToolDescriptor,
} from "../../modes/mode";
import type { NoteHandle } from "../../entity";
import type { Rejection } from "../../result";
import { validSpan } from "../common";
import { emptyProjection, getExpander } from "./expansion";

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

export const PlaceSchema = z.object({
  type: z.literal(DomainCommandType.PlaceChartNote),
  lane: z.number().int(),
  tick: z.number().int(),
  endTick: z.number().int().optional(),
  velocity: z.number().int().min(1).max(127).optional(),
  placement: z.string().default("normal"),
  cutPolicy: CutPolicy.default("none"),
  preferredSustainId: EntityIdSchema.optional(),
});
export const MoveSchema = z.object({
  type: z.literal(DomainCommandType.MoveChartNotes),
  targetIds: z.array(EntityIdSchema),
  tickDelta: z.number().int(),
  laneDelta: z.number().int(),
});
export const SustainEndSchema = z.object({
  type: z.literal(DomainCommandType.SetSustainEnd),
  targetIds: z.array(EntityIdSchema),
  endTick: z.number().int(),
  extendPastNext: z.enum(["allow", "stop-at-next"]),
});
export const CutSchema = z.object({
  type: z.literal(DomainCommandType.CutSustains),
  tick: z.number().int(),
  cutPolicy: CutPolicy,
  preferredSustainId: EntityIdSchema.optional(),
});
export const CreatePhraseSchema = z.object({
  type: z.literal(DomainCommandType.CreatePhrase),
  phraseId: z.string(),
  startTick: z.number().int(),
  endTick: z.number().int(),
});
export const UpdatePhraseSchema = z.object({
  type: z.literal(DomainCommandType.UpdatePhrase),
  id: EntityIdSchema,
  startTick: z.number().int(),
  endTick: z.number().int(),
});
export const PasteSchema = z.object({
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

export interface ChartContext {
  rules: TrackRules;
  chart: ChartRules;
  difficulty: number;
}

function chartContext(context: ModeContext): ChartContext | null {
  const rules = context.target.rules();
  const difficulty = context.target.difficulty;
  if (!rules || difficulty === null) {
    return null;
  }
  const chart = rules.difficulties.get(difficulty);
  return chart ? { rules, chart, difficulty } : null;
}

export function phrasesFor(rules: TrackRules, difficulty: number): PhraseDef[] {
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

export function parsePlacement(token: string): Placement | null {
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

export function pitchForColumn(
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
export function sustainRule(context: ModeContext, rules: TrackRules) {
  const cutoff = rules.mechanics?.sustainCutoff;
  if (!cutoff) return null;
  return resolveThreshold(
    cutoff,
    thresholdContext(context.rules, {
      ...context.rulesContext,
      ppqn: context.executor.getPpqn(),
    }),
  );
}

export function isSustain(
  duration: number,
  sustain: ReturnType<typeof sustainRule>,
): boolean {
  if (!sustain) return false;
  return sustain.inclusive
    ? duration > sustain.ticks
    : duration >= sustain.ticks;
}

export function roleOf(note: { pitch: number }, cc: ChartContext): PitchRole {
  return classifyPitch(cc.rules, note.pitch, cc.difficulty);
}

/* -------------------------------------------------------------------------- */
/* Mode                                                                       */
/* -------------------------------------------------------------------------- */

/** Rules-driven mode for every chart track (guitar, gamepad, drums). */
export class ChartLanesMode extends AbstractEditingMode<ChartLanesToolState> {
  public readonly id = EditingModeId.ChartLanes;
  public readonly label = "Chart Lanes";
  public readonly hostKinds: ReadonlySet<string> = new Set(["highway"]);
  public readonly capabilities: ModeCapabilities = {
    generalCommands: new Set([GeneralCommandType.DeleteEntities]),
    domainCommands: domainCommandTypes,
    entityKinds: new Set([EntityType.Note, EntityType.Phrase]),
    trackKinds: new Set(["guitar", "gamepad", "drums"]),
    canCreateTrack: true,
    requiresDifficulty: true,
  };
  public readonly toolStateSchema = ToolStateSchema;

  public override appliesTo(track: TrackDescriptor): boolean {
    return (
      this.capabilities.trackKinds.has(track.kind) &&
      track.rules.difficulties.size > 0
    );
  }

  public override createTools(context: ModeContext): readonly ToolDescriptor[] {
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
    if (!cc) {
      return base;
    }

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

  public override createDefaultToolState(): ChartLanesToolState {
    return { tool: "select", phrase: null, placement: "normal" };
  }

  public override createProjection(context: ModeContext): Projection {
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

  public override classify(
    note: NoteHandle,
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
        const sustain = isSustain(
          note.duration,
          sustainRule(context, cc.rules),
        );
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

  public override expandPaste(
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
      return this.rejected(
        pasteCommand,
        "missing-config",
        "Chart track rules are unavailable",
      );
    }
    const rows = rowsFor(cc.rules);
    const sameMode = payload.sourceModeId === EditingModeId.ChartLanes;
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
        const expansion = this.expand(
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

    const expansion = this.expand({ ...pasteCommand, notes }, context);
    return {
      commands: [...commands, ...expansion.commands],
      rejections: [...rejections, ...expansion.rejections],
    };
  }

  public override rejected(
    command: EditCommand,
    code: string,
    message: string,
  ): ExpansionResult {
    return {
      commands: [],
      rejections: [{ command, code, message }],
    };
  }
  public override expand(
    command: EditCommand,
    context: ModeContext,
  ): ExpansionResult {
    const cc = chartContext(context);
    if (!cc) {
      return this.rejected(
        command,
        "missing-config",
        "Chart track configuration is unavailable",
      );
    }
    if (command.type === GeneralCommandType.DeleteEntities) {
      const owned = context.target.ownsNoteEntities(command.targetIds, command);
      return owned.rejection
        ? { commands: [], rejections: [owned.rejection] }
        : { commands: [command], rejections: [] };
    }

    const expander = getExpander(command.type);
    if (expander) {
      return expander(this, command, context, cc);
    }
    return this.rejected(
      command,
      "unsupported-command",
      `Command '${command.type}' is unsupported by chart.lanes`,
    );
  }
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

function padTypeOfPitch(cc: ChartContext, pitch: number): PadType | undefined {
  const role = classifyPitch(cc.rules, pitch, cc.difficulty);
  return role.kind === "laneNote" ? role.padType : undefined;
}
