import type { InputHTMLAttributes } from "react";
import classNames from "classnames";
import { space, color, layout, compose, border } from "styled-system";
import type {
  SpaceProps,
  ColorProps,
  LayoutProps,
  BorderProps,
  styleFn,
} from "styled-system";
import { Text } from "../Text/Text";
import styles from "./checkbox.module.css";

const getSystemStyles: styleFn = compose(space, color, layout, border);
const systemPropNames = new Set(getSystemStyles.propNames ?? []);

type SystemProps = SpaceProps & ColorProps & LayoutProps & BorderProps;
type CheckboxProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  keyof SystemProps
> &
  SystemProps & { label?: string };

const Checkbox = ({
  className,
  label,
  style: inlineStyle,
  ...props
}: CheckboxProps) => {
  const style = { ...getSystemStyles(props), ...inlineStyle };
  const htmlProps = Object.fromEntries(
    Object.entries(props).filter(
      ([propName]) => !systemPropNames.has(propName),
    ),
  );
  const checkboxClassName = classNames(styles["ui-checkbox"], className);

  return (
    <label className={styles["ui-checkbox-label"]}>
      <input
        {...htmlProps}
        type="checkbox"
        className={checkboxClassName}
        style={style}
      />
      {label && <Text>{label}</Text>}
    </label>
  );
};

export { Checkbox };
export type { CheckboxProps };
