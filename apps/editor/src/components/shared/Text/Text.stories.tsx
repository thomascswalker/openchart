import type { Meta, StoryObj } from "@storybook/react-vite";
import { Code } from "./Code";
import { CodeBlock } from "./Code";
import { Heading } from "./Heading";
import { Text } from "..";

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

export const _CodeBlock: Story = {
  render: () => {
    const code = `const hello = "world";
const foo = "bar";
console.log(hello, foo);`;
    return (
      <div style={{ gap: "12px", display: "grid" }}>
        <CodeBlock>{code}</CodeBlock>
        <CodeBlock variation="error">{code}</CodeBlock>
      </div>
    );
  },
};

export const InlineCode: Story = {
  render: () => (
    <Text>
      Current playback speed: <Code>1.25x</Code>
    </Text>
  ),
};
