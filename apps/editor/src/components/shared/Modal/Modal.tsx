import type { ReactNode } from "react";
import { Section } from "../Section";
import { Button, CloseButton } from "../Button";

import styles from "./modal.module.css";

const ModalBackdrop = ({ children }: { children: ReactNode }) => {
  return (
    <div className={styles["settings-dialog-backdrop"]} role="presentation">
      <div className={styles["settings-dialog"]}>{children}</div>
    </div>
  );
};

interface ModalHeaderProps {
  title: string;
  onClick: () => void;
}

const ModalHeader = ({ title, onClick }: ModalHeaderProps) => {
  return (
    <Section direction="row" padding={"0"} margin={"0"}>
      <h2>{title}</h2>
      <CloseButton onClick={onClick} />
    </Section>
  );
};

const ModalObj = Object.assign(ModalBackdrop, {
  Header: ModalHeader,
});

export { ModalObj as Modal };
