import type { Meta, StoryObj } from "@storybook/react-vite";
import { Timeline } from "../Timeline";
import { MockPlaybackService } from "../../../../hooks/usePlayback.mock";

const meta = {
  title: "Editor/Timeline",
  component: Timeline,
} satisfies Meta<typeof Timeline>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { chartViews: [] },
  beforeEach: () => {
    MockPlaybackService.configure({
      playbackTick: 4800,
      totalTimelineTicks: 19200,
    });
  },
};
