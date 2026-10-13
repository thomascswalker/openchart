import Select, {
  type SingleValue,
  type GroupBase,
  type CommonProps,
  components,
  type DropdownIndicatorProps,
} from "react-select";
import { DownIcon } from "../Icon/Icon";

type Option = typeof Option;
type Group = GroupBase<Option>;
type Value = SingleValue<Option>;

interface DropdownProps extends CommonProps<Option, true, Group> {
  value: Value;
  onChange: (value: Value) => void;
}

const DropdownIndicator: React.FC<
  DropdownIndicatorProps<typeof Option, false>
> = (props) => {
  return (
    <components.DropdownIndicator {...props}>
      <DownIcon
        width={16}
        height={16}
        style={{
          transform: props.selectProps.menuIsOpen
            ? "rotate(180deg)"
            : "rotate(0deg)",
          transition: "transform 0.20s ease",
          display: "flex", // Keeps the container centered around the icon
        }}
      />
    </components.DropdownIndicator>
  );
};

const Dropdown = ({ options, value, onChange }: DropdownProps) => {
  return (
    <Select
      defaultValue={value}
      onChange={(value: Value) => onChange?.(value)}
      isClearable={true}
      options={options}
      components={{ DropdownIndicator }}
      styles={{
        control: (base) => ({
          ...base,
          backgroundColor: "var(--primary)",
          border: "none",
        }),
        singleValue: (base) => ({
          ...base,
          color: "white",
          fontFamily: "var(--font-primary)",
          fontSize: "var(--font-size)",
          fontWeight: "var(--font-weight)",
        }),
        placeholder: (base) => ({
          ...base,
          color: "var(--text-disabled)",
          fontFamily: "var(--font-primary)",
          fontSize: "var(--font-size)",
          fontWeight: "var(--font-weight)",
        }),
        menu: (base) => ({
          ...base,
          backgroundColor: "var(--primary)",
          marginTop: 1,
        }),
        option: (base, state) => ({
          ...base,
          backgroundColor: state.isFocused ? "var(--secondary)" : "transparent",
          color: "var(--text-primary)",
          fontFamily: "var(--font-primary)",
          fontSize: "var(--font-size)",
          fontWeight: "var(--font-weight)",
        }),
      }}
    />
  );
};

export { Dropdown };
export type { DropdownProps };
