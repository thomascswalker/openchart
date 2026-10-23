import type {
  CSSProperties,
  HTMLAttributes,
  KeyboardEventHandler,
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
import { CloseButton, Section, Text } from "..";
import type { KeyboardEvent, MouseEvent } from "react";
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
  fixedSize?: FixedSize;
  onKeyDown?: KeyboardEventHandler<HTMLDivElement>;
  onEscapeDown?: (event?: KeyboardEvent<HTMLDivElement>) => void;
  onTabDown?: (event?: KeyboardEvent<HTMLDivElement>) => void;
  onBackdropClick?: () => void;
  dialogRef?: RefObject<HTMLDivElement | null>;
  children: ReactNode;
}

const Modal = ({
  fixedSize,
  onKeyDown,
  onEscapeDown,
  onTabDown,
  onBackdropClick,
  className,
  dialogRef,
  children,
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

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    switch (event.key) {
      case "Escape":
        event.preventDefault();
        onEscapeDown?.(event);
        break;
      case "Tab":
        event.preventDefault();
        onTabDown?.(event);
        break;
      default:
        break;
    }
  };

  const handleBackdropClick = (event: MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) {
      onBackdropClick?.();
    }
  };

  return (
    <div
      className={styles["ui-modal-backdrop"]}
      onMouseDown={handleBackdropClick}
    >
      <div
        ref={setDialogRef}
        className={modalClassName}
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-dialog-title"
        tabIndex={-1}
        onKeyDown={handleKeyDown}
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
