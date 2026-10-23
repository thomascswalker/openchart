import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button, Label, Modal, Section, Text } from "..";

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

  const close = () => {
    setOpen(false);
  };

  return (
    <>
      {!open && <Button onClick={() => setOpen(true)}>Open modal</Button>}
      {open && (
        <Modal onBackdropClick={close}>
          <Modal.Header title="Example dialog" onClick={close} />
          <Modal.Body>
            <Section>
              <Label>
                Project name
                <input defaultValue="Untitled project" />
              </Label>
              <Text>This example shows the dialog with a form control.</Text>
            </Section>
          </Modal.Body>
        </Modal>
      )}
    </>
  );
};

export const OpenAndClose: Story = {
  args: { children: null },
  render: () => <ModalExample />,
};
