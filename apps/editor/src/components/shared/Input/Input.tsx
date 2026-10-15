import type { InputHTMLAttributes } from "react";
import classNames from "classnames";
import styles from "./input.module.css";
import { Button } from "../Button";
import {
  border,
  color,
  compose,
  layout,
  space,
  type BorderProps,
  type ColorProps,
  type LayoutProps,
  type SpaceProps,
  type styleFn,
} from "styled-system";

const getSystemStyles: styleFn = compose(space, color, layout, border);
const systemPropNames = new Set(getSystemStyles.propNames ?? []);

type StyleProps = SpaceProps & ColorProps & LayoutProps & BorderProps;
type InputProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  keyof StyleProps
> &
  StyleProps;

const defaultInputProps: Pick<InputProps, "type" | "placeholder"> = {
  type: "text",
  placeholder: "Enter text...",
};

const Input = ({ className, ...props }: InputProps) => {
  const inputProps = { ...defaultInputProps, ...props };
  const style = getSystemStyles(inputProps);
  const htmlProps = Object.fromEntries(
    Object.entries(inputProps).filter(
      ([propName]) => !systemPropNames.has(propName),
    ),
  );
  const inputClassName = classNames(styles["ui-input"], className);
  return <input {...htmlProps} className={inputClassName} style={style} />;
};

const FileInput = ({ ...props }: InputProps) => {
  const size = "var(--size-med)";
  return (
    <div style={{ display: "flex" }}>
      <Input
        borderTopRightRadius={0}
        borderBottomRightRadius={0}
        borderRightColor="transparent"
        {...props}
      />
      <Button
        minHeight={size}
        minWidth={size}
        maxHeight={size}
        maxWidth={size}
        border="1px solid transparent"
        borderTopLeftRadius={0}
        borderBottomLeftRadius={0}
      >
        F
      </Button>
    </div>
  );
};

export { Input, FileInput };
