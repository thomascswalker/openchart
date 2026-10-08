import type { Meta, StoryObj } from "@storybook/react-vite";
import { HorizontalSeparator, VerticalSeparator } from "../Separator/Separator";
import { Section } from "../Section/Section";

const meta = {
  title: "Shared/Layout",
  component: Section,
} satisfies Meta<typeof Section>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Sections: Story = {
  render: () => (
    <div style={{ display: "grid", gap: 16, maxWidth: 560 }}>
      <Section
        flexDirection="column"
        gap="8px"
        padding="16px"
        border="1px solid var(--neutral-60)"
      >
        <strong>Vertical section</strong>
        <span>Sections group content into a flexible layout.</span>
      </Section>
      <Section
        flexDirection="row"
        alignItems="center"
        gap="12px"
        padding="16px"
        border="1px solid var(--neutral-60)"
      >
        <span>Left content</span>
        <VerticalSeparator />
        <span>Right content</span>
      </Section>
    </div>
  ),
};

export const Separators: Story = {
  render: () => (
    <div style={{ display: "grid", gap: 16, width: 360 }}>
      <span>Content above</span>
      <HorizontalSeparator />
      <span>Content below</span>
    </div>
  ),
};
