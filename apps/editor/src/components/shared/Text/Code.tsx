import classNames from "classnames";
import type { TextProps } from "./Text";
import { Text } from "./Text";
import styles from "./text.module.css";

type CodeProps = TextProps;

const Code = ({ children, ...props }: CodeProps) => {
  const codeClassName = classNames(styles["ui-text"], styles["ui-code"]);
  return (
    <Text className={codeClassName} {...props}>
      {children}
    </Text>
  );
};

export { Code };
export type { CodeProps };
