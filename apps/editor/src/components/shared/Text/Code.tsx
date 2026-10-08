import classNames from "classnames";
import { getTextSystemStyles } from "./textStyles";
import type { TextProps } from "./Text";
import * as styles from "./text.module.css";

type CodeProps = TextProps;

const Code = ({ className, children, ...props }: CodeProps) => {
  const style = getTextSystemStyles(props);
  const codeClassName = classNames(
    styles["ui-text"],
    styles["ui-code"],
    className,
  );
  return (
    <code className={codeClassName} style={style}>
      {children}
    </code>
  );
};

export { Code };
export type { CodeProps };
