import type { Meta, StoryObj } from "@storybook/react-vite";
import { Timeline } from "../Timeline";

const meta = {
  title: "Editor/Timeline",
  component: Timeline,
} satisfies Meta<typeof Timeline>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { chartViews: [] },
};
