export type Instrument =
  | "LEAD GUITAR"
  | "RHYTHM GUITAR"
  | "FOUR PAD"
  | "FIVE PAD"
  | "BASS"
  | "DRUMS"
  | "VOCALS"
  | "HARMONIES"
  | "SYNTH"
  | "OTHER";

export enum InstrumentType {
  Lead = "LEAD GUITAR",
  Groove = "RHYTHM GUITAR",
  FourPad = "FOUR PAD",
  FivePad = "FIVE PAD",
  Bass = "BASS",
  Drums = "DRUMS",
  Vocals = "VOCALS",
  Harmonies = "HARMONIES",
  Synth = "SYNTH",
  Other = "OTHER",
}

export enum Difficulty {
  Easy,
  Medium,
  Hard,
  Expert,
}
