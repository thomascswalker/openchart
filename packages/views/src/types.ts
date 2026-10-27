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

export type Instrument = keyof typeof InstrumentType;

export enum Difficulty {
  Easy,
  Medium,
  Hard,
  Expert,
}

export enum Note {
  Green = 0x0,
  Red = 0x1,
  Yellow = 0x2,
  Blue = 0x3,
  Orange = 0x4,
}
