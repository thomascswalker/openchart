import {
  ChannelMessage,
  MetaType,
  Midi,
  addRandomChannelEvents,
  addRandomMetaEvents,
  getStatusString,
  type MidiChannelEvent,
  type MidiMetaEvent,
} from "@openchart/midi";
import type { Meta, StoryObj } from "@storybook/react-vite";
import DataTable, { createAppColumnHelper } from "../DataTable";

const meta = {
  title: "Shared/DataTable",
  component: DataTable,
} satisfies Meta<typeof DataTable>;

export default meta;
type Story = StoryObj<typeof meta>;

const midiChannelEvent: MidiChannelEvent = {
  deltaTime: 0,
  status: 0,
  channel: 0,
  messageType: ChannelMessage.NoteOn,
  data1: 0,
  data2: 0,
};
type MidiChannelEventHeader = (keyof MidiChannelEvent & { tick?: string })[];

const midiMetaEvent: MidiMetaEvent & { bytes: Uint8Array } = {
  deltaTime: 0,
  status: 0xff,
  type: MetaType.SequenceNumber,
  length: 0,
  bytes: new Uint8Array([0]),
};
type MidiMetaEventHeader = (keyof MidiMetaEvent | "bytes" | "tick")[];

const makeTrack = () => {
  const midi = new Midi();
  return midi.tracks[midi.addTrack()];
};

const makeChannelEvents = (
  headers: MidiChannelEventHeader,
  rowCount: number,
) => {
  const track = makeTrack();
  addRandomChannelEvents(track, rowCount);

  return track.getTimedEvents().map((event) => {
    const { tick } = event;
    const row: Record<string, string> = { tick: String(tick) };
    headers.forEach((header) => {
      row[header] = String(event[header as keyof typeof event] ?? "");
    });
    return row;
  });
};

const makeMetaEvents = (headers: MidiMetaEventHeader, rowCount: number) => {
  const track = makeTrack();
  addRandomMetaEvents(track, rowCount);

  return track.getTimedEvents().map((event) => {
    const { tick } = event;
    const row: Record<string, string> = { tick: String(tick) };
    headers.forEach((header) => {
      const value =
        header === "bytes" && "text" in event
          ? event.text
          : header === "bytes" && "bytes" in event
            ? String(event.bytes)
            : event[header as keyof typeof event];
      row[header] = String(value);
    });
    return row;
  });
};

const columnHelper = createAppColumnHelper();
const columnNames = Object.keys(midiChannelEvent) as (keyof MidiChannelEvent)[];

const channelEventColumnDefs = [
  columnHelper.accessor("tick" as "deltaTime", {
    header: "Tick",
    cell: ({ cell }) => String(cell.getValue()),
  }),
  columnHelper.accessor("deltaTime", {
    header: "Delta Time",
    cell: ({ cell }) => String(cell.getValue()),
  }),
  columnHelper.accessor("status", {
    header: "Status",
    cell: ({ cell }) => String(getStatusString(cell.getValue())),
  }),
  columnHelper.accessor("channel", {
    header: "Channel",
    cell: ({ cell }) => String(cell.getValue()),
  }),
  columnHelper.accessor("messageType", {
    header: "Message Type",
    cell: ({ cell }) => ChannelMessage[cell.getValue()],
  }),
  columnHelper.accessor("data1", {
    header: "Data 1",
    cell: ({ cell }) => String(cell.getValue()),
  }),
  columnHelper.accessor("data2", {
    header: "Data 2",
    cell: ({ cell }) => String(cell.getValue()),
  }),
];

const metaColumnNames = Object.keys(
  midiMetaEvent,
) as (keyof typeof midiMetaEvent)[];
const metaColumnDefs = [
  columnHelper.accessor("tick" as "deltaTime", {
    header: "Tick",
    cell: ({ cell }) => String(cell.getValue()),
  }),
  columnHelper.accessor("deltaTime", {
    header: "Delta Time",
    cell: ({ cell }) => String(cell.getValue()),
  }),
  columnHelper.accessor("status", {
    header: "Status",
    cell: ({ cell }) => String(getStatusString(cell.getValue())),
  }),
  columnHelper.accessor("type", {
    header: "Type",
    cell: ({ cell }) => String(MetaType[cell.getValue()]),
  }),
  columnHelper.accessor("length", {
    header: "Length",
    cell: ({ cell }) => String(cell.getValue()),
  }),
  columnHelper.accessor("bytes", {
    header: "Data",
    cell: ({ cell }) => String(cell.getValue()),
  }),
];

export const MidiChannelEvents: Story = {
  args: {
    key: "midi-events",
    columnDefs: channelEventColumnDefs,
    data: makeChannelEvents(columnNames, 25),
  },
};
export const MidiMetaEvents: Story = {
  args: {
    key: "midi-meta-events",
    columnDefs: metaColumnDefs,
    data: makeMetaEvents(metaColumnNames, 5),
  },
};
