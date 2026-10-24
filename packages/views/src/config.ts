import { z } from "zod";
import defaultConfigData from "../configs/default.json" with { type: "json" };
import type { Difficulty } from "./chartView.js";

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
  noteCount: z.optional(z.number().int()),
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
  range: z.object({
    low: z.number().int().min(0).max(127),
    high: z.number().int().min(0).max(127),
  }),
  /** `notes` key of the pitch that new pitchless notes are written to. */
  pitchlessPlacement: z
    .union([z.literal("pitchlessHigh"), z.literal("pitchlessLow")])
    .default("pitchlessHigh"),
});

const InstrumentTrackViewConfigSchema = BaseTrackViewConfigSchema.extend({
  type: z.literal("instrument"),
  /** False for instruments without Easy/Medium/Hard/Expert charts (vocals). */
  hasDifficulties: z.boolean().optional(),
  vocals: VocalTrackConfigSchema.optional(),
  offsets: z.optional(
    z.object({
      expert: z.number().int().default(96),
      hard: z.number().int().default(84),
      medium: z.number().int().default(72),
      easy: z.number().int().default(60),
    }),
  ),
  noteCount: z.number().int().default(5),
  notes: z.record(z.string(), z.number()),
});
const TrackViewConfigSchema = z.union([
  GlobalViewConfigSchema,
  InstrumentTrackViewConfigSchema,
]);
const SongViewConfigSchema = z.object({
  name: z.string(),
  ppqn: z.number(),
  tracks: z.array(TrackViewConfigSchema),
});

export type GlobalTrackViewConfig = z.infer<typeof GlobalViewConfigSchema>;
export type InstrumentTrackViewConfig = z.infer<
  typeof InstrumentTrackViewConfigSchema
>;
export type TrackViewConfig = z.infer<typeof TrackViewConfigSchema>;
export type VocalTrackConfig = z.infer<typeof VocalTrackConfigSchema>;
export type SongViewConfig = z.infer<typeof SongViewConfigSchema>;

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

/** True when a configured instrument has Easy-Expert difficulty charts. */
export function hasDifficulties(config: TrackViewConfig): boolean {
  return config.type !== "instrument"
    ? false
    : (config as InstrumentTrackViewConfig).hasDifficulties !== false;
}

/** True when the configured track uses the vocal data model. */
export function isVocalTrackConfig(
  config: TrackViewConfig,
): config is InstrumentTrackViewConfig & { vocals: VocalTrackConfig } {
  return (
    config.type === "instrument" &&
    (config as InstrumentTrackViewConfig).vocals !== undefined
  );
}

export function loadConfig(content: string): SongViewConfig | undefined {
  const data = JSON.parse(content);
  try {
    return SongViewConfigSchema.parse(data) as SongViewConfig;
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

/** True when the named instrument can only be edited in the Piano Roll. */
export function requiresPianoRoll(
  nameOrKey: string,
  config: SongViewConfig = defaultConfig,
): boolean {
  const track = findTrackConfig(nameOrKey, config);
  return track !== undefined && track.type === "instrument"
    ? !hasDifficulties(track)
    : false;
}
