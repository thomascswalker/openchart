import classNames from "classnames";
import type {
  TextAlignProps,
  TextColorProps,
  FontWeightProps,
  BorderProps,
  FlexWrapProps,
} from "styled-system";
import { getTextSystemStyles } from "./textStyles";
import styles from "./text.module.css";

interface TextProps
  extends
    TextAlignProps,
    FontWeightProps,
    TextColorProps,
    BorderProps,
    FlexWrapProps {
  className?: string;
  children: React.ReactNode;
}

const Text = ({ className, children, ...props }: TextProps) => {
  const style = getTextSystemStyles(props);
  const textClassName = classNames(styles["ui-text"], className);

  return (
    <span className={textClassName} style={style}>
      {children}
    </span>
  );
};

export { Text };
export type { TextProps };
