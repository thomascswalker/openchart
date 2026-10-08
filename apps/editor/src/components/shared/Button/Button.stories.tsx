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
  const [active, setActive] = useState(false);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <Button active={active} onClick={() => setActive(!active)}>
        Toggle active
      </Button>
      <CloseButton ariaLabel="Close example" onClick={() => setActive(false)} />
      <ToolButton Icon={CursorIcon} ariaLabel="Cursor tool" />
      <ToolButton Icon={CursorIcon} ariaLabel="Cursor tool with text">
        Cursor
      </ToolButton>
    </div>
  );
};

export const Default: Story = {};

export const Active: Story = {
  args: { active: true, children: "Active" },
};

export const Disabled: Story = {
  args: { disabled: true, children: "Disabled" },
};

export const ButtonVariants: Story = {
  render: () => <ButtonVariantsView />,
};
