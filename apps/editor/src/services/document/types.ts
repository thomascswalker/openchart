export const MidiFilePickerTypes: FilePickerAcceptType[] = [
  {
    description: "MIDI file",
    accept: { "audio/midi": [".mid", ".midi"] },
  },
];

export const ProjectFilePickerTypes: FilePickerAcceptType[] = [
  {
    description: "OpenChart project metadata",
    accept: { "application/json": [".json"] },
  },
];
