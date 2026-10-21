import type { Meta, StoryObj } from "@storybook/react-vite";
import EventList from "../EventList";
import { Midi } from "@openchart/core";

const meta = {
  title: "Editor/Event List",
  component: EventList,
} satisfies Meta<typeof EventList>;

export default meta;
type Story = StoryObj<typeof meta>;

const DefaultMidi = new Midi();
const index = DefaultMidi.addTrack();
const track = DefaultMidi.tracks[index];

let offset = 0;
function createNote(pitch: number, length: number) {
  track.addNote(pitch, offset, 100, offset + length);
  offset += length;
}
createNote(50, 480);
createNote(52, 480);
createNote(53, 480);
createNote(55, 480);
createNote(57, 480);
createNote(58, 480);
createNote(60, 480);
createNote(62, 480);

export const Default: Story = {
  args: { midi: DefaultMidi },
};
