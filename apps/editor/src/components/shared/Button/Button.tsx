import type { ReactNode } from "react";
import classNames from "classnames";
import styles from "./button.module.css";
import type { StyleProps } from "../props";

interface ButtonProps
  extends React.HTMLAttributes<HTMLButtonElement>, StyleProps {
  disabled?: boolean;
  onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void;
  children?: ReactNode;
}

const Button = ({
  disabled = false,
  onClick = () => {},
  className,
  children,
  style,
  /* layout */
  maxWidth,
  minWidth,
  maxHeight,
  minHeight,
  flexDirection,
  /* align */
  alignItems,
  justifyContent,
  alignSelf,
  justifyItems,
  textAlign,
  gap,
  /* style */
  borderRadius,
  /* other */
  ...props
}: ButtonProps) => {
  const combined = {
    maxWidth,
    minWidth,
    maxHeight,
    minHeight,
    flexDirection,
    alignItems,
    justifyContent,
    alignSelf,
    justifyItems,
    textAlign,
    gap,
    borderRadius,
    ...style,
  };
  return (
    <button
      className={
        className
          ? classNames(styles[className])
          : classNames(styles["ui-button"])
      }
      onClick={onClick}
      disabled={disabled}
      style={combined}
      {...props}
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
