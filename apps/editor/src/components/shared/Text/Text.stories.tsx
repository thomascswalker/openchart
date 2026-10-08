import type { Meta, StoryObj } from "@storybook/react-vite";
import { Code } from "./Code";
import { Heading } from "./Heading";
import { Text } from "./Text";

const levels = [1, 2, 3, 4, 5, 6] as const;

const meta = {
  title: "Shared/Text",
  component: Text,
  args: {
    children: "The quick brown fox jumps over the lazy dog.",
  },
} satisfies Meta<typeof Text>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Headings: Story = {
  render: () => (
    <div style={{ display: "grid", gap: 12 }}>
      {levels.map((level) => (
        <Heading key={level} level={level}>
          Heading level {level}
        </Heading>
      ))}
    </div>
  ),
};

export const CodeBlock: Story = {
  render: () => (
    <Code>
      const hello = "world";
      <br />
      const foo = "bar";
      <br />
      console.log(hello, foo);
    </Code>
  ),
};

export const InlineCode: Story = {
  render: () => (
    <p>
      Current playback speed: <Code>1.25x</Code>
    </p>
  ),
};
