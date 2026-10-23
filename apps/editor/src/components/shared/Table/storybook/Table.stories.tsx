import type { Meta, StoryObj } from "@storybook/react-vite";
import { Table } from "../..";

const meta = {
  title: "Shared/Table",
  component: Table,
} satisfies Meta<typeof Table>;

export default meta;
type Story = StoryObj<typeof meta>;

const getDefaultTable = () => {
  const headers: string[] = ["Header 1", "Header 2"];
  const data: Record<string, string>[] = [
    {
      "Header 1": "Data 1",
      "Header 2": "Data 2",
    },
    {
      "Header 1": "Data 3",
      "Header 2": "Data 4",
    },
    {
      "Header 1": "Data 5",
      "Header 2": "Data 6",
    },
  ];
  return (
    <>
      <Table.Head>
        <Table.Row>
          {headers.map((header) => (
            <Table.HeaderCell key={header}>{header}</Table.HeaderCell>
          ))}
        </Table.Row>
      </Table.Head>
      <Table.Body>
        {data.map((row, rowIndex) => (
          <Table.Row key={rowIndex}>
            {headers.map((header) => (
              <Table.Cell key={header}>{row[header]}</Table.Cell>
            ))}
          </Table.Row>
        ))}
      </Table.Body>
    </>
  );
};
export const Default: Story = {
  args: {
    children: getDefaultTable(),
  },
};
