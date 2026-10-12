import { useEffect, useRef, useState } from "react";
import type { SelectHTMLAttributes } from "react";
import Choices from "choices.js";
import "choices.js/public/assets/styles/choices.css";
import classNames from "classnames";
import { compose, layout, size } from "styled-system";
import type { LayoutProps, SizeProps, styleFn } from "styled-system";
import styles from "./dropdown.module.css";

const getSystemStyles: styleFn = compose(size, layout);

export interface DropdownOption {
  value: string;
  label: string;
  disabled?: boolean;
}

interface DropdownProps
  extends
    Omit<
      SelectHTMLAttributes<HTMLSelectElement>,
      "children" | "onChange" | "value" | "size" | keyof LayoutProps
    >,
    SizeProps,
    LayoutProps {
  options: DropdownOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

const Dropdown = ({
  options,
  value,
  onChange,
  placeholder,
  className,
  disabled,
  size: sizeProp,
  width,
  height,
  minWidth,
  minHeight,
  maxWidth,
  maxHeight,
  ...selectProps
}: DropdownProps) => {
  const selectRef = useRef<HTMLSelectElement>(null);
  const [choices, setChoices] = useState<Choices | null>(null);
  const style = getSystemStyles({
    size: sizeProp,
    width,
    height,
    minWidth,
    minHeight,
    maxWidth,
    maxHeight,
  });

  useEffect(() => {
    const select = selectRef.current;
    if (!select) return;

    const choices = new Choices(select, {
      allowHTML: false,
      itemSelectText: "",
      placeholder: Boolean(placeholder),
      searchEnabled: false,
      shouldSort: false,
    });
    setChoices(choices);

    return () => {
      choices.destroy();
    };
  }, [placeholder]);

  useEffect(() => {
    if (!choices) return;

    choices.setChoices(
      options.map((option) => ({
        ...option,
        selected: option.value === value,
      })),
      "value",
      "label",
      true,
      true,
      true,
    );
    if (disabled) choices.disable();
    else choices.enable();
  }, [choices, options, value, disabled]);

  return (
    <div className={classNames(styles.dropdown, className)} style={style}>
      <select
        ref={selectRef}
        value={value}
        disabled={disabled}
        aria-label={selectProps["aria-label"]}
        onChange={(event) => onChange(event.currentTarget.value)}
        {...selectProps}
      >
        {placeholder && (
          <option value="" disabled>
            {placeholder}
          </option>
        )}
        {options.map((option) => (
          <option
            key={option.value}
            value={option.value}
            disabled={option.disabled}
          >
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
};

export { Dropdown };
export type { DropdownProps };
