import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { CursorIcon } from "../Icon/Icon";
import { Button } from "./Button";
import { CloseButton } from "./CloseButton";
import { ToolButton } from "./ToolButton";

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
        alignItems: "center",
        gap: 32,
      }}
    >
      <Button checked={checked} onChecked={(state) => setChecked(state)}>
        External checkable
      </Button>
      <Button checkable defaultChecked>
        Internal checkable
      </Button>
      <CloseButton
        aria-label="Close example"
        onClick={() => setChecked(false)}
      />
      <ToolButton Icon={CursorIcon} aria-label="Cursor tool" />
      <ToolButton Icon={CursorIcon} aria-label="Cursor tool with text">
        Cursor
      </ToolButton>
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
