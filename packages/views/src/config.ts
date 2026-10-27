import { z } from "zod";
import defaultConfigData from "../configs/default.json" with { type: "json" };
import { InstrumentType } from "./types.js";

export enum TrackType {
  Global = "global",
  Animation = "animation",
  Instrument = "instrument",
}

const TrackViewTypeSchema = z.enum(TrackType);

const TrackIdentitySchema = z.object({
  key: z.string().min(1),
  visible: z.boolean().default(true).optional(),
  editable: z.boolean().default(true).optional(),
});

const BaseTrackViewConfigSchema = TrackIdentitySchema.extend({
  name: z.string(),
  type: TrackViewTypeSchema,
  noteCount: z.optional(z.number().int()),
  notes: z.record(z.string(), z.number()),

  describe: z.function(),
});
const GlobalViewConfigSchema = BaseTrackViewConfigSchema.extend({
  type: z.union([z.literal(TrackType.Global), z.literal(TrackType.Animation)]),
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
  type: z.literal(TrackType.Instrument).describe("Instrument track type."),
  instrument: z.enum(InstrumentType),
  hasDifficulties: z
    .boolean()
    .optional()
    .describe(
      "False for instruments without Easy/Medium/Hard/Expert charts (vocals).",
    ),
  vocals: VocalTrackConfigSchema.optional().describe(
    "Vocal track configuration.",
  ),
  offsets: z
    .optional(
      z.object({
        expert: z.number().int().default(96),
        hard: z.number().int().default(84),
        medium: z.number().int().default(72),
        easy: z.number().int().default(60),
      }),
    )
    .describe("Difficulty offsets for the instrument."),
  laneCount: z
    .number()
    .int()
    .default(5)
    .describe("Number of lanes for the instrument."),
  noteCount: z
    .number()
    .int()
    .default(5)
    .describe("Number of notes for the instrument."),
  notes: z.record(z.string(), z.number()),
});

const TrackViewConfigSchema = z.union([
  GlobalViewConfigSchema,
  InstrumentTrackViewConfigSchema,
]);

const SongViewConfigSchema = z.object({
  name: z.string().describe("The name of the song."),
  ppqn: z.number().describe("Pulses per quarter note for the song."),
  tracks: z.array(TrackViewConfigSchema).describe("The tracks in the song."),
});

export type GlobalTrackViewConfig = z.infer<typeof GlobalViewConfigSchema>;
export type InstrumentTrackViewConfig = z.infer<
  typeof InstrumentTrackViewConfigSchema
>;
export type TrackViewConfig = z.infer<typeof TrackViewConfigSchema>;
export type VocalTrackConfig = z.infer<typeof VocalTrackConfigSchema>;
export type SongViewConfig = z.infer<typeof SongViewConfigSchema>;

export function loadConfig(content: string): SongViewConfig | undefined {
  const data = JSON.parse(content);
  try {
    const config = SongViewConfigSchema.parse(data) as SongViewConfig;

    return config;
  } catch (e) {
    console.error(`Failed to parse config: ${e}`);
    return undefined;
  }
}

export const DefaultSongConfig = loadConfig(JSON.stringify(defaultConfigData))!;

export const TrackDescriptorSchema = z.object({
  key: z.string(),
  name: z.string(),
  type: z.enum(TrackType),
  visible: z.boolean(),
  editable: z.boolean(),
  config: TrackViewConfigSchema,
});

export type TrackDescriptor = z.infer<typeof TrackDescriptorSchema>;
