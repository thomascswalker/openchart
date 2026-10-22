import { forwardRef, type ReactNode } from "react";
import Box from "../Box";
import styles from "./Table.module.css";
import classNames from "classnames";

interface CellProps {
  children?: ReactNode;
}

const Cell = ({ children }: CellProps) => {
  return <td className={styles["ui-table-cell"]}>{children}</td>;
};

interface RowProps {
  children?: ReactNode;
  ref?: (element: HTMLTableRowElement | null) => void;
  "data-index"?: number;
}

const Row = ({ children, ref, "data-index": dataIndex }: RowProps) => {
  return (
    <tr ref={ref} data-index={dataIndex}>
      {children}
    </tr>
  );
};

interface HeaderCellProps {
  children?: ReactNode;
}

const HeaderCell = ({ children }: HeaderCellProps) => {
  const headerClassName = classNames(
    styles["ui-table-cell"],
    styles["ui-table-header-cell"],
  );
  return <th className={headerClassName}>{children}</th>;
};

interface HeaderProps {
  children?: ReactNode;
}

const Head = ({ children }: HeaderProps) => <thead>{children}</thead>;

interface BodyProps {
  children?: ReactNode;
}

const Body = ({ children }: BodyProps) => <tbody>{children}</tbody>;

interface TableProps {
  children?: ReactNode;
}

const Table = forwardRef<HTMLDivElement, TableProps>(({ children }, ref) => {
  return (
    <Box ref={ref} className={styles["ui-table-container"]}>
      <table className={styles["ui-table"]}>{children}</table>
    </Box>
  );
});

const _Table = Object.assign(Table, {
  Head,
  HeaderCell,
  Row,
  Cell,
  Body,
});

export default _Table;
