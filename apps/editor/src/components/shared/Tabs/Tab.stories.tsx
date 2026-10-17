import type { Meta, StoryObj } from "@storybook/react-vite";
import Tab from "./Tab";
import { Button } from "../Button";

const meta = {
  title: "Shared/Tab",
  component: Tab,
} satisfies Meta<typeof Tab>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    children: [
      <Button>Button 1</Button>,
      <Button>Button 2</Button>,
      <Button>Button 3</Button>,
    ],
  },
};
