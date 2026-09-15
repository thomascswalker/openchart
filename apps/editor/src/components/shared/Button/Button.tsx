import type { ReactNode } from "react";
import classNames from "classnames";
import styles from "./button.module.css";

interface ButtonProps {
  disabled?: boolean;
  onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void;
  children: ReactNode;
}

const Button = ({
  disabled = false,
  onClick = () => {},
  children,
}: ButtonProps) => {
  return (
    <button
      className={classNames(styles.button)}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
};

export { Button };
export type { ButtonProps };
