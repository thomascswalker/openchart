import type { ComponentType } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import type { IconProps } from "./Icon";
import {
  BassIcon,
  CursorIcon,
  DrumsIcon,
  EraserIcon,
  FivepadIcon,
  FourpadIcon,
  GuitarIcon,
  Highway3dIcon,
  MagnetIcon,
  NoteIcon,
  PianoIcon,
  VocalsIcon,
} from "./Icon";

const icons: Array<{
  name: string;
  Icon: ComponentType<Omit<IconProps, "svg">>;
}> = [
  { name: "Cursor", Icon: CursorIcon },
  { name: "Eraser", Icon: EraserIcon },
  { name: "Note", Icon: NoteIcon },
  { name: "Magnet", Icon: MagnetIcon },
  { name: "Piano", Icon: PianoIcon },
  { name: "Highway 3D", Icon: Highway3dIcon },
  { name: "Guitar", Icon: GuitarIcon },
  { name: "Four Pad", Icon: FourpadIcon },
  { name: "Five Pad", Icon: FivepadIcon },
  { name: "Bass", Icon: BassIcon },
  { name: "Drums", Icon: DrumsIcon },
  { name: "Vocals", Icon: VocalsIcon },
];

const meta = {
  title: "Shared/Icons",
  parameters: {
    controls: { disable: true },
  },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const Gallery: Story = {
  render: () => (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(110px, 1fr))",
        gap: 16,
      }}
    >
      {icons.map(({ name, Icon }) => (
        <div
          key={name}
          style={{
            display: "grid",
            justifyItems: "center",
            gap: 8,
            padding: 16,
            border: "1px solid var(--neutral-60)",
          }}
        >
          <Icon width={32} height={32} />
          <span>{name}</span>
        </div>
      ))}
    </div>
  ),
};
