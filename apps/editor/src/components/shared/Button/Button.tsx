import type { ReactNode } from "react";
import classNames from "classnames";
import styles from "./button.module.css";

interface ButtonProps {
  disabled?: boolean;
  onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void;
  className?: string;
  title?: string;
  children: ReactNode;
}

const Button = ({
  disabled = false,
  onClick = () => {},
  className,
  title,
  children,
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
