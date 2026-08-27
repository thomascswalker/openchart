import { z } from "zod";
import defaultConfigData from "../configs/default.json" with { type: "json" };

const TrackViewTypeSchema = z.union([
  z.literal("global"),
  z.literal("animation"),
  z.literal("instrument"),
]);

const BaseTrackViewConfigSchema = z.object({
  name: z.string(),
  type: TrackViewTypeSchema,
  noteCount: z.optional(z.number().int()),
  notes: z.record(z.string(), z.number()),
});
const GlobalViewConfigSchema = BaseTrackViewConfigSchema.extend({
  notes: z.record(z.string(), z.number()),
});

const InstrumentTrackViewConfigSchema = BaseTrackViewConfigSchema.extend({
  offsets: z.object({
    expert: z.number().int(),
    hard: z.number().int(),
    medium: z.number().int(),
    easy: z.number().int(),
  }),
  noteCount: z.number().int(),
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
export type SongViewConfig = z.infer<typeof SongViewConfigSchema>;

export function loadConfig(content: string): SongViewConfig | undefined {
  const data = JSON.parse(content);
  try {
    SongViewConfigSchema.parse(data);
    return data as SongViewConfig;
  } catch (e) {
    console.error(`Failed to parse config: ${e}`);
    return undefined;
  }
}

export const defaultConfig = loadConfig(JSON.stringify(defaultConfigData))!;
