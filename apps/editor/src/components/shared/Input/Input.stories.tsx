import type { Meta, StoryObj } from "@storybook/react-vite";
import { FileInput, Input } from "..";

const meta = {
  title: "Shared/Input",
  component: Input,
} satisfies Meta<typeof Input>;

export default meta;
type Story = StoryObj<typeof meta>;

const InputVariantsView = () => {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "start",
        gap: 32,
      }}
    >
      <Input />
      <FileInput />
    </div>
  );
};

export const Enabled: Story = {
  args: { disabled: false },
};

export const Disabled: Story = {
  args: { disabled: true },
};

export const Variants: Story = {
  render: () => <InputVariantsView />,
};
