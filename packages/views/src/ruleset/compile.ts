/**
 * Compiles a validated {@link Ruleset} into per-MIDI-track {@link TrackRules}.
 *
 * One `TrackDefinition` may cover several MIDI tracks (`guitar` covers LEAD
 * and RHYTHM GUITAR), so one `TrackRules` is emitted per entry of
 * `trackNames`. Everything downstream (views, editing modes, the rule
 * enforcer, the editor) reads chart semantics from here instead of from
 * hard-coded pitch tables.
 */
import {
  DefaultRuleset,
  type Constraint,
  type DifficultyName,
  type EventNoteDef,
  type LaneDef,
  type MarkerEffect,
  type ModifierDef,
  type PadType,
  type PhraseDef,
  type PitchRange,
  type Ruleset,
  type Severity,
  type TextEventDef,
  type TrackDefinition,
  type TrackKind,
  type VocalNoteClass,
  type Condition,
  type SettingsSource,
} from "../config.js";
import { expandPitchSet } from "./semantics.js";
import { Difficulty } from "../types.js";

const DIFFICULTY_NAMES: Record<Difficulty, DifficultyName> = {
  [Difficulty.Easy]: "easy",
  [Difficulty.Medium]: "medium",
  [Difficulty.Hard]: "hard",
  [Difficulty.Expert]: "expert",
};
const NAME_TO_DIFFICULTY: Record<DifficultyName, Difficulty> = {
  easy: Difficulty.Easy,
  medium: Difficulty.Medium,
  hard: Difficulty.Hard,
  expert: Difficulty.Expert,
};

/** `Difficulty.Expert` → `"expert"`. */
export function difficultyName(d: Difficulty): DifficultyName {
  return DIFFICULTY_NAMES[d];
}
/** `"expert"` → `Difficulty.Expert`. */
export function difficultyFromName(name: DifficultyName): Difficulty {
  return NAME_TO_DIFFICULTY[name];
}

/** `"LEAD GUITAR"` → `"lead-guitar"`. Reproduces the pre-ruleset track keys. */
export function toTrackKey(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Lane shapes that occupy a visual column (as opposed to a full-width bar). */
const COLUMN_SHAPES = new Set(["gem", "pad"]);
const BAR_SHAPES = new Set(["kickBar", "openBar"]);

export interface CompiledLane extends LaneDef {
  /** Visual column among `columns`; `-1` for bar lanes. */
  column: number;
  isBar: boolean;
  shape: NonNullable<LaneDef["shape"]>;
}

export interface NoteRule {
  pitch: number;
  laneId: string;
  padType: PadType | undefined;
  enabledWhen: Condition | undefined;
  whenDisabled: Severity | undefined;
  /** False when the lane does not exist on this MIDI track (`onlyOnTracks`). */
  laneAvailable: boolean;
  /** Severity for the lane being unavailable on this track. */
  laneWhenDisabled: Severity | undefined;
}

export interface MarkerRule {
  pitch: number;
  effect: MarkerEffect;
  scope: "sameTick" | "span";
  includesEndTick: boolean | undefined;
  status: "stable" | "provisional" | "todo";
}

export interface ChartRules {
  difficulty: Difficulty;
  name: DifficultyName;
  notes: ReadonlyMap<number, NoteRule>;
  markers: ReadonlyMap<number, MarkerRule>;
  reserved: readonly PitchRange[];
  /** Pitch for `(laneId, padType)`; first unconditional definition wins. */
  pitchForLane(laneId: string, padType?: PadType): number | undefined;
  /** Marker pitch for an effect, if the difficulty defines one. */
  pitchForMarker(effect: MarkerEffect): number | undefined;
}

export interface TrackRules {
  /** kebab-case key, e.g. `lead-guitar`. */
  key: string;
  /** MIDI track name, e.g. `LEAD GUITAR`. */
  name: string;
  kind: TrackKind;
  definitionId: string;
  position: number | undefined;
  required: boolean;
  visible: boolean;
  editable: boolean;
  definition: TrackDefinition;
  /** Lanes that exist on this track, sorted by `index`. */
  lanes: readonly CompiledLane[];
  columns: readonly CompiledLane[];
  bars: readonly CompiledLane[];
  /** Lanes defined for other track names; kept for diagnostics. */
  unavailableLanes: readonly LaneDef[];
  difficulties: ReadonlyMap<Difficulty, ChartRules>;
  phrases: readonly PhraseDef[];
  eventNotes: readonly EventNoteDef[];
  noteClasses: readonly VocalNoteClass[];
  modifiers: readonly ModifierDef[];
  /** Constraints that are not `status: "todo"`. */
  constraints: readonly Constraint[];
  mechanics:
    | NonNullable<Extract<TrackDefinition, { kind: "guitar" }>["mechanics"]>
    | undefined;
  textEvents: readonly TextEventDef[];
  reserved: readonly PitchRange[];
  unknownPitchPolicy: Severity | undefined;
  ignoredPitches: ReadonlySet<number>;
  /** Pitches that resolve to a configured role on any difficulty. */
  hasDifficulties: boolean;
}

/** UI-facing description of a track; replaces the old config descriptor. */
export interface TrackDescriptor {
  key: string;
  name: string;
  kind: TrackKind;
  visible: boolean;
  editable: boolean;
  rules: TrackRules;
}

export interface CompiledRuleset {
  ruleset: Ruleset;
  tracks: readonly TrackRules[];
  byKey: ReadonlyMap<string, TrackRules>;
  byName: ReadonlyMap<string, TrackRules>;
  settingsSources: readonly SettingsSource[];
  /** `"source.key"` → unit of that setting. */
  settingUnits: ReadonlyMap<string, "ticks" | "seconds" | "none">;
  /** `"source.key"` → declared default. */
  settingDefaults: ReadonlyMap<string, boolean | number | string>;
  playerOptions: ReadonlySet<string>;
  descriptors(): readonly TrackDescriptor[];
}

export { expandPitchSet };

function laneAppliesTo(lane: LaneDef, name: string): boolean {
  return !lane.onlyOnTracks || lane.onlyOnTracks.includes(name);
}

function compileChartRules(
  difficulty: Difficulty,
  block: NonNullable<
    Extract<
      TrackDefinition,
      { difficulties: unknown }
    >["difficulties"][DifficultyName]
  >,
  availableLaneIds: ReadonlySet<string>,
  lanesById: ReadonlyMap<string, LaneDef>,
): ChartRules {
  const notes = new Map<number, NoteRule>();
  const byLane = new Map<string, number>();
  for (const n of block.notes) {
    const lane = lanesById.get(n.lane);
    const available = availableLaneIds.has(n.lane);
    notes.set(n.pitch, {
      pitch: n.pitch,
      laneId: n.lane,
      padType: n.padType,
      enabledWhen: n.enabledWhen,
      whenDisabled: n.whenDisabled,
      laneAvailable: available,
      laneWhenDisabled: lane?.whenDisabled,
    });
    const key = `${n.lane}|${n.padType ?? ""}`;
    // Only unconditional definitions are used when writing new notes.
    if (!n.enabledWhen && !byLane.has(key)) byLane.set(key, n.pitch);
    if (!n.enabledWhen && !n.padType && !byLane.has(`${n.lane}|`)) {
      byLane.set(`${n.lane}|`, n.pitch);
    }
  }
  const markers = new Map<number, MarkerRule>();
  const byEffect = new Map<MarkerEffect, number>();
  for (const m of block.markers ?? []) {
    markers.set(m.pitch, {
      pitch: m.pitch,
      effect: m.effect,
      scope: m.scope ?? "sameTick",
      includesEndTick: m.includesEndTick,
      status: m.status ?? "stable",
    });
    if (!byEffect.has(m.effect)) byEffect.set(m.effect, m.pitch);
  }
  return {
    difficulty,
    name: difficultyName(difficulty),
    notes,
    markers,
    reserved: block.reserved ?? [],
    pitchForLane(laneId, padType) {
      return (
        byLane.get(`${laneId}|${padType ?? ""}`) ??
        (padType === undefined ? undefined : byLane.get(`${laneId}|`))
      );
    },
    pitchForMarker: (effect) => byEffect.get(effect),
  };
}

function compileTrack(def: TrackDefinition, name: string): TrackRules {
  const allLanes: readonly LaneDef[] = "lanes" in def ? def.lanes : [];
  const lanesById = new Map(allLanes.map((l) => [l.id, l]));
  const available = allLanes.filter((l) => laneAppliesTo(l, name));
  const unavailable = allLanes.filter((l) => !laneAppliesTo(l, name));
  const sorted = [...available].sort((a, b) => a.index - b.index);

  let columnRank = 0;
  const lanes: CompiledLane[] = sorted.map((l) => {
    const shape = l.shape ?? "gem";
    const isBar = BAR_SHAPES.has(shape);
    const isColumn = COLUMN_SHAPES.has(shape) || !isBar;
    return { ...l, shape, isBar, column: isColumn ? columnRank++ : -1 };
  });
  const availableIds = new Set(lanes.map((l) => l.id));

  const difficulties = new Map<Difficulty, ChartRules>();
  if ("difficulties" in def) {
    for (const [dName, block] of Object.entries(def.difficulties)) {
      if (!block) continue;
      const d = difficultyFromName(dName as DifficultyName);
      difficulties.set(d, compileChartRules(d, block, availableIds, lanesById));
    }
  }

  const kind = def.kind;
  const visible = kind !== "header";
  const editable = kind !== "header" && kind !== "global";

  return {
    key: toTrackKey(name),
    name,
    kind,
    definitionId: def.id,
    position: def.position,
    required: def.required ?? false,
    visible,
    editable,
    definition: def,
    lanes,
    columns: lanes.filter((l) => !l.isBar),
    bars: lanes.filter((l) => l.isBar),
    unavailableLanes: unavailable,
    difficulties,
    phrases: "phrases" in def ? (def.phrases ?? []) : [],
    eventNotes: def.eventNotes ?? [],
    noteClasses: "noteClasses" in def ? def.noteClasses : [],
    modifiers: "modifiers" in def ? (def.modifiers ?? []) : [],
    constraints: (def.constraints ?? []).filter((c) => c.status !== "todo"),
    mechanics: def.kind === "guitar" ? def.mechanics : undefined,
    textEvents: def.textEvents ?? [],
    reserved: def.reserved ?? [],
    unknownPitchPolicy: def.unknownPitchPolicy,
    ignoredPitches: new Set(def.ignoredPitches ?? []),
    hasDifficulties: difficulties.size > 0,
  };
}

export function compileRuleset(ruleset: Ruleset): CompiledRuleset {
  const tracks: TrackRules[] = [];
  for (const def of ruleset.tracks) {
    for (const name of def.trackNames) tracks.push(compileTrack(def, name));
  }
  const byKey = new Map(tracks.map((t) => [t.key, t]));
  const byName = new Map(tracks.map((t) => [t.name, t]));

  const settingUnits = new Map<string, "ticks" | "seconds" | "none">();
  const settingDefaults = new Map<string, boolean | number | string>();
  for (const s of ruleset.settingsSources ?? []) {
    for (const k of s.keys) {
      settingUnits.set(`${s.id}.${k.name}`, k.unit ?? "none");
      if (k.default !== undefined)
        settingDefaults.set(`${s.id}.${k.name}`, k.default);
    }
  }

  const descriptors: readonly TrackDescriptor[] = tracks.map((rules) => ({
    key: rules.key,
    name: rules.name,
    kind: rules.kind,
    visible: rules.visible,
    editable: rules.editable,
    rules,
  }));

  return {
    ruleset,
    tracks,
    byKey,
    byName,
    settingsSources: ruleset.settingsSources ?? [],
    settingUnits,
    settingDefaults,
    playerOptions: new Set((ruleset.playerOptions ?? []).map((o) => o.id)),
    descriptors: () => descriptors,
  };
}

/**
 * Rules for a MIDI track the ruleset does not describe. The single
 * replacement for the two former `createSyntheticDescriptor` copies. Unmapped
 * tracks are visible and editable but unconstrained: the enforcer applies
 * kernel validation only.
 */
export function createUnmappedTrackRules(
  name: string,
  key: string,
): TrackRules {
  const definition: TrackDefinition = {
    id: "unmapped",
    kind: "global",
    trackNames: [name],
  };
  return {
    key,
    name,
    kind: "global",
    definitionId: "unmapped",
    position: undefined,
    required: false,
    visible: true,
    editable: true,
    definition,
    lanes: [],
    columns: [],
    bars: [],
    unavailableLanes: [],
    difficulties: new Map(),
    phrases: [],
    eventNotes: [],
    noteClasses: [],
    modifiers: [],
    constraints: [],
    mechanics: undefined,
    textEvents: [],
    reserved: [],
    unknownPitchPolicy: undefined,
    ignoredPitches: new Set(),
    hasDifficulties: false,
  };
}

/** True for rules produced by {@link createUnmappedTrackRules}. */
export function isUnmappedTrackRules(rules: TrackRules): boolean {
  return rules.definitionId === "unmapped";
}

export const DefaultCompiledRuleset: CompiledRuleset =
  compileRuleset(DefaultRuleset);
