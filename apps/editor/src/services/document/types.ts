export const midiFilePickerTypes: FilePickerAcceptType[] = [
  {
    description: "MIDI file",
    accept: { "audio/midi": [".mid", ".midi"] },
  },
];

export const projectFilePickerTypes: FilePickerAcceptType[] = [
  {
    description: "OpenChart project metadata",
    accept: { "application/json": [".json"] },
  },
];
