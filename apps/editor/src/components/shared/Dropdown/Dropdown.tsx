import { useEffect, useRef, useState } from "react";
import type { SelectHTMLAttributes } from "react";
import Choices from "choices.js";
import "choices.js/public/assets/styles/choices.css";
import classNames from "classnames";
import styles from "./dropdown.module.css";

export interface DropdownOption {
  value: string;
  label: string;
  disabled?: boolean;
}

interface DropdownProps extends Omit<
  SelectHTMLAttributes<HTMLSelectElement>,
  "children" | "onChange" | "value"
> {
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
  ...selectProps
}: DropdownProps) => {
  const selectRef = useRef<HTMLSelectElement>(null);
  const [choices, setChoices] = useState<Choices | null>(null);

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
    <div className={classNames(styles.dropdown, className)}>
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
