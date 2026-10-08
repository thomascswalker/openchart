import type { InputHTMLAttributes } from "react";
import classNames from "classnames";
import styles from "./input.module.css";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  className?: string;
}

const defaultInputProps: InputProps = {
  placeholder: "Enter text...",
};

const Input = ({ className, ...props }: InputProps) => {
  const inputClassName = classNames(styles["ui-input"], className);
  const combinedProps = { ...defaultInputProps, ...props };
  return <input type="text" className={inputClassName} {...combinedProps} />;
};

export { Input };
