import { useEffect, useState } from 'react';

import {
  BookIcon,
  Button,
  DataTable,
  Dropdown,
  FileIcon,
  ResetIcon,
  Section,
  UploadIcon,
  createAppColumnHelper,
  useCellContext,
} from '@openchart/core';

type Role =
  | 'Lead'
  | 'Rhythm'
  | 'Drums'
  | 'Vocals'
  | 'Lead (Animations)'
  | 'Rhythm (Animations)'
  | 'Drums (Animations)'
  | 'Vocals (Animations)'
  | 'Camera'
  | 'Lighting';
type Status = 'Pending' | 'In Progress' | 'Completed';

interface Assignment {
  role: Role;
  assignedTo: string;
  status: Status;
}

interface Song {
  id: number;
  song: string;
  artist: string;
}

type SongAssignment = Assignment & Song;

const getData = (): SongAssignment[] => [
  {
    id: 1,
    song: 'Song 1',
    artist: 'Artist 1',
    role: 'Lead',
    assignedTo: 'Person 1',
    status: 'Pending',
  },
];

const ColumnHelper = createAppColumnHelper();
const getBaseColumns = () => [
  ColumnHelper.accessor('id', { header: 'ID' }),
  ColumnHelper.accessor('song', { header: 'Song' }),
  ColumnHelper.accessor('artist', { header: 'Artist' }),
  ColumnHelper.accessor('role', { header: 'Role' }),
  ColumnHelper.accessor('assignedTo', { header: 'Assigned To' }),
  ColumnHelper.accessor('status', { header: 'Status', cell: StatusCell }),
  ColumnHelper.accessor('actions', { header: 'Actions', cell: ActionsCell }),
];

const StatusCell = () => {
  const cell = useCellContext<Status>();
  const initialValue = cell.getValue();
  const [value, setValue] = useState(initialValue);

  useEffect(() => {
    setValue(initialValue);
  }, [initialValue]);

  const options = [
    { label: 'Pending', value: 'Pending' },
    { label: 'In Progress', value: 'In Progress' },
    { label: 'Completed', value: 'Completed' },
  ];
  return <Dropdown options={options} value={value} onChange={() => {}} />;
};

const ActionsCell = () => {
  return (
    <Section flexDirection="row" alignItems="center">
      <Button icon={<FileIcon size={16} />} maxWidth={32} />
      <Button icon={<UploadIcon size={16} />} maxWidth={32} />
      <Button icon={<ResetIcon size={16} />} maxWidth={32} />
      <Button icon={<BookIcon size={16} />} maxWidth={32} />
    </Section>
  );
};

const Assignments = () => {
  const data = getData();
  const columnDefs = getBaseColumns();
  return <DataTable id="assignments" data={data} columnDefs={columnDefs} />;
};

export default Assignments;
