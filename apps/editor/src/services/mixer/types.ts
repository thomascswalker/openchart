import { Mixer } from "@openchart/audio";

export const WavFilePickerTypes: FilePickerAcceptType[] = [
  {
    description: "WAV file",
    accept: { "audio/wav": [".wav"] },
  },
];

type MixerInstance = InstanceType<typeof Mixer>;

export interface MixerSnapshot {
  readonly mixer: MixerInstance;
}
