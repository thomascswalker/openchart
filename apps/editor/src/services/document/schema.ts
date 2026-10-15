import z from "zod";
import { wavFilePickerTypes } from "../mixer/types";

const METADATA_SETTINGS_VERSION = 1;

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

const difficultySchema = z.object({
  band: z.number().int(),
  lead: z.number().int(),
  bass: z.number().int(),
  drums: z.number().int(),
  vocals: z.number().int(),
  fourPad: z.number().int(),
  fivePad: z.number().int(),
});

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

const zodWavFile = () => zodFile(wavFilePickerTypes);

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

export const metadataSchema = z.object({
  version: z
    .literal(METADATA_SETTINGS_VERSION, {
      error: "Unsupported settings version.",
    })
    .meta({ hidden: true }),
  song: songSchema,
  chart: chartSchema,
  difficulty: difficultySchema,
  audio: audioSchema,
  credits: creditsSchema,
});

export type Metadata = z.infer<typeof metadataSchema>;

export interface MetadataValidationError {
  path: string;
  message: string;
}

export type MetadataValidationErrors = readonly MetadataValidationError[];

export const makeDefaultMetadata = (): Metadata => {
  return {
    version: METADATA_SETTINGS_VERSION,
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
    difficulty: {
      band: 1,
      lead: 1,
      bass: 1,
      drums: 1,
      vocals: 1,
      fourPad: 1,
      fivePad: 1,
    },
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
  };
};
