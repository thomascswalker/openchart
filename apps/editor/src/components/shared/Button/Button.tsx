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
  "type" | "disabled" | "onClick" | "onKeyDown" | "id" | "role" | "className"
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
  title?: string;
  tabIndex?: number;
  ref?: Ref<HTMLButtonElement>;
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
  onKeyDown = undefined,
  onClick = undefined,
  onChecked = undefined,
  type = "button",
  "aria-label": ariaLabel,
  "aria-controls": ariaControls,
  "aria-expanded": ariaExpanded,
  "aria-haspopup": ariaHasPopup,
  "aria-selected": ariaSelected,
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
    flat && styles["ui-button-flat"],
    className,
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
      tabIndex={tabIndex}
      aria-pressed={checked}
      aria-controls={ariaControls}
      aria-expanded={ariaExpanded}
      aria-haspopup={ariaHasPopup}
      aria-selected={ariaSelected}
      data-popup-trigger={dataPopupTrigger}
      aria-label={ariaLabel}
      style={style}
    >
      {children}
    </button>
  );
};

export { Button };
export type { ButtonProps };
