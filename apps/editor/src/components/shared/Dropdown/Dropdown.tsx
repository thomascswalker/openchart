import { useEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode, SelectHTMLAttributes } from "react";
import Choices from "choices.js";
import "choices.js/public/assets/styles/choices.css";
import classNames from "classnames";
import { Button } from "../Button";
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
  const choicesRef = useRef<Choices | null>(null);

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
    choicesRef.current = choices;

    return () => {
      choices.destroy();
      choicesRef.current = null;
    };
  }, [placeholder]);

  useEffect(() => {
    const choices = choicesRef.current;
    if (!choices) return;

    choices.setChoices(
      options.map((option) => ({ ...option, selected: false })),
      "value",
      "label",
      true,
      true,
      true,
    );
    if (disabled) choices.disable();
    else choices.enable();
  }, [options, disabled]);

  useEffect(() => {
    choicesRef.current?.setChoiceByValue(value);
  }, [value]);

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

export interface DropdownButtonProps {
  label: string;
  options: DropdownOption[];
  value: string;
  onChange: (value: string) => void;
  active?: boolean;
  defaultActive?: boolean;
  onToggle?: (active: boolean) => void;
  disabled?: boolean;
  dropdownDisabled?: boolean;
  dropdownWidth?: number | string;
  icon?: ReactNode;
  ariaLabel?: string;
}

const DropdownButton = ({
  label,
  options,
  value,
  onChange,
  active,
  defaultActive = false,
  onToggle,
  disabled = false,
  dropdownDisabled = false,
  dropdownWidth,
  icon,
  ariaLabel,
}: DropdownButtonProps) => {
  const [internalActive, setInternalActive] = useState(defaultActive);
  const isActive = active ?? internalActive;
  const selectedLabel =
    options.find((option) => option.value === value)?.label ?? value;

  const toggle = () => {
    const nextActive = !isActive;
    if (active === undefined) setInternalActive(nextActive);
    onToggle?.(nextActive);
  };

  return (
    <div
      className={styles["dropdown-button"]}
      style={
        {
          minWidth: dropdownWidth,
          maxWidth: Number(dropdownWidth) + 50,
          border: "none",
        } as CSSProperties
      }
    >
      <Button
        maxHeight={40}
        borderRadius={4}
        borderTopRightRadius={0}
        borderBottomRightRadius={0}
        border="none"
        className={styles["dropdown-button__value"]}
        active={isActive}
        disabled={disabled}
        ariaLabel={ariaLabel ?? label}
        onClick={toggle}
      >
        {icon}
        <span>{selectedLabel}</span>
      </Button>
      <Dropdown
        aria-label={`${label} options`}
        options={options}
        value={value}
        onChange={onChange}
        disabled={disabled || dropdownDisabled}
        className={styles["dropdown-button__select"]}
      />
    </div>
  );
};

export { Dropdown, DropdownButton };
export type { DropdownProps };
