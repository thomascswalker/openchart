import type { ReactNode } from "react";
import classNames from "classnames";
import styles from "./button.module.css";

interface ButtonProps {
  disabled?: boolean;
  onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void;
  children: ReactNode;
  className?: string;
  title?: string;
}

const Button = ({
  disabled = false,
  onClick = () => {},
  children,
  className,
  title,
}: ButtonProps) => {
  return (
    <button
      className={classNames(styles.button, className)}
      onClick={onClick}
      disabled={disabled}
      title={title}
    >
      {children}
    </button>
  );
};

export { Button };
export type { ButtonProps };
