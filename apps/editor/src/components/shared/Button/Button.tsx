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
import type { IconProps } from "../Icon/Icon";

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

const systemStyles = compose(space, color, layout, border);

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
  const style = systemStyles(props);

  return (
    <button
      className={classNames(
        className ? styles[className] : styles["ui-button"],
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

type CloseButtonProps = ButtonProps;

const CloseButton = ({ onClick, ...props }: CloseButtonProps) => {
  return (
    <Button onClick={onClick} className="ui-button-close" {...props}>
      x
    </Button>
  );
};

interface ToolButtonProps extends ButtonProps {
  Icon: (props: Omit<IconProps, "svg">) => React.JSX.Element;
}

const ToolButton = ({ Icon, children, ...rest }: ToolButtonProps) => {
  return (
    <Button
      maxWidth={40}
      maxHeight={40}
      borderRadius={4}
      border="none"
      {...rest}
    >
      <Icon />
      {children}
    </Button>
  );
};

export { Button, CloseButton, ToolButton };
export type { ButtonProps, CloseButtonProps, ToolButtonProps };
