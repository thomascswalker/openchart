import { type ReactNode, forwardRef } from 'react';

import classNames from 'classnames';

import { Box } from '..';
import styles from './Table.module.css';

export interface CellProps {
  children?: ReactNode;
}

const Cell = ({ children }: CellProps) => {
  return <td className={styles['ui-table-cell']}>{children}</td>;
};

export interface RowProps {
  children?: ReactNode;
  ref?: (element: HTMLTableRowElement | null) => void;
  'data-index'?: number;
}

const Row = ({ children, ref, 'data-index': dataIndex }: RowProps) => {
  return (
    <tr ref={ref} data-index={dataIndex}>
      {children}
    </tr>
  );
};

export interface HeaderCellProps {
  children?: ReactNode;
}

const HeaderCell = ({ children }: HeaderCellProps) => {
  const headerClassName = classNames(
    styles['ui-table-cell'],
    styles['ui-table-header-cell'],
  );
  return <th className={headerClassName}>{children}</th>;
};

export interface HeaderProps {
  children?: ReactNode;
}

const Head = ({ children }: HeaderProps) => <thead>{children}</thead>;

export interface BodyProps {
  children?: ReactNode;
}

const Body = ({ children }: BodyProps) => <tbody>{children}</tbody>;

interface TableProps {
  children?: ReactNode;
}

const Table = forwardRef<HTMLDivElement, TableProps>(({ children }, ref) => {
  return (
    <Box ref={ref} className={styles['ui-table-container']}>
      <table className={styles['ui-table']}>{children}</table>
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

export { _Table as Table };
