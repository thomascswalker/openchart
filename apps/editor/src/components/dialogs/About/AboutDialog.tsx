import { runAction } from "../../../actions/execute";
import { Modal, Section, Text } from "../../shared";

const AboutDialog = () => {
  const close = (): void => {
    runAction("dialog.close-about");
  };

  return (
    <Modal
      onEscapeDown={close}
      onBackdropClick={close}
      fixedSize={{ width: 420, height: 320 }}
    >
      <Modal.Header title="About" onClick={close} />
      <Modal.Body>
        <Section>
          <Text>Version: {__APP_VERSION__}</Text>
          <Text>
            <a
              href="https://github.com/thomascswalker/openchart"
              target="_blank"
            >
              thomascswalker/openchart
            </a>
          </Text>
        </Section>
      </Modal.Body>
    </Modal>
  );
};

export { AboutDialog };
