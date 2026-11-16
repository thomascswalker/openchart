import { Input } from '@openchart/core';
import type { Meta, StoryObj } from '@storybook/react-vite';

import { FileInput } from './FileInput';

const meta = {
  title: 'Editor/FileInput',
  component: FileInput,
} satisfies Meta<typeof FileInput>;

export default meta;
type Story = StoryObj<typeof meta>;

const VariantsView = () => (
  <div
    style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'start',
      gap: 32,
    }}
  >
    <Input />
    <FileInput />
  </div>
);

export const Enabled: Story = {
  args: { disabled: false },
};

export const Disabled: Story = {
  args: { disabled: true },
};

export const Variants: Story = {
  render: () => <VariantsView />,
};
