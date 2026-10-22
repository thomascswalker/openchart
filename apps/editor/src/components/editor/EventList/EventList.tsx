import {
  ChannelMessage,
  MetaType,
  MidiTrack,
  getStatusString,
  type MidiChannelEvent,
  type MidiMetaEvent,
} from "@openchart/midi";
import { DataTable } from "../../shared/Table";
import { useEffect, useMemo, useState } from "react";
import Box from "../../shared/Box";
import { Text } from "../../shared/Text";
import { Dropdown, type DropdownOption } from "../../shared/Dropdown";
import { createAppColumnHelper } from "../../shared/Table/DataTable";
import { startCase } from "es-toolkit";
import { Label } from "../../shared/Text";
import { Section } from "../../shared/Section";
import { vars } from "../../../util/css";
import { useDocumentSnapshot } from "../../../hooks/useDocumentSnapshot";
import { SongView } from "@openchart/views";
import { useViewportSnapshot } from "../../../hooks/useViewportSnapshot";
import { HorizontalSeparator } from "../../shared/Separator";

type EventType = "channel" | "meta" | "sysex";
type Row = Record<string, any>;
type TimedEvent = ReturnType<MidiTrack["getTimedEvents"]>[number];

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

const baseRow = (event: TimedEvent): Row => ({
  tick: event.tick,
  deltaTime: event.deltaTime,
  status: event.status,
});

// Add a new event type here (and to EventType) to make it selectable.
const eventTypeConfigs: Record<EventType, EventTypeConfig> = {
  channel: {
    filter: (event) => event.status < 0xf0,
    toRow: (item) => {
      const event = item as MidiChannelEvent & { tick: number };
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
      const event = item as MidiMetaEvent & { tick: number };
      const payload = Object.entries(event)
        .filter(
          ([key]) =>
            ![
              "deltaTime",
              "status",
              "type",
              "length",
              "tick",
              "order",
            ].includes(key),
        )
        .map(([key, value]) => `${key}: ${String(value)}`)
        .join(", ");
      return {
        ...baseRow(item),
        type: event.type,
        length: event.length,
        data: payload,
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
      length:
        "length" in item && typeof item.length === "number" ? item.length : 0,
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

const EventList = () => {
  const documentSnapshot = useDocumentSnapshot();
  const { midi } = documentSnapshot;
  const { viewportSessions, activeViewportId } = useViewportSnapshot();
  const view = useMemo(
    () => (midi ? new SongView(midi) : null),
    // A new snapshot is published on every edit, even if midi is mutated in place.
    [midi, documentSnapshot],
  );

  const [selectedTrackName, setSelectedTrackName] = useState<string | null>(
    null,
  );
  useEffect(() => {
    const currentSession = viewportSessions.find(
      (session) => session.id === activeViewportId,
    );
    if (!currentSession) {
      setSelectedTrackName(null);
      return;
    }
    const desc = view?.getTrackDescriptors() ?? [];
    if (!desc.length) {
      setSelectedTrackName(null);
      return;
    }
    const trackDesc = desc.find((d) => d.key === currentSession.trackKey);
    if (!trackDesc) {
      setSelectedTrackName(null);
      return;
    }
    const trackName = midi?.getTrack(trackDesc.name)?.name;
    setSelectedTrackName(trackName ?? null);
  }, [viewportSessions, activeViewportId, midi, view]);

  const [eventType, setEventType] = useState<EventType>("channel");
  const config = eventTypeConfigs[eventType];

  useEffect(() => {
    if (selectedTrackName === null && midi?.tracks[0]?.name) {
      setSelectedTrackName(midi.tracks[0].name);
    }
  }, [selectedTrackName, midi]);

  const selectedTrack = useMemo<MidiTrack | null>(
    () =>
      midi?.tracks.find((track) => track.name === selectedTrackName) ?? null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [midi, selectedTrackName, documentSnapshot],
  );
  const data = useMemo(
    () =>
      (selectedTrack?.getTimedEvents() ?? [])
        .filter((event) => config.filter(event))
        .map((item, i) => ({ id: String(i), ...config.toRow(item) })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedTrack, config, documentSnapshot],
  );

  return (
    <Box
      padding={vars("space-large")}
      paddingBottom={0}
      justifyContent="flex-start"
      gap="0"
      minWidth="400px"
      flex={1}
      flexDirection="column"
      minHeight={0}
    >
      <Section flexDirection="column">
        <Section flexDirection="row" padding={0}>
          <Label justifyContent="left">Event Type:</Label>
          <Dropdown
            options={eventTypeOptions}
            value={eventType}
            onChange={(value) => setEventType(value as EventType)}
          />
        </Section>
        <Section flexDirection="row" padding={0}>
          <Label justifyContent="left">Event Count:</Label>
          <Text>{data.length}</Text>
        </Section>
      </Section>
      <HorizontalSeparator marginTop={vars("space-large")} />
      <DataTable
        key={`event-list-${eventType}`}
        data={data}
        columnDefs={config.columnDefs}
      />
    </Box>
  );
};

export default EventList;
