import { Dropdown, type DropdownProps } from './Dropdown';

export type EnumObject = Record<string, string | number>;

export interface DropdownEnumProps<T extends EnumObject> extends Omit<
  DropdownProps,
  'options' | 'value' | 'onChange'
> {
  obj: T;
  value: T[keyof T];
  onChange: (value: T[keyof T]) => void;
  labels?: Partial<Record<T[keyof T], string>>;
}

export const DropdownEnum = <T extends EnumObject>({
  obj,
  value,
  onChange,
  labels,
  ...props
}: DropdownEnumProps<T>) => {
  const entries = Object.entries(obj).filter(([key]) =>
    Number.isNaN(Number(key)),
  );
  const options = entries.map(([key, val]) => ({
    label: labels?.[val as T[keyof T]] ?? key,
    value: String(val),
  }));

  const handleChange = (rawValue: string) => {
    // Match against the original enum value to preserve number types
    const matched = entries.find(([, val]) => String(val) === rawValue);
    if (matched) {
      onChange(matched[1] as T[keyof T]);
    }
  };

  return (
    <Dropdown
      options={options}
      value={String(value)}
      onChange={handleChange}
      {...props}
    />
  );
};
