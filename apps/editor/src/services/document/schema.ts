import z from "zod";
import { DefaultRuleset, type Ruleset } from "@openchart/views";
import { WavFilePickerTypes } from "../mixer/types";

const MetadataSettingsVersion = 1;

const songSchema = z.object({
  name: z.string(),
  artist: z.string(),
  album: z.string(),
  genre: z.string(),
  year: z.number().int(),
  albumTrack: z.number().int().min(1),
  cover: z.boolean(),
  coverArtist: z.string(),
  vocalGender: z.string(),
});

const chartSchema = z.object({
  author: z.string(),
  previewStart: z.number().min(0),
  previewEnd: z.number().min(0),
});

/** Track kinds that get a difficulty rating in the project settings. */
const PLAYABLE_KINDS = new Set(["guitar", "drums", "vocals", "gamepad"]);

/** `"LEAD GUITAR"` -> `"leadGuitar"`. */
export function metadataKeyForTrack(name: string): string {
  const words = name
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  return words
    .map((word, i) => (i === 0 ? word : word[0]!.toUpperCase() + word.slice(1)))
    .join("");
}

/** Difficulty keys the ruleset defines: one per playable track name. */
export function difficultyKeys(ruleset: Ruleset): string[] {
  return ruleset.tracks
    .filter((track) => PLAYABLE_KINDS.has(track.kind))
    .flatMap((track) => track.trackNames.map(metadataKeyForTrack));
}

/**
 * `band` plus one integer per playable ruleset track. Unknown integer keys
 * (e.g. a legacy `bass`) are kept so files round-trip.
 */
function buildDifficultySchema(ruleset: Ruleset) {
  const shape: Record<string, z.ZodType<number>> = {
    band: z.number().int().default(1),
  };
  for (const key of difficultyKeys(ruleset)) {
    shape[key] = z.number().int().default(1);
  }
  return z.object(shape).catchall(z.number().int());
}

type SettingValue = boolean | number | string;

function settingSchema(key: {
  type: "boolean" | "integer" | "number" | "string";
  allowedValues?: SettingValue[] | undefined;
  default?: SettingValue | undefined;
}): z.ZodType<SettingValue> {
  let base: z.ZodType<SettingValue>;
  if (key.allowedValues && key.allowedValues.length > 0) {
    const literals = key.allowedValues.map((value) => z.literal(value));
    base =
      literals.length === 1
        ? literals[0]!
        : z.union(
            literals as unknown as [
              z.ZodType<SettingValue>,
              z.ZodType<SettingValue>,
              ...z.ZodType<SettingValue>[],
            ],
          );
  } else {
    base =
      key.type === "boolean"
        ? z.boolean()
        : key.type === "integer"
          ? z.number().int()
          : key.type === "number"
            ? z.number()
            : z.string();
  }
  return key.default === undefined
    ? base
    : (base.default(key.default) as unknown as z.ZodType<SettingValue>);
}

/**
 * One field per key of every `settingsSources` entry stored in `info.json`.
 * Flat by key name (`HopoThreshold`); every field has a default so projects
 * saved before the section existed still parse.
 */
function buildSettingsSchema(ruleset: Ruleset) {
  const shape: Record<string, z.ZodType<SettingValue>> = {};
  for (const source of ruleset.settingsSources ?? []) {
    if (source.file !== "info.json") continue;
    for (const key of source.keys) shape[key.name] = settingSchema(key);
  }
  return z.object(shape);
}

const wavRefiner = (val: string | null) => {
  if (!val) {
    return true;
  }
  return /\.wav$/i.test(val);
};
const zodFile = (types: FilePickerAcceptType[]) =>
  z.string().nullable().refine(wavRefiner).meta({ file: true, types });
const zodDirectory = () =>
  z.string().nullable().default(null).meta({ directory: true, label: "Root" });

const zodWavFile = () => zodFile(WavFilePickerTypes);

const audioSchema = z.object({
  root: zodDirectory(),
  song: zodWavFile(),
  lead: zodWavFile(),
  bass: zodWavFile(),
  drums: zodWavFile(),
  vocals: zodWavFile(),
  harmony: zodWavFile(),
});

const creditsSchema = z.object({
  publisher: z.string(),
  writer: z.string(),
});

export function buildMetadataSchema(ruleset: Ruleset = DefaultRuleset) {
  return z.object({
    version: z
      .literal(MetadataSettingsVersion, {
        error: "Unsupported settings version.",
      })
      .meta({ hidden: true }),
    song: songSchema,
    chart: chartSchema,
    difficulty: buildDifficultySchema(ruleset),
    audio: audioSchema,
    credits: creditsSchema,
    settings: buildSettingsSchema(ruleset),
  });
}

/** Schema for the bundled default ruleset; use `buildMetadataSchema` for others. */
export const MetadataSchema = buildMetadataSchema();

/**
 * Upgrades metadata written by older versions before it is parsed: the legacy
 * `difficulty.lead` becomes `leadGuitar`, and a missing `settings` section is
 * added. Kept outside the schema so it stays a plain object for the Form.
 */
export function normalizeLegacyMetadata(raw: unknown): unknown {
  if (typeof raw !== "object" || raw === null) return raw;
  const next: Record<string, unknown> = { ...(raw as Record<string, unknown>) };
  const difficulty = next.difficulty;
  if (typeof difficulty === "object" && difficulty !== null) {
    const copy = { ...(difficulty as Record<string, unknown>) };
    if ("lead" in copy && !("leadGuitar" in copy)) {
      copy.leadGuitar = copy.lead;
    }
    delete copy.lead;
    next.difficulty = copy;
  }
  next.settings ??= {};
  return next;
}

export type Metadata = z.infer<typeof MetadataSchema>;

export interface MetadataValidationError {
  path: string;
  message: string;
}

export type MetadataValidationErrors = readonly MetadataValidationError[];

export const makeDefaultMetadata = (
  ruleset: Ruleset = DefaultRuleset,
): Metadata => {
  return {
    version: MetadataSettingsVersion,
    song: {
      name: "",
      artist: "",
      album: "",
      genre: "",
      year: 2026,
      albumTrack: 1,
      cover: false,
      coverArtist: "",
      vocalGender: "",
    },
    chart: {
      author: "",
      previewStart: 0,
      previewEnd: 0,
    },
    difficulty: Object.fromEntries([
      ["band", 1],
      ...difficultyKeys(ruleset).map((key) => [key, 1]),
    ]) as Metadata["difficulty"],
    audio: {
      root: null,
      song: null,
      lead: null,
      bass: null,
      drums: null,
      vocals: null,
      harmony: null,
    },
    credits: {
      publisher: "",
      writer: "",
    },
    settings: Object.fromEntries(
      (ruleset.settingsSources ?? [])
        .filter((source) => source.file === "info.json")
        .flatMap((source) => source.keys)
        .filter((key) => key.default !== undefined)
        .map((key) => [key.name, key.default]),
    ) as Metadata["settings"],
  };
};
