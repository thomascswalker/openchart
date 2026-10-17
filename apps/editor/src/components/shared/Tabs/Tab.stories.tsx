import type { Meta, StoryObj } from "@storybook/react-vite";
import Tabs from "./Tab";
import { Button } from "../Button";

const meta = {
  title: "Shared/Tabs",
  component: Tabs,
} satisfies Meta<typeof Tabs>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    options: ["Tab1", "Tab2", "Tab3"],
    children: [
      <>
        <Button>Test 1</Button>
        <Button>Test 2</Button>
        <Button>Test 3</Button>
      </>,
      <>
        <Button>Test 4</Button>
        <Button>Test 5</Button>
        <Button>Test 6</Button>
      </>,
      <>
        <Button>Test 7</Button>
        <Button>Test 8</Button>
        <Button>Test 9</Button>
      </>,
    ],
  },
};
