import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button } from "../Button/Button";
import { Modal } from "./Modal";

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
          <div className="settings-panel">
            <label>
              Project name
              <input defaultValue="Untitled project" />
            </label>
            <p>This example shows the dialog with a form control.</p>
          </div>
        </Modal>
      )}
    </>
  );
};

export const OpenAndClose: Story = {
  args: { children: null },
  render: () => <ModalExample />,
};
