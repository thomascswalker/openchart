import { useEditorCommands } from "../commands/EditorCommand";
import { Button } from "./shared/Button";
import { Modal } from "./shared/Modal/Modal";
import { Section } from "./shared/Section";

const AppSettingsDialog = () => {
  const { dispatch } = useEditorCommands();

  return (
    <Modal>
      <Modal.Header
        title="Settings"
        onClick={() => void dispatch("close-settings")}
      />
      <div>blah blah blah</div>
    </Modal>
  );
};

export { AppSettingsDialog };
