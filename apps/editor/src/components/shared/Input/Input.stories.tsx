import type { Meta, StoryObj } from "@storybook/react-vite";
import { Input } from "./Input";

const meta = {
  title: "Shared/Input",
  component: Input,
  args: {
    placeholder: "Enter text",
  },
} satisfies Meta<typeof Input>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Enabled: Story = {
  args: { disabled: false },
};

export const Disabled: Story = {
  args: { disabled: true },
};
