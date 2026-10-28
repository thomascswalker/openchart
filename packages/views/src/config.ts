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
  key: z.string().min(1),
  visible: z.boolean().optional(),
  editable: z.boolean().optional(),
  instrument: z.string().optional(),
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

const InstrumentViewConfigSchema = BaseTrackViewConfigSchema.extend({
  type: z.literal("instrument"),
  charts: z.array(z.union([ChartViewConfigSchema, VocalTrackConfigSchema])),
});

const TrackViewConfigSchema = z.union([
  GlobalViewConfigSchema,
  InstrumentViewConfigSchema,
]);

export const SongViewSchema = z.object({
  name: z.string(),
  ppqn: z.number(),
  tracks: z.array(TrackViewConfigSchema),
});

export type NoteRange = z.infer<typeof NoteRangeSchema>;
export type ChartViewConfig = z.infer<typeof ChartViewConfigSchema>;
export type BaseTrackViewConfig = z.infer<typeof BaseTrackViewConfigSchema>;
export type GlobalTrackViewConfig = z.infer<typeof GlobalViewConfigSchema>;
export type InstrumentViewConfig = z.infer<typeof InstrumentViewConfigSchema>;
export type TrackViewConfig = z.infer<typeof TrackViewConfigSchema>;
export type VocalTrackConfig = z.infer<typeof VocalTrackConfigSchema>;
export type SongViewConfig = z.infer<typeof SongViewSchema>;

export function hasDifficulties(config: TrackViewConfig): boolean {
  if ("charts" in config) {
    return config.charts.length > 0;
  }
  return false;
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

export const DefaultConfig = loadConfig(JSON.stringify(defaultConfigData))!;
