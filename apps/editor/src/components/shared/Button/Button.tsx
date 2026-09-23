import type { ReactNode } from "react";
import classNames from "classnames";
import { space, color, layout, compose, border } from "styled-system";
import type {
  SpaceProps,
  ColorProps,
  LayoutProps,
  BorderProps,
} from "styled-system";
import styles from "./button.module.css";

interface ButtonProps extends SpaceProps, ColorProps, LayoutProps, BorderProps {
  disabled?: boolean;
  active?: boolean;
  onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void;
  className?: string;
  children?: ReactNode;
}

const systemStyles = compose(space, color, layout, border);

const Button = ({
  disabled = false,
  active = false,
  onClick = () => {},
  className,
  children,
  ...props
}: ButtonProps) => {
  const style = systemStyles(props);

  return (
    <button
      className={classNames(
        className ? styles[className] : styles["ui-button"],
        active && styles["ui-button-active"],
      )}
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      style={style}
    >
      {children}
    </button>
  );
};

type CloseButtonProps = ButtonProps;

const CloseButton = ({ onClick, ...props }: CloseButtonProps) => {
  return (
    <Button onClick={onClick} className="ui-button-close" {...props}>
      x
    </Button>
  );
};

export { Button, CloseButton };
export type { ButtonProps, CloseButtonProps };
