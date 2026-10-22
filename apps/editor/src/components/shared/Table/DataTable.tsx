import Table from "./Table";
import {
  tableFeatures,
  createTableHook,
  columnVisibilityFeature,
} from "@tanstack/react-table";
import type { RowData } from "@tanstack/react-table";
import { useMemo, useRef } from "react";
import { Text } from "../../shared/Text";
import { vars } from "../../../util/css";
import { useVirtualizer } from "@tanstack/react-virtual";

const Features = tableFeatures({
  columnVisibilityFeature,
});

const { createAppColumnHelper, useAppTable } = createTableHook({
  features: Features,
  getRowId: (row) => row.id,
  cellComponents: {
    "Table.Cell": Table.Cell,
    "Table.HeaderCell": Table.HeaderCell,
    "Table.Row": Table.Row,
    "Table.Head": Table.Head,
    "Table.Body": Table.Body,
  },
});
export type AppColumnDef<TData extends RowData> = Parameters<
  ReturnType<typeof createAppColumnHelper<TData>>["columns"]
>[0][number];

type DataType = Record<string, any>;

interface DataTableProps {
  key: string;
  data: DataType[];
  columnDefs?: AppColumnDef<DataType>[];
}

const DataTable = ({ key, data, columnDefs }: DataTableProps) => {
  const tableContainerRef = useRef<HTMLDivElement>(null);

  const columnHelper = createAppColumnHelper<DataType>();
  const columns = useMemo(
    () => columnHelper.columns(columnDefs ?? []),
    [data, columnDefs],
  );
  const table = useAppTable({
    key,
    columns,
    data,
  });

  const { rows } = table.getRowModel();
  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => tableContainerRef.current,
    estimateSize: () => 30,
    overscan: 10,
  });

  const virtualRows = rowVirtualizer.getVirtualItems();
  const totalSize = rowVirtualizer.getTotalSize();

  return (
    <Table ref={tableContainerRef}>
      <Table.Head>
        {table.getHeaderGroups().map((headerGroup) => (
          <Table.Row key={headerGroup.id}>
            {headerGroup.headers.map((header) => (
              <Table.HeaderCell key={header.id}>
                {header.isPlaceholder ? null : (
                  <table.FlexRender header={header} />
                )}
              </Table.HeaderCell>
            ))}
          </Table.Row>
        ))}
      </Table.Head>
      <Table.Body>
        {!totalSize ? (
          <tr>
            <td colSpan={columns.length} style={{ textAlign: "center" }}>
              <Text color={vars("text-disabled")}>No events</Text>
            </td>
          </tr>
        ) : (
          <>
            {virtualRows[0]?.start > 0 && (
              <tr aria-hidden="true">
                <td
                  colSpan={columns.length}
                  style={{
                    height: virtualRows[0].start,
                    padding: 0,
                    border: 0,
                  }}
                />
              </tr>
            )}
            {virtualRows.map((virtualRow) => {
              const row = rows[virtualRow.index];
              return (
                <Table.Row
                  key={row.id}
                  ref={rowVirtualizer.measureElement}
                  data-index={virtualRow.index}
                >
                  {row.getVisibleCells().map((cell) => (
                    <Table.Cell key={cell.id}>
                      <table.FlexRender cell={cell} />
                    </Table.Cell>
                  ))}
                </Table.Row>
              );
            })}
            {virtualRows.length > 0 &&
              totalSize - virtualRows[virtualRows.length - 1].end > 0 && (
                <tr aria-hidden="true">
                  <td
                    colSpan={columns.length}
                    style={{
                      height:
                        totalSize - virtualRows[virtualRows.length - 1].end,
                      padding: 0,
                      border: 0,
                    }}
                  />
                </tr>
              )}
          </>
        )}
      </Table.Body>
    </Table>
  );
};
export default DataTable;
export { createAppColumnHelper };
