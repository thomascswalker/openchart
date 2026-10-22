import type { Meta, StoryObj } from "@storybook/react-vite";
import EventList from "../EventList";
import {
  addRandomMetaEvents,
  addRandomChannelEvents,
  Midi,
} from "@openchart/midi";

const meta = {
  title: "Editor/Event List",
  component: EventList,
} satisfies Meta<typeof EventList>;

export default meta;
type Story = StoryObj<typeof meta>;

const trackDefs = [
  { name: "GLOBAL", type: "meta" },
  { name: "NOTES", type: "channel" },
];
const makeDefaultMidi = () => {
  const midi = new Midi();

  trackDefs.forEach((def) => {
    const trackIndex = midi.addTrack();
    const track = midi.tracks[trackIndex];
    track.name = def.name;

    switch (def.type) {
      case "meta":
        addRandomMetaEvents(track, 20);
        break;
      case "channel":
        addRandomChannelEvents(track, 20);
        break;
    }
  });

  return midi;
};

export const Default: Story = {
  args: { midi: makeDefaultMidi() },
};
