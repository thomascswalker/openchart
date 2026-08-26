import * as fs from "fs";
import path from "path";
import { z } from 'zod';

const DEFAULT_CONFIG = '../configs/default.json';

const TrackTypeSchema = z.union([
    z.literal("meta"),
    z.literal("instrument")
]);

const TrackConfigSchema = z.object({
    names: z.array(z.string()),
    type: TrackTypeSchema,
    notes: z.record(z.string(), z.number()),
});

const SongViewConfigSchema = z.object({
    name: z.string(),
    ppqn: z.number(),
    tracks: z.array(TrackConfigSchema),
});

export type SongViewConfig = z.infer<typeof SongViewConfigSchema>;

export function loadConfig(content: string): SongViewConfig | undefined {
    const data = JSON.parse(content);
    try {
        SongViewConfigSchema.parse(data);
        return data as SongViewConfig;
    } catch (e) {
        console.error(`Failed to parse config: ${e}`)
        return undefined;
    }
}

export function loadConfigFromFile(filename: string = DEFAULT_CONFIG): SongViewConfig | undefined {
    const fullPath = path.resolve(filename);
    const content = fs.readFileSync(fullPath, 'utf-8');
    return loadConfig(content);

}