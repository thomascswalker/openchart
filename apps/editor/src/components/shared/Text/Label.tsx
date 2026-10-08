import { Text } from "./Text";
import type { TextProps } from "./Text";
import classNames from "classnames";
import styles from "./text.module.css";

type LabelProps = TextProps;

const Label = ({ children, ...props }: LabelProps) => {
  const labelClassName = classNames(styles["ui-text"], styles["ui-label"]);

  return (
    <Text className={labelClassName} {...props}>
      {children}
    </Text>
  );
};

export { Label };
export type { LabelProps };
