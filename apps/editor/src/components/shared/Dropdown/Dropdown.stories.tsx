import type { Meta, StoryObj } from "@storybook/react-vite";

import { Dropdown, type Option } from "./Dropdown";

const meta = {
  title: "components/Dropdown",
  component: Dropdown,
  tags: ["autodocs"],
} satisfies Meta<typeof Dropdown>;

export default meta;
type Story = StoryObj<typeof meta>;

const options: Option[] = [
  { label: "opt1" },
  { label: "opt2" },
  { label: "opt3" },
];

export const Primary: Story = {
  args: {
    options,
  },
};
