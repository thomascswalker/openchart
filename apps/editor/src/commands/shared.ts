export const midiFilePickerTypes: FilePickerAcceptType[] = [
  {
    description: "MIDI file",
    accept: { "audio/midi": [".mid", ".midi"] },
  },
];

export const projectFilePickerTypes: FilePickerAcceptType[] = [
  {
    description: "MIDI project",
    accept: { "application/zip": [".midproject"] },
  },
];

export const wavFilePickerTypes: FilePickerAcceptType[] = [
  {
    description: "WAV file",
    accept: { "audio/wav": [".wav"] },
  },
];
