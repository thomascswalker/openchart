import {
  ChannelMessage,
  MetaType,
  MidiTrack,
  getStatusString,
  type Midi,
  type MidiChannelEvent,
  type MidiMetaEvent,
  type MidiSysExEvent,
} from "@openchart/core";
import { DataTable } from "../../shared/Table";
import { useEffect, useMemo, useState } from "react";
import Box from "../../shared/Box";
import { Dropdown, type DropdownOption } from "../../shared/Dropdown";
import { createAppColumnHelper } from "../../shared/Table/DataTable";
import { startCase } from "es-toolkit";
import { Label } from "../../shared/Text";
import { Section } from "../../shared/Section";

type EventType = "channel" | "meta" | "sysex";
type Row = Record<string, any>;
type TimedEvent = { event: any; tick: number };

const columnHelper = createAppColumnHelper();
const str = ({ cell }: any) => String(cell.getValue());
const statusCell = ({ cell }: any) => String(getStatusString(cell.getValue()));
const baseColumns = () => [
  columnHelper.accessor("tick" as "deltaTime", { header: "Tick", cell: str }),
  columnHelper.accessor("deltaTime", { header: "Delta Time", cell: str }),
  columnHelper.accessor("status", { header: "Status", cell: statusCell }),
];

interface EventTypeConfig {
  filter: (event: any) => boolean;
  toRow: (item: TimedEvent) => Row;
  columnDefs: any[];
}

const baseRow = ({ event, tick }: TimedEvent): Row => ({
  tick,
  deltaTime: event.deltaTime,
  status: event.status,
});

// Add a new event type here (and to EventType) to make it selectable.
const eventTypeConfigs: Record<EventType, EventTypeConfig> = {
  channel: {
    filter: (event) => event.status < 0xf0,
    toRow: (item) => {
      const event = item.event as MidiChannelEvent;
      return {
        ...baseRow(item),
        channel: event.channel,
        messageType: event.messageType,
        data1: event.data1,
        data2: event.data2,
      };
    },
    columnDefs: [
      ...baseColumns(),
      columnHelper.accessor("channel", { header: "Channel", cell: str }),
      columnHelper.accessor("messageType", {
        header: "Message Type",
        cell: ({ cell }) => ChannelMessage[cell.getValue() as number],
      }),
      columnHelper.accessor("data1", { header: "Data 1", cell: str }),
      columnHelper.accessor("data2", { header: "Data 2", cell: str }),
    ],
  },
  meta: {
    filter: (event) => event.status === 0xff,
    toRow: (item) => {
      const event = item.event as MidiMetaEvent;
      return {
        ...baseRow(item),
        type: event.type,
        length: event.length,
        data: "text" in event ? event.text : event.data,
      };
    },
    columnDefs: [
      ...baseColumns(),
      columnHelper.accessor("type", {
        header: "Type",
        cell: ({ cell }) => String(MetaType[cell.getValue() as number]),
      }),
      columnHelper.accessor("length", { header: "Length", cell: str }),
      columnHelper.accessor("data", { header: "Data", cell: str }),
    ],
  },
  sysex: {
    filter: (event) => event.status === 0xf0 || event.status === 0xf7,
    toRow: (item) => ({
      ...baseRow(item),
      length: (item.event as MidiSysExEvent).data?.length ?? 0,
    }),
    columnDefs: [
      ...baseColumns(),
      columnHelper.accessor("length", { header: "Length", cell: str }),
    ],
  },
};

const eventTypeOptions: DropdownOption[] = (
  Object.keys(eventTypeConfigs) as EventType[]
).map((key) => ({
  label: startCase(key),
  value: key,
}));

interface EventListProps {
  midi: Midi;
}

const EventList = ({ midi }: EventListProps) => {
  const [trackOptions, setTrackOptions] = useState<DropdownOption[]>([]);
  const [selectedTrack, setSelectedTrack] = useState<MidiTrack | null>(null);
  const [selectedTrackName, setSelectedTrackName] = useState(
    midi.tracks[0]?.name ?? "",
  );
  const [eventType, setEventType] = useState<EventType>("channel");
  const config = eventTypeConfigs[eventType];
  const data = useMemo(
    () =>
      (selectedTrack?.getTimedEvents() ?? [])
        .filter(({ event }) => config.filter(event))
        .map((item, i) => ({ id: String(i), ...config.toRow(item) })),
    [selectedTrack, config],
  );

  useEffect(() => {
    setTrackOptions(
      midi.tracks.map((track) => ({ label: track.name, value: track.name })),
    );
  }, [midi]);
  useEffect(() => {
    setSelectedTrack(
      midi.tracks.find((track) => track.name === selectedTrackName) ?? null,
    );
  }, [midi, selectedTrackName]);

  return (
    <Box padding={0} flexDirection="column">
      <Section flexDirection="row" padding={0}>
        <Label justifyContent="right">Track</Label>
        <Dropdown
          options={trackOptions}
          value={selectedTrackName}
          onChange={setSelectedTrackName}
        />
      </Section>
      <Section flexDirection="row" padding={0}>
        <Label justifyContent="right">Event Type</Label>
        <Dropdown
          options={eventTypeOptions}
          value={eventType}
          onChange={(value) => setEventType(value as EventType)}
        />
      </Section>
      <DataTable
        key={`event-list-${eventType}`}
        data={data}
        columnDefs={config.columnDefs}
      />
    </Box>
  );
};

export default EventList;
