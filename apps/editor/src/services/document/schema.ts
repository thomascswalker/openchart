import z from "zod";

const songSchema = z.object({
  name: z.string(),
  artist: z.string(),
  album: z.string(),
  genre: z.string(),
  year: z.number().int(),
  albumTrack: z.optional(z.number().int().min(1).default(1)),
  cover: z.optional(z.boolean().default(false)),
  coverArtist: z.optional(z.string()),
  vocalGender: z.optional(z.string()),
});

const chartSchema = z.object({
  author: z.string(),
  previewStart: z.number().min(0),
  previewEnd: z.number().min(0),
});

const difficultySchema = z.object({
  band: z.number().int(),
  lead: z.number().int(),
  bass: z.number().int(),
  drums: z.number().int(),
  vocals: z.number().int(),
  fourPad: z.number().int(),
  fivePad: z.number().int(),
});
const audioSchema = z.object({
  song: z.optional(z.string()),
  leadGuitar: z.optional(z.string()),
  bassGuitar: z.optional(z.string()),
  drums: z.optional(z.string()),
  proDrums: z.optional(z.string()),
  vocals: z.optional(z.string()),
  harmony: z.optional(z.string()),
});
const creditsSchema = z.object({
  publisher: z.string(),
  writer: z.string(),
});

export const metadataSchema = z.object({
  version: z.number().int(),
  id: z.string(),
  song: songSchema,
  chart: z.optional(chartSchema),
  difficulty: z.optional(difficultySchema),
  audio: z.optional(audioSchema),
  credits: z.optional(creditsSchema),
});

export type Metadata = z.infer<typeof metadataSchema>;

export interface MetadataValidationIssue {
  path: string;
  message: string;
}

export const makeDefaultMetadata = (): Metadata => {
  return {
    version: 1,
    id: crypto.randomUUID(),
    song: {
      name: "",
      artist: "",
      album: "",
      genre: "",
      year: 2026,
    },
  };
};
