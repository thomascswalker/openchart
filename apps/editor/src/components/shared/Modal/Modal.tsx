import type {
  CSSProperties,
  HTMLAttributes,
  KeyboardEventHandler,
  MouseEventHandler,
  ReactNode,
  RefObject,
} from "react";
import { useCallback } from "react";
import classNames from "classnames";
import {
  border,
  color,
  compose,
  flexbox,
  layout,
  space,
  type BorderProps,
  type ColorProps,
  type FlexboxProps,
  type LayoutProps,
  type SpaceProps,
  type styleFn,
} from "styled-system";
import { Section } from "../Section";
import { CloseButton } from "../Button";
import { Text } from "../Text";

import styles from "./modal.module.css";

const getSystemStyles: styleFn = compose(space, color, layout, border, flexbox);

type SystemProps = SpaceProps &
  ColorProps &
  LayoutProps &
  BorderProps &
  FlexboxProps;

interface ModalHeaderProps {
  title: string;
  onClick: () => void;
}

const ModalHeader = ({ title, onClick }: ModalHeaderProps) => {
  const headerClassName = classNames(styles["ui-modal-header"]);
  return (
    <Section
      flexDirection="row"
      padding="6px 12px"
      paddingRight="6px"
      margin="0px"
      alignItems="center"
      className={headerClassName}
    >
      <Text fontWeight="600">{title}</Text>
      <CloseButton size={20} onClick={onClick} />
    </Section>
  );
};

interface ModalBodyProps {
  children: ReactNode;
}

const ModalBody = ({ children }: ModalBodyProps) => {
  return <div className={styles["ui-modal-body"]}>{children}</div>;
};

interface FixedSize {
  width: number;
  height: number;
}

type ModalStyle = CSSProperties & {
  "--modal-width"?: string;
  "--modal-height"?: string;
};

interface ModalProps
  extends
    Omit<HTMLAttributes<HTMLDivElement>, keyof SystemProps | "style">,
    Omit<SystemProps, "size"> {
  children: ReactNode;
  dialogRef?: RefObject<HTMLDivElement | null>;
  onBackdropClick?: MouseEventHandler<HTMLDivElement>;
  onKeyDown?: KeyboardEventHandler<HTMLDivElement>;
  fixedSize?: FixedSize;
}

const Modal = ({
  children,
  dialogRef,
  onBackdropClick,
  onKeyDown,
  className,
  fixedSize,
  ...props
}: ModalProps) => {
  const setDialogRef = useCallback(
    (element: HTMLDivElement | null): void => {
      if (dialogRef) dialogRef.current = element;
      element?.focus();
    },
    [dialogRef],
  );
  const modalStyle: ModalStyle = {
    ...getSystemStyles(props),
    ...(fixedSize && {
      "--modal-width": `${fixedSize.width}px`,
      "--modal-height": `${fixedSize.height}px`,
    }),
  };
  const modalClassName = classNames(
    styles["ui-modal"],
    fixedSize && styles["ui-modal-fixed"],
    className,
  );
  return (
    <div className={styles["ui-modal-backdrop"]} onMouseDown={onBackdropClick}>
      <div
        ref={setDialogRef}
        className={modalClassName}
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-dialog-title"
        tabIndex={-1}
        onKeyDown={onKeyDown}
        style={modalStyle}
      >
        {children}
      </div>
    </div>
  );
};

const _Modal = Object.assign(Modal, {
  Header: ModalHeader,
  Body: ModalBody,
});

export { _Modal as Modal };
