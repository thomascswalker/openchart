import classNames from "classnames";
import type {
  TextAlignProps,
  TextColorProps,
  FontWeightProps,
  BorderProps,
  FlexWrapProps,
  FontSizeProps,
} from "styled-system";
import styles from "./text.module.css";
import { getTextSystemStyles } from "./textStyles";

interface TextProps
  extends
    TextAlignProps,
    FontSizeProps,
    FontWeightProps,
    TextColorProps,
    BorderProps,
    FlexWrapProps {
  className?: string;
  children: React.ReactNode;
  role?: React.AriaRole;
}

const Text = ({ className, children, role, ...props }: TextProps) => {
  const style = getTextSystemStyles(props);
  const textClassName = classNames(styles["ui-text"], className);

  return (
    <span className={textClassName} role={role} style={style}>
      {children}
    </span>
  );
};

export { Text };
export type { TextProps };
