import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { CursorIcon } from "../Icon/Icon";
import { Button } from "./Button";
import { CloseButton } from "./Button";

const meta = {
  title: "Shared/Buttons",
  component: Button,
  args: {
    children: "Button",
  },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

const ButtonVariantsView = () => {
  const [checked, setChecked] = useState(true);
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "start",
        gap: 32,
      }}
    >
      <Button>Normal</Button>
      <Button disabled>Disabled</Button>
      <Button flat>Flat</Button>
      <Button checked={checked} onChecked={(state) => setChecked(state)}>
        External checkable
      </Button>
      <Button checkable defaultChecked>
        Internal checkable
      </Button>
      <CloseButton aria-label="Close example" />
      <Button icon={<CursorIcon size={24} />} aria-label="Cursor tool" />
      <Button icon={<CursorIcon size={24} />} aria-label="Cursor tool">
        Cursor
      </Button>
    </div>
  );
};

export const Default: Story = {};

export const Checked: Story = {
  args: { checkable: true, defaultChecked: true, children: "Checked" },
};

export const Disabled: Story = {
  args: { disabled: true, children: "Disabled" },
};

export const Variants: Story = {
  render: () => <ButtonVariantsView />,
};
