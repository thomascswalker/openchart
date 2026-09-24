import { z } from "zod";
import defaultConfigData from "../configs/default.json" with { type: "json" };

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

const InstrumentTrackViewConfigSchema = BaseTrackViewConfigSchema.extend({
  type: z.literal("instrument"),
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
