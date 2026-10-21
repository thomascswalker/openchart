import Table from "./Table";
import { tableFeatures, useTable } from "@tanstack/react-table";
import type { ColumnDef, TableFeatures } from "@tanstack/react-table";

const Features = tableFeatures({});

type DataType = Record<string, any>;

interface DataTableProps {
  data: DataType[];
  columns: Array<ColumnDef<TableFeatures, DataType>>;
  features?: TableFeatures;
}

const DataTable = ({ data, columns, features = Features }: DataTableProps) => {
  const table = useTable({
    features,
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
        {table.getRowModel().rows.map((row) => (
          <Table.Row key={row.id}>
            {row.getAllCells().map((cell) => (
              <Table.Cell key={cell.id}>
                <table.FlexRender cell={cell} />
              </Table.Cell>
            ))}
          </Table.Row>
        ))}
      </Table.Body>
    </Table>
  );
};
export default DataTable;
