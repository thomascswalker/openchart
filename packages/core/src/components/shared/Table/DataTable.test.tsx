import { act } from 'react';
import { createRoot } from 'react-dom/client';

import { describe, expect, it } from 'vitest';

import {
  DataTable,
  createAppColumnHelper,
  useCellContext,
  useHeaderContext,
  useTableContext,
} from './DataTable';

interface Item {
  id: string;
  status: string;
}

const columnHelper = createAppColumnHelper<Item>();

function StatusCell() {
  const cell = useCellContext<string>();
  return <span>{cell.getValue()}</span>;
}

function StatusHeader() {
  const header = useHeaderContext();
  const table = useTableContext<Item>();
  return (
    <span>
      {header.column.id}: {table.getRowModel().rows.length}
    </span>
  );
}

const columns = [
  columnHelper.accessor('id', { header: 'ID' }),
  columnHelper.accessor('status', { header: StatusHeader, cell: StatusCell }),
];

describe('DataTable', () => {
  it('provides table, header and cell contexts and updates rendered values', async () => {
    const container = document.createElement('div');
    container.style.height = '300px';
    document.body.append(container);
    const root = createRoot(container);

    try {
      await act(async () => {
        root.render(
          <DataTable
            id="items"
            columnDefs={columns}
            data={[
              { id: '1', status: 'Pending' },
              { id: '2', status: 'Completed' },
            ]}
          />,
        );
      });

      await expect.poll(() => container.textContent).toContain('Pending');
      expect(container.textContent).toContain('Completed');
      expect(container.textContent).toContain('status: 2');
      expect(container.querySelectorAll('tbody tr')).toHaveLength(2);

      await act(async () => {
        root.render(
          <DataTable
            id="items"
            columnDefs={columns}
            data={[{ id: '1', status: 'In Progress' }]}
          />,
        );
      });

      await expect.poll(() => container.textContent).toContain('In Progress');
      expect(container.textContent).not.toContain('Completed');
      expect(container.textContent).toContain('status: 1');
    } finally {
      await act(async () => root.unmount());
      container.remove();
    }
  });
});
