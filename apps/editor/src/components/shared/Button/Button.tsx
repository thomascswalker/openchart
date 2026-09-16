import type { ReactNode } from "react";
import classNames from "classnames";
import styles from "./button.module.css";
import type { Size } from "../props";

interface ButtonProps extends React.HTMLAttributes<HTMLButtonElement> {
  disabled?: boolean;
  onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void;
  children?: ReactNode;
}

const Button = ({
  disabled = false,
  onClick = () => {},
  className,
  children,
  ...props
}: ButtonProps) => {
  return (
    <button
      className={
        className
          ? classNames(styles[className])
          : classNames(styles["ui-button"])
      }
      onClick={onClick}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  );
};

interface CloseButtonProps extends ButtonProps {}

const CloseButton = ({ children, onClick, ...props }: CloseButtonProps) => {
  return (
    <Button onClick={onClick} className="ui-button-close" {...props}>
      x
    </Button>
  );
};

export { Button, CloseButton };
export type { ButtonProps, CloseButtonProps };
