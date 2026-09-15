import { type ChangeEvent } from "react";
import styles from "./dropdown.module.css";
import classNames from "classnames";

interface Option {
  label: string;
  value?: any;
}

type OnChange = (o: Option | undefined) => void;

interface DropdownProps {
  options?: Option[];
  disabled?: boolean;
  onChange?: OnChange;
}

const Dropdown = ({
  options = [],
  disabled = false,
  onChange,
}: DropdownProps) => {
  const handleOnChange = (e: ChangeEvent | undefined) => {
    if (typeof e === "undefined") {
      return onChange?.(undefined);
    }
  };

  const getOptions = () => {
    return options.map((o) => <option>{o.label}</option>);
  };

  const className = classNames(styles.select);
  return (
    <select onChange={handleOnChange} disabled={disabled} className={className}>
      {getOptions()}
    </select>
  );
};

export { Dropdown };
export type { Option };
