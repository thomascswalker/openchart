import type { Meta, StoryObj } from "@storybook/react-vite";
import { useEffect } from "react";
import TrackMixer from "./TrackMixer";
import { useService } from "../../platform";
import { MixerService } from "../../services/mixer";
import sampleUrl from "./sample.wav?url";

const meta = {
  title: "Dialogs/Track Mixer",
  component: TrackMixer,
  decorators: [
    (Story) => {
      const mixer = useService<MixerService>("mixer");

      useEffect(() => {
        if (!mixer) {
          throw new Error("Mixer could not be initialized");
        } else {
          mixer.addTrackFromUrl("sample.wav", sampleUrl);
        }
      }, [mixer]);

      return <Story />;
    },
  ],
} satisfies Meta<typeof TrackMixer>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {},
};
