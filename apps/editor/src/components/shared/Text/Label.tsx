import type { TextProps } from "./";
import classNames from "classnames";
import styles from "./text.module.css";
import { getTextSystemStyles } from "./textStyles";

interface LabelProps extends TextProps {
  htmlFor?: string;
}

const Label = ({ children, className, htmlFor, ...props }: LabelProps) => {
  const style = getTextSystemStyles(props);
  const labelClassName = classNames(
    styles["ui-text"],
    styles["ui-label"],
    className,
  );

  return (
    <label className={labelClassName} htmlFor={htmlFor} style={style}>
      {children}
    </label>
  );
};

export { Label };
export type { LabelProps };
