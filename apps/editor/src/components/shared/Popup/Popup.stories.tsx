import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button } from "../Button";
import { Slider } from "../Slider";
import { Popup } from "./Popup";

const meta = {
  title: "Shared/Popup",
  component: Popup,
  parameters: {
    layout: "fullscreen",
  },
} satisfies Meta<typeof Popup>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ViewportSettings: Story = {
  args: {
    trigger: <Button aria-label="Viewport settings">V</Button>,
    title: "Viewport Settings",
    width: 280,
    children: (
      <label className="viewport-panel__scroll-speed">
        Scroll Speed
        <Slider aria-label="Scroll speed" min={0.1} max={2} step={0.1} />
      </label>
    ),
  },
};
