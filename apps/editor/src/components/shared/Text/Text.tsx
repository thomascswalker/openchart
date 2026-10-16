import classNames from "classnames";
import type {
  TextAlignProps,
  TextColorProps,
  FontWeightProps,
  BorderProps,
  FlexWrapProps,
  FontSizeProps,
  SizeProps,
  VerticalAlignProps,
} from "styled-system";
import styles from "./text.module.css";
import { getTextSystemStyles } from "./textStyles";

interface TextProps
  extends
    TextAlignProps,
    VerticalAlignProps,
    FontSizeProps,
    FontWeightProps,
    TextColorProps,
    BorderProps,
    FlexWrapProps,
    SizeProps {
  role?: React.AriaRole;
  disabled?: boolean;
  className?: string;
  children: React.ReactNode;
}

const Text = ({
  disabled = false,
  className,
  children,
  role,
  ...props
}: TextProps) => {
  const style = getTextSystemStyles(props);
  const textClassName = classNames(
    styles["ui-text"],
    disabled ? styles["ui-text-disabled"] : null,
    className,
  );

  return (
    <span className={textClassName} role={role} style={style}>
      {children}
    </span>
  );
};

export { Text };
export type { TextProps };
