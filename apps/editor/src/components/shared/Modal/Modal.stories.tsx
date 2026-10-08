import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button } from "../Button/Button";
import { Modal } from "./Modal";
import { Text, Label } from "../Text";
import { Section } from "../Section";

const meta = {
  title: "Shared/Modal",
  component: Modal,
  parameters: {
    layout: "fullscreen",
  },
} satisfies Meta<typeof Modal>;

export default meta;
type Story = StoryObj<typeof meta>;

const ModalExample = () => {
  const [open, setOpen] = useState(true);

  return (
    <>
      {!open && <Button onClick={() => setOpen(true)}>Open modal</Button>}
      {open && (
        <Modal
          onBackdropClick={(event) => {
            if (event.target === event.currentTarget) setOpen(false);
          }}
        >
          <Modal.Header title="Example dialog" onClick={() => setOpen(false)} />
          <Section className="settings-panel">
            <Label>
              Project name
              <input defaultValue="Untitled project" />
            </Label>
            <Text>This example shows the dialog with a form control.</Text>
          </Section>
        </Modal>
      )}
    </>
  );
};

export const OpenAndClose: Story = {
  args: { children: null },
  render: () => <ModalExample />,
};
