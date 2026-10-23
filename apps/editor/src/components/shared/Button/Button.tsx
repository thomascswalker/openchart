import {
  useState,
  type AriaAttributes,
  type MouseEvent,
  type ReactNode,
  type Ref,
} from "react";
import classNames from "classnames";
import { space, color, layout, compose, border } from "styled-system";
import type {
  SpaceProps,
  ColorProps,
  LayoutProps,
  BorderProps,
  styleFn,
} from "styled-system";
import styles from "./button.module.css";
import { RemoveIcon } from "..";

const getSystemStyles: styleFn = compose(space, color, layout, border);

type OnClickHandler = MouseEvent<HTMLButtonElement>;

type AriaProps = Pick<
  AriaAttributes,
  | "aria-label"
  | "aria-controls"
  | "aria-expanded"
  | "aria-haspopup"
  | "aria-selected"
>;

type HTMLButtonProps = Pick<
  React.ButtonHTMLAttributes<HTMLButtonElement>,
  | "type"
  | "disabled"
  | "onClick"
  | "onKeyDown"
  | "onPointerDown"
  | "id"
  | "role"
  | "className"
>;
type StyleProps = SpaceProps & ColorProps & LayoutProps & BorderProps;

interface CheckableProps {
  checked?: boolean;
  checkable?: boolean;
  defaultChecked?: boolean;
  onChecked?: (state: boolean) => void;
}

interface ButtonProps
  extends HTMLButtonProps, CheckableProps, StyleProps, AriaProps {
  flat?: boolean;
  icon?: ReactNode;
  title?: string;
  tabIndex?: number;
  ref?: Ref<HTMLButtonElement>;
  "data-command"?: string;
  "data-popup-trigger"?: string;
  children?: ReactNode;
}

const Button = ({
  id,
  role,
  tabIndex,
  ref,
  title,
  disabled = false,
  checked = undefined,
  defaultChecked = false,
  checkable = false,
  flat = false,
  icon = undefined,
  onKeyDown = undefined,
  onPointerDown = undefined,
  onClick = undefined,
  onChecked = undefined,
  type = "button",
  "aria-label": ariaLabel,
  "aria-controls": ariaControls,
  "aria-expanded": ariaExpanded,
  "aria-haspopup": ariaHasPopup,
  "aria-selected": ariaSelected,
  "data-command": dataCommand,
  "data-popup-trigger": dataPopupTrigger,
  className,
  children,
  ...props
}: ButtonProps) => {
  /* Internal checked state */
  const isControlled = checked !== undefined;
  const isCheckable = checkable || isControlled;
  const [internalChecked, setInternalChecked] =
    useState<boolean>(defaultChecked);

  const isChecked = isControlled ? checked : internalChecked;

  // If `checked` is passed in, we assume that the check state is handled
  // externally.
  const handleOnClick = (event: OnClickHandler) => {
    onClick?.(event);
    if (!isCheckable) {
      return;
    }

    const newChecked = !isChecked;
    if (!isControlled) {
      setInternalChecked(newChecked);
    }
    onChecked?.(newChecked);
  };

  /* Filtered system style */
  const style = getSystemStyles(props);

  /* Joined class name */
  const buttonClassName: string = classNames(
    styles["ui-button"],
    isCheckable && isChecked && styles["ui-button-checked"],
    className,
    icon &&
      (children
        ? styles["ui-button-icon-label"]
        : styles["ui-button-icon-only"]),
    flat && styles["ui-button-flat"],
  );

  return (
    <button
      ref={ref}
      className={buttonClassName}
      onClick={handleOnClick}
      onKeyDown={onKeyDown}
      disabled={disabled}
      type={type}
      id={id}
      role={role}
      title={title}
      tabIndex={tabIndex}
      onPointerDown={onPointerDown}
      aria-pressed={checked}
      aria-controls={ariaControls}
      aria-expanded={ariaExpanded}
      aria-haspopup={ariaHasPopup}
      aria-selected={ariaSelected}
      data-command={dataCommand}
      data-popup-trigger={dataPopupTrigger}
      aria-label={ariaLabel}
      style={style}
    >
      {icon}
      {children}
    </button>
  );
};

interface CloseButtonProps extends Omit<ButtonProps, "size"> {
  size?: number;
}

const CloseButton = ({
  size = 16,
  onClick,
  disabled = false,
  ...props
}: CloseButtonProps) => {
  return (
    <Button
      onClick={onClick}
      flat={true}
      icon={<RemoveIcon size={size} disabled={disabled} />}
      className={styles["ui-button-close"]}
      disabled={disabled}
      {...props}
    />
  );
};

export { Button, CloseButton };
export type { ButtonProps, CloseButtonProps };
