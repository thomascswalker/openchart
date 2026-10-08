import type {
  CSSProperties,
  KeyboardEventHandler,
  MouseEventHandler,
  ReactNode,
  RefObject,
} from "react";
import { useCallback } from "react";
import { Section } from "../Section";
import { CloseButton } from "../Button";

import styles from "./modal.module.css";
import { H2 } from "../Text";

interface ModalProps {
  children: ReactNode;
  dialogRef?: RefObject<HTMLDivElement | null>;
  onBackdropClick?: MouseEventHandler<HTMLDivElement>;
  onKeyDown?: KeyboardEventHandler<HTMLDivElement>;
  className?: string;
  size?: { width: number; height: number; margin?: number };
}

const ModalBackdrop = ({
  children,
  dialogRef,
  onBackdropClick,
  onKeyDown,
  className,
  size,
}: ModalProps) => {
  const setDialogRef = useCallback(
    (element: HTMLDivElement | null): void => {
      if (dialogRef) dialogRef.current = element;
      element?.focus();
    },
    [dialogRef],
  );
  const dialogStyle = size
    ? ({
        "--modal-height": `${size.height}px`,
        "--modal-margin": `${size.margin ?? 32}px`,
        "--modal-width": `${size.width}px`,
      } as CSSProperties)
    : undefined;
  return (
    <div className={styles["ui-modal-backdrop"]} onMouseDown={onBackdropClick}>
      <div
        ref={setDialogRef}
        className={`${styles["ui-modal"]} ${size ? styles["ui-modal-fixed"] : ""} ${className ?? ""}`}
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
    <Section flexDirection="row" padding="0px" margin="0px">
      <H2>{title}</H2>
      <CloseButton onClick={onClick} />
    </Section>
  );
};

const ModalObj = Object.assign(ModalBackdrop, {
  Header: ModalHeader,
});

export { ModalObj as Modal };
