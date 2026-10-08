import type { ReactNode } from "react";
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
  className?: string;
  children?: ReactNode;
}

const Button = ({
  disabled = false,
  active = false,
  flat = false,
  title,
  ariaLabel,
  onClick = () => {},
  className,
  children,
  ...props
}: ButtonProps) => {
  const style = getSystemStyles(props);
  const buttonClassName: string = classNames(styles["ui-button"], className);

  return (
    <button
      className={classNames(
        buttonClassName,
        active && styles["ui-button-active"],
        flat && styles["ui-button-flat"],
      )}
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
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
