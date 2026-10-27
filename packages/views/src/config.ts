import { z } from "zod";
import defaultConfigData from "../configs/default.json" with { type: "json" };
import { Difficulty } from "./types.js";

const NoteRangeSchema = z.object({
  low: z.number().int().min(0).max(127),
  high: z.number().int().min(0).max(127),
});

const ChartViewConfigSchema = z
  .object({
    difficulty: z.enum(Difficulty),
    laneCount: z.number().int().positive().default(5),
    range: NoteRangeSchema,
  })
  .refine(({ laneCount, range }) => laneCount <= range.high - range.low + 1, {
    path: ["laneCount"],
    message: "Lane count must fit within the chart range",
  });

const TrackViewTypeSchema = z.union([
  z.literal("global"),
  z.literal("animation"),
  z.literal("instrument"),
]);

const TrackIdentitySchema = z.object({
  key: z.string().min(1).optional(),
  visible: z.boolean().optional(),
  editable: z.boolean().optional(),
  role: z.string().optional(),
});

const BaseTrackViewConfigSchema = TrackIdentitySchema.extend({
  name: z.string(),
  type: TrackViewTypeSchema,
  notes: z.record(z.string(), z.number()),
});

const GlobalViewConfigSchema = BaseTrackViewConfigSchema.extend({
  type: z.union([z.literal("global"), z.literal("animation")]),
  notes: z.record(z.string(), z.number()),
});

/**
 * Vocal-only settings. Special note pitches (phrases, percussion, pitchless)
 * live in `notes` like every other instrument so `getPhrasePitch` and the
 * MIDI mapping stay config-driven; this block holds the pitched range and the
 * choice of which pitchless pitch the Place tool writes.
 */
const VocalTrackConfigSchema = z.object({
  /** Inclusive pitched-note range. Default C2 (36) to C6 (84), with C4 = 60. */
  range: NoteRangeSchema,
  /** `notes` key of the pitch that new pitchless notes are written to. */
  pitchlessPlacement: z
    .union([z.literal("pitchlessHigh"), z.literal("pitchlessLow")])
    .default("pitchlessHigh"),
});

const InstrumentTrackViewConfigSchema = BaseTrackViewConfigSchema.extend({
  type: z.literal("instrument"),
  charts: z.array(z.union([ChartViewConfigSchema, VocalTrackConfigSchema])),
});

const TrackViewConfigSchema = z.union([
  GlobalViewConfigSchema,
  InstrumentTrackViewConfigSchema,
]);

export const SongViewSchema = z.object({
  name: z.string(),
  ppqn: z.number(),
  tracks: z.array(TrackViewConfigSchema),
});

export type NoteRange = z.infer<typeof NoteRangeSchema>;
export type ChartViewConfig = z.infer<typeof ChartViewConfigSchema>;
export type GlobalTrackViewConfig = z.infer<typeof GlobalViewConfigSchema>;
export type InstrumentTrackViewConfig = z.infer<
  typeof InstrumentTrackViewConfigSchema
>;
export type TrackViewConfig = z.infer<typeof TrackViewConfigSchema>;
export type VocalTrackConfig = z.infer<typeof VocalTrackConfigSchema>;
export type SongViewConfig = z.infer<typeof SongViewSchema>;

export interface TrackDescriptor {
  key: string;
  name: string;
  type: "global" | "animation" | "instrument";
  visible: boolean;
  editable: boolean;
  role?: string;
  config: TrackViewConfig;
}

export function trackKeyForName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function describeTrack(config: TrackViewConfig): TrackDescriptor {
  return {
    key: config.key ?? trackKeyForName(config.name),
    name: config.name,
    type: config.type,
    visible: config.visible ?? config.name !== "CHART HEADER",
    editable: config.editable ?? config.type === "instrument",
    role: config.role,
    config,
  };
}

/** Returns the semantic role declared by a track's configuration. */
export function getTrackRole(descriptor: TrackDescriptor): string | null {
  return descriptor.config.role ?? null;
}

/** Returns the canonical lowercase config key for a chart difficulty. */
export function getDifficultyName(difficulty: Difficulty): string {
  const names = ["easy", "medium", "hard", "expert"] as const;
  const name = names[difficulty];
  if (!name) throw new RangeError(`Unknown chart difficulty '${difficulty}'`);
  return name;
}

/** Resolves a difficulty-specific note pitch, or null when it is unconfigured. */
export function getDifficultyNotePitch(
  descriptor: TrackDescriptor,
  difficulty: Difficulty,
  suffix: string,
): number | null {
  if (
    descriptor.config.type !== "instrument" ||
    !hasDifficulties(descriptor.config)
  ) {
    return null;
  }
  const pitch =
    descriptor.config.notes[`${getDifficultyName(difficulty)}${suffix}`];
  return Number.isInteger(pitch) && pitch >= 0 && pitch <= 127 ? pitch : null;
}

/** Returns the configured chart for a difficulty, if the track has one. */
export function getChartViewConfig(
  config: TrackViewConfig,
  difficulty: Difficulty,
): ChartViewConfig | undefined {
  if (config.type !== "instrument") return undefined;
  return config.charts.find(
    (chart): chart is ChartViewConfig =>
      "difficulty" in chart && chart.difficulty === difficulty,
  );
}

/** Returns the vocal-specific settings configured for an instrument. */
export function getVocalTrackConfig(
  config: TrackViewConfig,
): VocalTrackConfig | undefined {
  if (config.type !== "instrument") return undefined;
  return config.charts.find(
    (chart): chart is VocalTrackConfig => !("difficulty" in chart),
  );
}

/** True when a configured instrument has Easy-Expert difficulty charts. */
export function hasDifficulties(config: TrackViewConfig): boolean {
  return (
    config.type === "instrument" &&
    config.charts.some((chart) => "difficulty" in chart)
  );
}

/** True when the configured track uses the vocal data model. */
export function isVocalTrackConfig(
  config: TrackViewConfig,
): config is InstrumentTrackViewConfig {
  return getVocalTrackConfig(config) !== undefined;
}

export function loadConfig(content: string): SongViewConfig | undefined {
  const data = JSON.parse(content);
  try {
    return SongViewSchema.parse(data);
  } catch (e) {
    console.error(`Failed to parse config: ${e}`);
    return undefined;
  }
}

export const defaultConfig = loadConfig(JSON.stringify(defaultConfigData))!;

/**
 * Looks up a configured track by display name or key. Used by services that
 * only know the viewport's instrument string (e.g. to force the Piano Roll for
 * instruments without difficulties).
 */
export function findTrackConfig(
  nameOrKey: string,
  config: SongViewConfig = defaultConfig,
): TrackViewConfig | undefined {
  return config.tracks.find(
    (track) =>
      track.name === nameOrKey || describeTrack(track).key === nameOrKey,
  );
}
