import type { Meta, StoryObj } from "@storybook/react-vite";
import { PianoRollStoryHost } from "./storybook/PianoRollStoryHost";

const meta = {
  title: "Views/Piano Roll",
  component: PianoRollStoryHost,
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component: `
The actual Three.js piano-roll view backed by an in-memory MIDI chart. Changes
are local to this story mount and are discarded when it is remounted. Click an
empty roll area to seek, or drag there to create a note; drag a note to move it
and its right edge to resize it. Right-drag to select and middle-drag to pan.
Use the mouse wheel or trackpad to zoom/pan. Focus the canvas before using
Delete, arrow keys, C, X, V, or F; Storybook may otherwise handle shortcuts.
`,
      },
    },
  },
} satisfies Meta<typeof PianoRollStoryHost>;

export default meta;
type Story = StoryObj<typeof meta>;

export const PopulatedEditable: Story = {
  args: { variant: "populated", initialTrackIndex: 1 },
};

export const EmptyChart: Story = {
  args: { variant: "empty", initialTrackIndex: 1 },
};

export const AlternateTrack: Story = {
  args: { variant: "populated", initialTrackIndex: 2 },
};

export const DenseTempoChange: Story = {
  args: { variant: "dense", initialTrackIndex: 1 },
};
