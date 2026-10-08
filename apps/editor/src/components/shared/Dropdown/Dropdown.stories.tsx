import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Dropdown, type DropdownOption, type DropdownProps } from "./Dropdown";
import { DropdownButton } from "./DropdownButton";

const options: DropdownOption[] = [
  { value: "piano", label: "Piano" },
  { value: "guitar", label: "Guitar" },
  { value: "drums", label: "Drums" },
];

const meta = {
  title: "Shared/Dropdowns",
  component: Dropdown,
  args: {
    options,
    value: "piano",
    onChange: () => {},
    "aria-label": "Instrument",
  },
} satisfies Meta<typeof Dropdown>;

export default meta;
type Story = StoryObj<typeof meta>;

const ControlledDropdown = (args: DropdownProps) => {
  const [value, setValue] = useState(args.value);
  return <Dropdown {...args} value={value} onChange={setValue} />;
};

const ControlledDropdownButton = () => {
  const [value, setValue] = useState("piano");
  return (
    <DropdownButton
      label="Instrument"
      options={options}
      value={value}
      onChange={setValue}
      onToggle={(active) => console.info("Dropdown button active:", active)}
    />
  );
};

export const Default: Story = {
  render: (args) => <ControlledDropdown {...args} />,
};

export const Disabled: Story = {
  args: { disabled: true },
};

export const DropdownButtonExample: Story = {
  render: () => <ControlledDropdownButton />,
};
