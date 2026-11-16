import type { Meta, StoryObj } from '@storybook/react-vite';

import { DataTable, createAppColumnHelper } from '..';

const meta = {
  title: 'Shared/DataTable',
  component: DataTable,
} satisfies Meta<typeof DataTable>;

export default meta;
type Story = StoryObj<typeof meta>;

interface RowData {
  name: string;
  status: string;
  value: string;
}

const columnHelper = createAppColumnHelper<RowData>();
const columnDefs = [
  columnHelper.accessor('name', { header: 'Name' }),
  columnHelper.accessor('status', { header: 'Status' }),
  columnHelper.accessor('value', { header: 'Value' }),
];

export const Default: Story = {
  args: {
    id: 'data-table',
    columnDefs,
    data: [
      { name: 'Project', status: 'Ready', value: 'OpenChart' },
      { name: 'Changes', status: 'Modified', value: '4 files' },
      { name: 'Version', status: 'Current', value: '1.0.0' },
    ],
  },
};
