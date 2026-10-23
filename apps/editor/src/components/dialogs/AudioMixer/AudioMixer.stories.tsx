import type { Meta, StoryObj } from "@storybook/react-vite";
import { useEffect } from "react";
import { AudioMixer } from "./AudioMixer";
import { useService } from "../../../platform";
import { MixerService } from "../../../services/mixer";
import sample1Url from "./sample1.wav?url";
import sample2Url from "./sample2.wav?url";
import sample3Url from "./sample3.wav?url";
import { Section } from "../../shared";

const Wrapper = () => {
  return (
    <Section
      flexShrink={1}
      padding={0}
      borderRadius={4}
      border="1px solid var(--border-color-primary)"
    >
      <AudioMixer />
    </Section>
  );
};

const meta = {
  title: "Dialogs/Track Mixer",
  component: Wrapper,
  decorators: [
    (Story) => {
      const mixer = useService<MixerService>("mixer");

      useEffect(() => {
        if (!mixer) {
          throw new Error("Mixer could not be initialized");
        } else {
          mixer.addTrackFromUrl("sample1", sample1Url);
          mixer.addTrackFromUrl("sample2", sample2Url);
          mixer.addTrackFromUrl("sample3", sample3Url);
        }
      }, [mixer]);

      return <Story />;
    },
  ],
} satisfies Meta<typeof AudioMixer>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {},
};
