import type { Meta, StoryObj } from "@storybook/react-vite";
import Tabs, { type TabsProps } from "./Tab";
import { Button } from "../Button";
import { HorizontalSeparator } from "../Separator";

const meta = {
  title: "Shared/Tabs",
  component: Tabs,
} satisfies Meta<typeof Tabs>;

export default meta;
type Story = StoryObj<typeof meta>;

const options = ["Tab1", "Tab2", "Tab3"].map((title) => ({
  title,
  icon: title,
}));
const children = [
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
];

export const Default: Story = {
  args: {
    options,
    children,
  },
};

const AlignmentView = ({ options, children }: TabsProps) => {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      Left
      <Tabs options={options} alignment="left">
        {children}
      </Tabs>
      <HorizontalSeparator />
      Right
      <Tabs options={options} alignment="right">
        {children}
      </Tabs>
      <HorizontalSeparator />
      Bottom
      <Tabs options={options} alignment="bottom">
        {children}
      </Tabs>
    </div>
  );
};

export const Alignment: Story = {
  render: (args) => <AlignmentView {...args} />,
  args: {
    options,
    children,
  },
};
