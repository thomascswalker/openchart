import type { ComponentType } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Text, type IconProps } from "..";
import * as allIcons from "..";

const { Icon, ...moduleIcons } = allIcons;

const icons: Array<{
  name: string;
  Icon: ComponentType<Omit<IconProps, "svg">>;
}> = Object.entries(moduleIcons).map(([name, component]) => ({
  name: name.substring(0, name.indexOf("Icon")),
  Icon: component as React.ComponentType<any>,
}));

const meta = {
  title: "Shared/Icons",
  component: Icon,
  parameters: {
    controls: {},
  },
  argTypes: {
    size: {
      control: { type: "inline-radio" },
      options: [16, 24, 32, 48],
    },
  },
} satisfies Meta<typeof Icon>;

export default meta;
type Story = StoryObj<{ size: number }>;

export const Gallery: Story = {
  render: (args) => (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
        gap: 16,
      }}
    >
      {icons.map(({ name, Icon }) => (
        <div
          key={name}
          style={{
            display: "grid",
            justifyItems: "center",
            gap: 8,
            padding: 16,
            border: "1px solid var(--neutral-60)",
          }}
        >
          {/* Forwards the active radio value to the icon */}
          <Icon size={args.size} />
          <Text>{name}</Text>
        </div>
      ))}
    </div>
  ),
  args: { size: 24 },
};
