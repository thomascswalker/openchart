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

    let dropdownMenu: HTMLElement | null = null;
    let dropdownAnchor: HTMLElement | null = null;
    let menuTopOffset = 0;
    let menuLeftOffset = 0;
    let showDropdownFrame = 0;

    const repositionDropdownMenu = () => {
      if (!dropdownMenu || !dropdownAnchor) return;

      const anchorRect = dropdownAnchor.getBoundingClientRect();
      dropdownMenu.style.left = `${anchorRect.left + menuLeftOffset}px`;
      dropdownMenu.style.top = `${anchorRect.top + menuTopOffset}px`;
    };

    const clearDropdownMenuPosition = () => {
      cancelAnimationFrame(showDropdownFrame);
      document.removeEventListener("scroll", repositionDropdownMenu, true);
      window.removeEventListener("resize", repositionDropdownMenu);

      if (dropdownMenu) {
        dropdownMenu.style.position = "";
        dropdownMenu.style.top = "";
        dropdownMenu.style.right = "";
        dropdownMenu.style.bottom = "";
        dropdownMenu.style.left = "";
        dropdownMenu.style.width = "";
      }
      dropdownMenu = null;
      dropdownAnchor = null;
    };

    const handleShowDropdown = () => {
      showDropdownFrame = requestAnimationFrame(() => {
        const choicesContainer = select.closest<HTMLElement>(".choices");
        const menu = choicesContainer?.querySelector<HTMLElement>(
          ".choices__list--dropdown",
        );
        if (!choicesContainer || !menu) return;

        const anchor =
          menu.offsetParent instanceof HTMLElement
            ? menu.offsetParent
            : choicesContainer;
        const hasClippingAncestor = (element: HTMLElement) => {
          for (
            let ancestor = element.parentElement;
            ancestor;
            ancestor = ancestor.parentElement
          ) {
            const { overflowX, overflowY } = getComputedStyle(ancestor);
            if (overflowX !== "visible" || overflowY !== "visible") {
              return true;
            }
          }
          return false;
        };
        if (!hasClippingAncestor(anchor)) return;

        dropdownMenu = menu;
        dropdownAnchor = anchor;

        const menuRect = menu.getBoundingClientRect();
        const anchorRect = anchor.getBoundingClientRect();
        menuTopOffset = menuRect.top - anchorRect.top;
        menuLeftOffset = menuRect.left - anchorRect.left;

        menu.style.position = "fixed";
        menu.style.right = "auto";
        menu.style.bottom = "auto";
        menu.style.width = `${menuRect.width}px`;
        repositionDropdownMenu();

        document.addEventListener("scroll", repositionDropdownMenu, true);
        window.addEventListener("resize", repositionDropdownMenu);
      });
    };

    select.addEventListener("showDropdown", handleShowDropdown);
    select.addEventListener("hideDropdown", clearDropdownMenuPosition);

    const choices = new Choices(select, {
      allowHTML: false,
      itemSelectText: "",
      placeholder: Boolean(placeholder),
      searchEnabled: false,
      shouldSort: false,
    });
    setChoices(choices);

    return () => {
      select.removeEventListener("showDropdown", handleShowDropdown);
      select.removeEventListener("hideDropdown", clearDropdownMenuPosition);
      clearDropdownMenuPosition();
      choices.destroy();
    };
  }, [placeholder]);

  useEffect(() => {
    if (!choices) return;

    choices.setChoices(
      [
        ...(placeholder
          ? [{ value: "", label: placeholder, disabled: true }]
          : []),
        ...options,
      ].map((option) => ({
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
  }, [choices, options, value, placeholder, disabled]);

  return (
    <div className={classNames(styles.dropdown, className)} style={style}>
      <select
        ref={selectRef}
        disabled={disabled}
        aria-label={selectProps["aria-label"]}
        onChange={(event) => onChange(event.currentTarget.value)}
        {...selectProps}
      />
    </div>
  );
};

export { Dropdown };
export type { DropdownProps };
