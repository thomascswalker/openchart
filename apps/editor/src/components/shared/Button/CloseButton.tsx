import { Button } from "./Button";
import type { ButtonProps } from "./Button";
import styles from "./button.module.css";

type CloseButtonProps = ButtonProps;

const CloseButton = ({ onClick, ...props }: CloseButtonProps) => {
  return (
    <Button onClick={onClick} className={styles["ui-button-close"]} {...props}>
      x
    </Button>
  );
};

export { CloseButton };
export type { CloseButtonProps };
