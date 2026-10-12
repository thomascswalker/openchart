import type { KeyboardEventHandler, ReactNode, Ref } from "react";
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

interface ButtonProps extends SpaceProps, ColorProps, LayoutProps, BorderProps {
  disabled?: boolean;
  active?: boolean;
  flat?: boolean;
  title?: string;
  ariaLabel?: string;
  onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void;
  onKeyDown?: KeyboardEventHandler<HTMLButtonElement>;
  type?: "button" | "submit" | "reset";
  id?: string;
  role?: React.AriaRole;
  tabIndex?: number;
  ref?: Ref<HTMLButtonElement>;
  "aria-controls"?: string;
  "aria-expanded"?: boolean;
  "aria-haspopup"?: React.AriaAttributes["aria-haspopup"];
  "aria-selected"?: boolean;
  "data-popup-trigger"?: string;
  className?: string;
  children?: ReactNode;
}

const Button = ({
  disabled = false,
  active = false,
  flat = false,
  title,
  ariaLabel,
  onKeyDown,
  type = "button",
  id,
  role,
  tabIndex,
  ref,
  "aria-controls": ariaControls,
  "aria-expanded": ariaExpanded,
  "aria-haspopup": ariaHasPopup,
  "aria-selected": ariaSelected,
  "data-popup-trigger": dataPopupTrigger,
  onClick = () => {},
  className,
  children,
  ...props
}: ButtonProps) => {
  const style = getSystemStyles(props);
  const buttonClassName: string = classNames(styles["ui-button"], className);

  return (
    <button
      ref={ref}
      className={classNames(
        buttonClassName,
        active && styles["ui-button-active"],
        flat && styles["ui-button-flat"],
      )}
      onClick={onClick}
      onKeyDown={onKeyDown}
      disabled={disabled}
      type={type}
      id={id}
      role={role}
      tabIndex={tabIndex}
      aria-pressed={active}
      aria-controls={ariaControls}
      aria-expanded={ariaExpanded}
      aria-haspopup={ariaHasPopup}
      aria-selected={ariaSelected}
      data-popup-trigger={dataPopupTrigger}
      title={title}
      aria-label={ariaLabel}
      style={style}
    >
      {children}
    </button>
  );
};

export { Button };
export type { ButtonProps };
