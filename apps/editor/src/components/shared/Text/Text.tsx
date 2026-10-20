import classNames from "classnames";
import type {
  TextAlignProps,
  TextColorProps,
  FontWeightProps,
  BorderProps,
  FontSizeProps,
  SizeProps,
  FlexboxProps,
} from "styled-system";
import styles from "./text.module.css";
import { getTextSystemStyles } from "./textStyles";

interface TextProps
  extends
    TextAlignProps,
    FlexboxProps,
    FontSizeProps,
    FontWeightProps,
    TextColorProps,
    BorderProps,
    SizeProps {
  role?: React.AriaRole;
  disabled?: boolean;
  mono?: boolean;
  className?: string;
  children: React.ReactNode;
}

const Text = ({
  disabled = false,
  mono = false,
  className,
  children,
  role,
  ...props
}: TextProps) => {
  const style = getTextSystemStyles(props);
  const textClassName = classNames(
    styles["ui-text"],
    disabled ? styles["ui-text-disabled"] : null,
    mono ? styles["ui-text-mono"] : null,
    className,
  );

  return (
    <span role={role} className={textClassName} style={style}>
      {children}
    </span>
  );
};

export { Text };
export type { TextProps };
