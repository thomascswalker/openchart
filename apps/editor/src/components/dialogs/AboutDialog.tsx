import type { KeyboardEvent } from "react";
import { runAction } from "../../actions/execute";
import { Modal } from "../shared/Modal/Modal";
import { Section } from "../shared/Section";
import { Text } from "../shared/Text";

const AboutDialog = () => {
  const close = (): void => {
    runAction("dialog.close-about");
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
    }
  };

  return (
    <Modal
      onKeyDown={onKeyDown}
      onBackdropClick={(event) => {
        if (event.target === event.currentTarget) close();
      }}
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
