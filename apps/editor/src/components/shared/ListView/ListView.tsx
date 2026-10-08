import { useRef, type KeyboardEvent } from "react";
import classNames from "classnames";
import styles from "./listView.module.css";

interface ListViewProps {
  options: readonly string[];
  value: string;
  onChange: (value: string) => void;
  ariaLabel: string;
  id?: string;
  className?: string;
}

const ListView = ({
  options,
  value,
  onChange,
  ariaLabel,
  id,
  className,
}: ListViewProps) => {
  const optionRefs = useRef<Array<HTMLDivElement | null>>([]);
  const selectedIndex = options.indexOf(value);

  const onOptionKeyDown = (
    event: KeyboardEvent<HTMLDivElement>,
    index: number,
  ): void => {
    if (options.length === 0) return;

    const nextIndex =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? options.length - 1
          : event.key === "ArrowDown"
            ? (index + 1) % options.length
            : event.key === "ArrowUp"
              ? (index - 1 + options.length) % options.length
              : -1;

    if (nextIndex < 0) return;
    event.preventDefault();
    onChange(options[nextIndex]);
    optionRefs.current[nextIndex]?.focus();
  };

  return (
    <div
      id={id}
      className={classNames(styles["list-view"], className)}
      role="listbox"
      aria-label={ariaLabel}
      aria-orientation="vertical"
    >
      {options.map((option, index) => (
        <div
          key={`${option}-${index}`}
          ref={(element) => {
            optionRefs.current[index] = element;
          }}
          id={id ? `${id}-option-${index}` : undefined}
          className={styles["list-view-option"]}
          role="option"
          aria-selected={index === selectedIndex}
          tabIndex={index === selectedIndex ? 0 : -1}
          onClick={() => onChange(option)}
          onKeyDown={(event) => onOptionKeyDown(event, index)}
        >
          {option}
        </div>
      ))}
    </div>
  );
};

export { ListView };
export type { ListViewProps };
