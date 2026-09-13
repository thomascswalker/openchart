import * as styles from "./button.module.css";

interface ButtonProps {
  label?: string;
  disabled?: boolean;
  onClick?: () => void;
}

const Button = ({
  label = "",
  disabled = false,
  onClick = () => {},
}: ButtonProps) => {
  return (
    <button style={styles.default} onClick={onClick} disabled={disabled}>
      {label}
    </button>
  );
};

export { Button };
export type { ButtonProps };
