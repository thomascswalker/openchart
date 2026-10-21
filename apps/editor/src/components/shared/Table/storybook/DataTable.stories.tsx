import type { Meta, StoryObj } from "@storybook/react-vite";
import DataTable from "../DataTable";
import { startCase } from "es-toolkit";
import { Midi } from "@openchart/core";

const meta = {
  title: "Shared/DataTable",
  component: DataTable,
} satisfies Meta<typeof DataTable>;

export default meta;
type Story = StoryObj<typeof meta>;

const midiChannelEvent = {
  deltaTime: 0,
  status: 0,
  channel: 0,
  messageType: 0,
  data1: 0,
  data2: 0,
};

const makeData = (headers: string[], rowCount: number) => {
  const midi = new Midi();
  const index = midi.addTrack();
  const track = midi.tracks[index];

  let offset = 0;
  function createNote(pitch: number, length: number) {
    track.addNote(pitch, offset, 100, offset + length);
    offset += length;
  }
  const minPitch = 50;
  const maxPitch = 72;
  function getRandomPitch() {
    return Math.floor(Math.random() * (maxPitch - minPitch + 1)) + minPitch;
  }
  for (let i = 0; i < rowCount; i++) {
    createNote(getRandomPitch(), 480);
  }

  return track.events.map((event) => {
    const row: Record<string, string> = {};
    headers.forEach((header) => {
      row[header] = String(event[header as keyof typeof event]) ?? "";
    });
    return row;
  });
};

const getArgs = () => {
  const columns = Object.keys(midiChannelEvent);
  return {
    columns: columns.map((header) => ({
      accessorKey: header,
      header: startCase(header),
    })),
    data: makeData(columns, 15),
  };
};

export const Default: Story = {
  args: getArgs(),
};
