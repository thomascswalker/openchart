import type { Meta, StoryObj } from "@storybook/react-vite";
import { ErrorBoundary } from "..";

const meta = {
  title: "Shared/ErrorBoundary",
  component: ErrorBoundary,
} satisfies Meta<typeof ErrorBoundary>;

export default meta;
type Story = StoryObj<typeof meta>;

export const HealthyContent: Story = {
  args: {
    children: <p>The editor is ready.</p>,
  },
};

export const CaughtError: Story = {
  args: { children: null },
  render: () => {
    const BrokenChild = () => {
      throw new Error("Example rendering error");
    };

    return (
      <ErrorBoundary>
        <BrokenChild />
      </ErrorBoundary>
    );
  },
};
