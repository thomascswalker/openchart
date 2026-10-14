import type { KeyboardEvent } from "react";
import { runAction } from "../../actions/execute";
import { REPOSITORY_NAME } from "../../util/appInfo";
import { Button } from "../shared/Button";
import { Modal } from "../shared/Modal/Modal";
import { Section } from "../shared/Section";
import { Text } from "../shared/Text";
import styles from "./AboutDialog.module.css";

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
      className={styles.dialog}
      onKeyDown={onKeyDown}
      onBackdropClick={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <Modal.Header title="About" onClick={close} />
      <Section className={styles.body} data-testid="about-repo-name">
        <Text className={styles.repo}>{REPOSITORY_NAME}</Text>
      </Section>
      <Section
        className={styles.actions}
        flexDirection="row"
        alignItems="center"
        justifyContent="flex-end"
      >
        <Button onClick={close}>Close</Button>
      </Section>
    </Modal>
  );
};

export { AboutDialog };
