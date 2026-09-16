import type {
  CSSProperties,
  KeyboardEventHandler,
  MouseEventHandler,
  ReactNode,
  RefObject,
} from "react";
import { Section } from "../Section";
import { CloseButton } from "../Button";

import styles from "./modal.module.css";

interface ModalProps {
  children: ReactNode;
  dialogRef?: RefObject<HTMLDivElement | null>;
  onBackdropClick?: MouseEventHandler<HTMLDivElement>;
  onKeyDown?: KeyboardEventHandler<HTMLDivElement>;
  size?: { width: number; height: number; margin?: number };
}

const ModalBackdrop = ({
  children,
  dialogRef,
  onBackdropClick,
  onKeyDown,
  size,
}: ModalProps) => {
  const dialogStyle = size
    ? ({
        "--modal-height": `${size.height}px`,
        "--modal-margin": `${size.margin ?? 32}px`,
        "--modal-width": `${size.width}px`,
      } as CSSProperties)
    : undefined;
  return (
    <div
      className={styles["settings-dialog-backdrop"]}
      onMouseDown={onBackdropClick}
    >
      <div
        ref={dialogRef}
        className={`${styles["settings-dialog"]} ${size ? styles["settings-dialog--fixed"] : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-dialog-title"
        tabIndex={-1}
        onKeyDown={onKeyDown}
        style={dialogStyle}
      >
        {children}
      </div>
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
      <h2 id="settings-dialog-title">{title}</h2>
      <CloseButton onClick={onClick} />
    </Section>
  );
};

const ModalObj = Object.assign(ModalBackdrop, {
  Header: ModalHeader,
});

export { ModalObj as Modal };
