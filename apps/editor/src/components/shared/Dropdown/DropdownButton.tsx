import { useState } from "react";
import type { ReactNode } from "react";
import "choices.js/public/assets/styles/choices.css";
import { Button } from "../Button";
import styles from "./dropdown.module.css";
import { type DropdownOption, Dropdown } from "./Dropdown";

interface DropdownButtonProps {
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
                }
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

export { DropdownButton };
export type { DropdownButtonProps };
