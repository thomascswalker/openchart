import type { Meta, StoryObj } from "@storybook/react-vite";
import Box from "./Box";
import { Button } from "../Button";

const meta = {
  title: "Shared/Box",
  component: Box,
} satisfies Meta<typeof Box>;

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

export const ItemAlignment: Story = {
  render: ({ children, ...props }) => (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "16px",
      }}
    >
      <Box {...props} border="var(--border-primary)">
        {children}
      </Box>
      <Box {...props} border="var(--border-primary)" alignItems="start">
        {children}
      </Box>
      <Box {...props} border="var(--border-primary)" alignItems="end">
        {children}
      </Box>
    </div>
  ),
  args: {
    children: [
      <Button>Button 1</Button>,
      <Button>Button 2</Button>,
      <Button>Button 3</Button>,
    ],
  },
};
