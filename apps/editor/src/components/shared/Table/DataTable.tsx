import Table from "./Table";
import { tableFeatures, createTableHook } from "@tanstack/react-table";
import type { ColumnDef, TableFeatures } from "@tanstack/react-table";
import { useMemo } from "react";
import { Text } from "../../shared/Text";
import { vars } from "../../../util/css";

const Features = tableFeatures({});

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

type DataType = Record<string, any>;

interface DataTableProps {
  key: string;
  data: DataType[];
  columnDefs?: ColumnDef<TableFeatures, DataType>[];
}

const DataTable = ({ key, data, columnDefs }: DataTableProps) => {
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

  return (
    <Table>
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
        {data.length === 0 ? (
          <tr>
            <td colSpan={columns.length} style={{ textAlign: "center" }}>
              <Text color={vars("text-disabled")}>No events</Text>
            </td>
          </tr>
        ) : (
          table.getRowModel().rows.map((row) => (
            <Table.Row key={row.id}>
              {row.getAllCells().map((cell) => (
                <Table.Cell key={cell.id}>
                  <table.FlexRender cell={cell} />
                </Table.Cell>
              ))}
            </Table.Row>
          ))
        )}
      </Table.Body>
    </Table>
  );
};
export default DataTable;
export { createAppColumnHelper };
