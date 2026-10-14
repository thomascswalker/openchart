import z from "zod";

export const metadataSchema = z.object({
  version: z.number().int(),
  id: z.string(),
  song: z.object({
    name: z.string(),
    artist: z.string(),
    album: z.string(),
    genre: z.string(),
    year: z.number().int(),
    albumTrack: z.number().int().min(1),
    cover: z.boolean(),
    coverArtist: z.string(),
    vocalGender: z.string(),
  }),
  chart: z.object({
    author: z.string(),
    previewStart: z.number().min(0),
    previewEnd: z.number().min(0),
  }),
  difficulty: z.object({
    band: z.number().int(),
    leadGuitar: z.number().int(),
    bassGuitar: z.number().int(),
    drums: z.number().int(),
    proDrums: z.number().int(),
    vocals: z.number().int(),
    harmony: z.number().int(),
  }),
  credits: z.object({
    publisher: z.string(),
    writer: z.string(),
  }),
});

export type Metadata = z.infer<typeof metadataSchema>;

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
      albumTrack: 0,
      cover: false,
      coverArtist: "",
      vocalGender: "",
    },
    chart: {
      author: "",
      previewStart: 0,
      previewEnd: 0,
    },
    difficulty: {
      band: 0,
      leadGuitar: 0,
      bassGuitar: 0,
      drums: 0,
      proDrums: 0,
      vocals: 0,
      harmony: 0,
    },
    credits: {
      publisher: "",
      writer: "",
    },
  };
};
